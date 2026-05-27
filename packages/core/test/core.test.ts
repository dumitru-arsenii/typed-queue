import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import * as publicApi from "../src/index.js";
import {
  JobInputValidationError,
  createArchiveKey,
  createTypedQueue,
  defineJob,
  formatArchiveDay,
  normalizeEnqueueOptions
} from "../src/index.js";
import type {
  InferJobInput,
  InferJobOutput,
  JobState,
  RedisQueueStorageClient
} from "../src/index.js";

const emailJob = defineJob({
  name: "email.send",
  input: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string()
  }),
  output: z.object({
    messageId: z.string()
  }),
  options: {
    attempts: 5,
    concurrency: 10,
    deadLetterQueue: true,
    archive: {
      strategy: "daily"
    }
  },
  handler: async ({ input }) => ({
    messageId: `message:${input.to}`
  })
});

class TestRedisClient implements RedisQueueStorageClient {
  readonly isOpen = true;
  readonly #hashes = new Map<string, Map<string, string>>();

  async connect(): Promise<void> {}

  async hSet(key: string, field: string, value: string): Promise<number> {
    let hash = this.#hashes.get(key);

    if (!hash) {
      hash = new Map();
      this.#hashes.set(key, hash);
    }

    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    return this.#hashes.get(key)?.get(field) ?? null;
  }

  async hVals(key: string): Promise<string[]> {
    return [...(this.#hashes.get(key)?.values() ?? [])];
  }

  async hDel(key: string, field: string): Promise<number> {
    const deleted = this.#hashes.get(key)?.delete(field) ?? false;
    return deleted ? 1 : 0;
  }
}

function createTestRedisOptions() {
  return {
    client: new TestRedisClient(),
    connect: false
  };
}

describe("@typed-queue/core", () => {
  it("defines a Zod-first job and preserves metadata", () => {
    expect(emailJob.name).toBe("email.send");
    expect(emailJob.options?.attempts).toBe(5);
    expect(emailJob.input.parse({
      to: "user@example.com",
      subject: "Hello",
      body: "Message"
    })).toEqual({
      to: "user@example.com",
      subject: "Hello",
      body: "Message"
    });
  });

  it("infers input and output types from schemas", () => {
    expectTypeOf<InferJobInput<typeof emailJob>>().toEqualTypeOf<{
      to: string;
      subject: string;
      body: string;
    }>();
    expectTypeOf<InferJobOutput<typeof emailJob>>().toEqualTypeOf<{
      messageId: string;
    }>();
  });

  it("validates valid input while enqueueing", async () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    const queue = createTypedQueue({
      jobs: [emailJob],
      redis: createTestRedisOptions(),
      now: () => now,
      idGenerator: () => "job-1"
    });

    const receipt = await queue.enqueue("email.send", {
      to: "user@example.com",
      subject: "Hello",
      body: "Message"
    });
    const job = await queue.jobs.get(receipt.id);

    expect(receipt).toEqual({ id: "job-1" });
    expect(job).toMatchObject({
      id: "job-1",
      name: "email.send",
      status: "enqueued",
      retries: {
        attempts: 0,
        maxAttempts: 5,
        remaining: 5
      },
      input: {
        to: "user@example.com",
        subject: "Hello",
        body: "Message"
      }
    });
  });

  it("lets a bound job enqueue and query records of its own type", async () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    const welcomeJob = defineJob({
      name: "email.welcome",
      input: z.object({
        to: z.string().email(),
        segment: z.string()
      }),
      options: {
        archive: {
          strategy: "daily"
        }
      },
      handler: async ({ input }) => ({
        deliveredTo: input.to
      })
    });
    const queue = createTypedQueue({
      jobs: [welcomeJob],
      redis: createTestRedisOptions(),
      now: () => now,
      idGenerator: () => `welcome-${Math.random()}`
    });

    await welcomeJob.enqueue({
      to: "a@example.com",
      segment: "trial"
    });
    await welcomeJob.enqueue({
      to: "b@example.com",
      segment: "paid"
    });

    await expect(
      welcomeJob.registered({
        criteria: {
          input: {
            segment: "trial"
          }
        }
      }),
    ).resolves.toHaveLength(1);

    await queue.createWorker({ concurrency: 2 }).processOnce();

    const [archived] = await welcomeJob.archived({
      day: "2026-05-27",
      criteria: {
        input: (payload) => payload.segment === "paid"
      }
    });

    expect(archived).toMatchObject({
      status: "archived",
      input: {
        to: "b@example.com",
        segment: "paid"
      },
      output: {
        deliveredTo: "b@example.com"
      }
    });
  });

  it("rejects invalid input while enqueueing", async () => {
    const queue = createTypedQueue({
      jobs: [emailJob],
      redis: createTestRedisOptions(),
      idGenerator: () => "job-1"
    });

    await expect(
      queue.enqueue("email.send", {
        to: "not-an-email",
        subject: "Hello",
        body: "Message"
      }),
    ).rejects.toBeInstanceOf(JobInputValidationError);
  });

  it("normalizes enqueue options and converts readyAt to delayMs", () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    const readyAt = new Date("2026-05-27T10:01:30.000Z");

    expect(
      normalizeEnqueueOptions({
        now,
        options: {
          id: "custom-id",
          readyAt,
          priority: 50,
          attempts: 3,
          metadata: { source: "test" },
          correlationId: "correlation-1",
          traceId: "trace-1"
        }
      }),
    ).toMatchObject({
      id: "custom-id",
      readyAt,
      delayMs: 90_000,
      state: "delayed",
      priority: 50,
      attempts: 3,
      metadata: { source: "test" },
      correlationId: "correlation-1",
      traceId: "trace-1"
    });
  });

