import { createClient } from "redis";
import { TypedQueueError } from "./errors.js";
import {
  cloneJobRecord,
  matchesJobListOptions
} from "./queue.js";
import type {
  JobRecord,
  ListJobsOptions,
  QueueStorage,
  RedisQueueStorageClient,
  RedisQueueStorageOptions
} from "./types.js";

const dateFields = [
  "createdAt",
  "updatedAt",
  "readyAt",
  "startedAt",
  "completedAt",
  "failedAt",
  "archivedAt"
] as const;

function requireRedisOptions(
  options: RedisQueueStorageOptions | undefined,
): RedisQueueStorageOptions {
  if (!options || typeof options !== "object") {
    throw new TypedQueueError(
      "Redis configuration is required. Pass redis: { client } or redis: { options }.",
    );
  }

  const hasClient = "client" in options && Boolean(options.client);
  const hasOptions = "options" in options && Boolean(options.options);

  if (hasClient === hasOptions) {
    throw new TypedQueueError(
      "Redis configuration must include exactly one of `client` or `options`.",
    );
  }

  return options;
}

function createRedisClient(options: RedisQueueStorageOptions): RedisQueueStorageClient {
  if ("client" in options && options.client) {
    return options.client;
  }

  if ("options" in options && options.options) {
    return createClient(options.options) as unknown as RedisQueueStorageClient;
  }

  throw new TypedQueueError(
    "Redis configuration must include exactly one of `client` or `options`.",
  );
}

function reviveJobRecord(value: string): JobRecord {
  const record = JSON.parse(value) as JobRecord;

  for (const field of dateFields) {
    const dateValue = record[field];

    if (dateValue) {
      (record as unknown as Record<string, unknown>)[field] = new Date(dateValue);
    }
  }

  if (record.failed) {
    (record.failed as unknown as Record<string, unknown>).failedAt = new Date(
      record.failed.failedAt,
    );
  }

  if (record.deadLetter) {
    (record.deadLetter as unknown as Record<string, unknown>).failedAt = new Date(
      record.deadLetter.failedAt,
    );
    (record.deadLetter as unknown as Record<string, unknown>).movedAt = new Date(
      record.deadLetter.movedAt,
    );
  }

  return record;
}

function sortJobRecords(left: JobRecord, right: JobRecord): number {
  const createdDelta = left.createdAt.getTime() - right.createdAt.getTime();

  if (createdDelta !== 0) {
    return createdDelta;
  }

  return left.id.localeCompare(right.id);
}

function sortClaimableJobs(left: JobRecord, right: JobRecord): number {
  const priorityDelta = right.priority - left.priority;

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const readyDelta = left.readyAt.getTime() - right.readyAt.getTime();

  if (readyDelta !== 0) {
    return readyDelta;
  }

  return sortJobRecords(left, right);
}

export class RedisQueueStorage implements QueueStorage {
  readonly #client: RedisQueueStorageClient;
  readonly #jobsKey: string;
  readonly #connect: boolean;
  #connected?: Promise<void>;

  constructor(options: RedisQueueStorageOptions) {
    const redisOptions = requireRedisOptions(options);
    const keyPrefix = redisOptions.keyPrefix ?? "typed-queue";

    this.#client = createRedisClient(redisOptions);
    this.#jobsKey = `${keyPrefix}:jobs`;
    this.#connect = redisOptions.connect ?? true;
  }

  async #ready(): Promise<RedisQueueStorageClient> {
    if (!this.#connect || this.#client.isOpen || this.#client.isReady) {
      return this.#client;
    }

    this.#connected ??= this.#client.connect?.().then(() => undefined) ??
      Promise.resolve();
    await this.#connected;
    return this.#client;
  }

  async #readAll(): Promise<JobRecord[]> {
    const client = await this.#ready();
    return (await client.hVals(this.#jobsKey)).map(reviveJobRecord);
  }

  async add<TPayload, TResult>(
    record: JobRecord<TPayload, TResult>,
  ): Promise<void> {
    const client = await this.#ready();
    const existing = await client.hGet(this.#jobsKey, record.id);

    if (existing) {
      throw new TypedQueueError(`Job "${record.id}" already exists.`);
    }

    await client.hSet(this.#jobsKey, record.id, JSON.stringify(record));
  }

  async get(id: string): Promise<JobRecord | undefined> {
    const client = await this.#ready();
    const value = await client.hGet(this.#jobsKey, id);
    return value ? cloneJobRecord(reviveJobRecord(value)) : undefined;
  }

  async list(options: ListJobsOptions = {}): Promise<JobRecord[]> {
    const offset = Math.max(0, options.offset ?? 0);
    const limit =
      options.limit === undefined ? undefined : Math.max(0, options.limit);
    const jobs = (await this.#readAll())
      .filter((job) => matchesJobListOptions(job, options))
      .sort(sortJobRecords);
    const sliced =
      limit === undefined ? jobs.slice(offset) : jobs.slice(offset, offset + limit);

    return sliced.map(cloneJobRecord);
  }

  async update(
    id: string,
    updater: (record: JobRecord) => JobRecord,
  ): Promise<JobRecord | undefined> {
    const client = await this.#ready();
    const current = await client.hGet(this.#jobsKey, id);

    if (!current) {
      return undefined;
    }

    const next = updater(cloneJobRecord(reviveJobRecord(current)));
    await client.hSet(this.#jobsKey, id, JSON.stringify(next));
    return cloneJobRecord(next);
  }

  async delete(id: string): Promise<JobRecord | undefined> {
    const client = await this.#ready();
    const current = await client.hGet(this.#jobsKey, id);

    if (!current) {
      return undefined;
    }

    await client.hDel(this.#jobsKey, id);
    return cloneJobRecord(reviveJobRecord(current));
  }

  async deleteWhere(options: ListJobsOptions = {}): Promise<JobRecord[]> {
    const client = await this.#ready();
    const deleted = (await this.#readAll())
      .filter((job) => matchesJobListOptions(job, options))
      .sort(sortJobRecords);

    await Promise.all(deleted.map((job) => client.hDel(this.#jobsKey, job.id)));
    return deleted.map(cloneJobRecord);
  }

  async claimReady(options: {
    readonly now: Date;
    readonly limit: number;
    readonly queue?: string;
  }): Promise<JobRecord[]> {
    const client = await this.#ready();
    const limit = Math.max(0, options.limit);
    const jobs = (await this.#readAll())
      .filter((job) => {
        if (options.queue && job.name !== options.queue) {
          return false;
        }

        if (job.state !== "enqueued" && job.state !== "delayed") {
          return false;
        }

        return job.readyAt.getTime() <= options.now.getTime();
      })
      .sort(sortClaimableJobs)
      .slice(0, limit);

    const claimed = jobs.map((job) => ({
      ...job,
      state: "active" as const,
      attempts: job.attempts + 1,
      startedAt: options.now,
      updatedAt: options.now
    }));

    await Promise.all(
      claimed.map((job) => client.hSet(this.#jobsKey, job.id, JSON.stringify(job))),
    );

    return claimed.map(cloneJobRecord);
  }
}

export function createRedisQueueStorage(
  options: RedisQueueStorageOptions,
): RedisQueueStorage {
  return new RedisQueueStorage(options);
}