  it("keeps the public job state model available as a type", () => {
    const states = [
      "enqueued",
      "delayed",
      "ready",
      "active",
      "completed",
      "failed",
      "dead-letter",
      "archived"
    ] satisfies JobState[];

    expect(states).toContain("dead-letter");
  });

  it("records failed job metadata after retry exhaustion", async () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    const failingJob = defineJob({
      name: "report.fail",
      input: z.object({ id: z.string() }),
      options: { attempts: 1 },
      handler: async () => {
        throw new Error("boom");
      }
    });
    const queue = createTypedQueue({
      jobs: [failingJob],
      redis: createTestRedisOptions(),
      now: () => now,
      idGenerator: () => "failed-job"
    });

    await queue.enqueue("report.fail", { id: "r1" });
    const [result] = await queue.createWorker().processOnce();
    const stored = await queue.jobs.get("failed-job");

    expect(result?.state).toBe("failed");
    expect(stored).toMatchObject({
      status: "failed",
      retries: {
        attempts: 1,
        maxAttempts: 1,
        remaining: 0
      },
      input: { id: "r1" },
      error: {
        name: "Error",
        message: "boom",
        type: "handler"
      }
    });
  });

  it("records dead-letter metadata when enabled", async () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    const dlqJob = defineJob({
      name: "report.dlq",
      input: z.object({ id: z.string() }),
      options: {
        attempts: 1,
        deadLetterQueue: true
      },
      handler: async () => {
        throw new Error("send failed");
      }
    });
    const queue = createTypedQueue({
      jobs: [dlqJob],
      redis: createTestRedisOptions(),
      now: () => now,
      idGenerator: () => "dlq-job"
    });

    await queue.enqueue("report.dlq", { id: "r1" }, {
      correlationId: "correlation-1",
      traceId: "trace-1"
    });
    const [result] = await queue.createWorker().processOnce();
    const stored = await queue.jobs.get("dlq-job");

    expect(result?.state).toBe("dead-letter");
    expect(stored).toMatchObject({
      status: "dead-letter",
      input: { id: "r1" },
      retries: {
        attempts: 1,
        maxAttempts: 1,
        remaining: 0
      },
      correlationId: "correlation-1",
      traceId: "trace-1",
      error: {
        message: "send failed",
        type: "handler"
      }
    });
  });

  it("queries dead-letter jobs by type through the active-record API", async () => {
    const dlqJob = defineJob({
      name: "invoice.dlq",
      input: z.object({ id: z.string() }),
      options: {
        attempts: 1,
        deadLetterQueue: true
      },
      handler: async () => {
        throw new Error("invoice failed");
      }
    });
    const queue = createTypedQueue({
      jobs: [dlqJob],
      redis: createTestRedisOptions(),
      idGenerator: () => "invoice-dlq"
    });

    await dlqJob.enqueue({ id: "invoice-1" });
    await queue.createWorker().processOnce();

    await expect(dlqJob.deadLetter()).resolves.toHaveLength(1);
  });

  it("archives completed jobs when daily archives are enabled", async () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    const queue = createTypedQueue({
      jobs: [emailJob],
      redis: createTestRedisOptions(),
      now: () => now,
      idGenerator: () => "archive-job"
    });

    await queue.enqueue("email.send", {
      to: "user@example.com",
      subject: "Hello",
      body: "Message"
    });
    await queue.createWorker().processOnce();

    await expect(
      queue.jobs.list({
        queue: "email.send",
        state: "archived",
        day: "2026-05-27"
      }),
    ).resolves.toHaveLength(1);
  });

  it("removes registered jobs and clears archive buckets", async () => {
    const now = new Date("2026-05-27T10:00:00.000Z");
    let nextId = 0;
    const archiveJob = defineJob({
      name: "archive.cleanup",
      input: z.object({ id: z.string() }),
      options: {
        archive: {
          strategy: "daily"
        }
      },
      handler: async ({ input }) => input
    });
    const queue = createTypedQueue({
      jobs: [archiveJob],
      redis: createTestRedisOptions(),
      now: () => now,
      idGenerator: () => `archive-${++nextId}`
    });

    const removable = await archiveJob.enqueue({ id: "registered" });
    await expect(queue.jobs.remove(removable.id)).resolves.toMatchObject({
      id: removable.id,
      status: "enqueued",
      input: { id: "registered" }
    });

    await archiveJob.enqueue({ id: "archived" });
    await queue.createWorker().processOnce();

    await expect(
      queue.jobs.clearArchive({
        queue: "archive.cleanup",
        day: "2026-05-27"
      }),
    ).resolves.toHaveLength(1);
    await expect(archiveJob.archived({ day: "2026-05-27" })).resolves.toHaveLength(0);
  });

  it("formats archive days and keys", () => {
    const day = formatArchiveDay(new Date("2026-05-27T23:59:59.000Z"));

    expect(day).toBe("2026-05-27");
    expect(createArchiveKey(day)).toBe("archive:2026-05-27");
  });

  it("exports the intended public API from index.ts", () => {
    expect(publicApi).toMatchObject({
      createTypedQueue: expect.any(Function),
      createRedisQueueStorage: expect.any(Function),
      defineJob: expect.any(Function),
      createTypedQueueWorker: expect.any(Function),
      JobRegistry: expect.any(Function),
      RedisQueueStorage: expect.any(Function),
      JobInputValidationError: expect.any(Function),
      formatArchiveDay: expect.any(Function),
      createDeadLetterMetadata: expect.any(Function),
      matchesJobListOptions: expect.any(Function),
      toJobEnvelope: expect.any(Function)
    });
  });
});
