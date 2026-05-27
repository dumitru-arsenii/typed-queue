import { formatArchiveDay } from "./archive.js";
import { createDeadLetterMetadata } from "./dlq.js";
import { JobInputValidationError, JobOutputValidationError, toJobErrorDetails } from "./errors.js";
import { calculateBackoffMs } from "./queue.js";
import type {
  AnyTypedQueueJob,
  JobErrorDetails,
  JobRecord,
  TypedQueue,
  TypedQueueWorker,
  WorkerOptions,
  WorkerProcessResult
} from "./types.js";

async function runJobHook(
  hook: ((job: JobRecord) => unknown) | undefined,
  job: JobRecord,
): Promise<void> {
  await hook?.(job);
}

async function runFailureHook(
  hook: ((job: JobRecord, error: JobErrorDetails) => unknown) | undefined,
  job: JobRecord,
  error: JobErrorDetails,
): Promise<void> {
  await hook?.(job, error);
}

export function createTypedQueueWorker<TContext = unknown>(
  queue: TypedQueue,
  options: WorkerOptions<TContext> = {},
): TypedQueueWorker {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = true;
  let activeRun: Promise<void> | undefined;

  const processOne = async (job: JobRecord): Promise<WorkerProcessResult> => {
    const definition = queue.registry
      .list()
      .find((candidate) => candidate.name === job.name) as AnyTypedQueueJob | undefined;

    if (!definition) {
      const now = queue.clock();
      const error = toJobErrorDetails(
        new Error(`No definition is registered for job "${job.name}".`),
        "unknown-job",
      );
      const failed = await queue.storage.update(job.id, (current) => ({
        ...current,
        state: "failed",
        failedAt: now,
        failed: {
          attempts: current.attempts,
          error,
          failedAt: now
        },
        errors: [...current.errors, error],
        updatedAt: now
      }));

      return { job: failed ?? job, state: "failed", error };
    }

    await runJobHook(options.onJobStart, job);
    const startedAt = job.startedAt ?? queue.clock();

    try {
      const parsedInput = definition.input.safeParse(job.payload);

      if (!parsedInput.success) {
        throw new JobInputValidationError(definition.name, parsedInput.error);
      }

      const output = await definition.handler({
        input: parsedInput.data,
        ctx: options.ctx,
        job,
        attempt: job.attempts,
        signal: options.signal
      });

      const parsedOutput = definition.output?.safeParse(output);

      if (parsedOutput && !parsedOutput.success) {
        throw new JobOutputValidationError(definition.name, parsedOutput.error);
      }

      const now = queue.clock();
      const durationMs = Math.max(0, now.getTime() - startedAt.getTime());
      const shouldArchive = definition.options?.archive?.strategy === "daily";
      const completed = await queue.storage.update(job.id, (current) => ({
        ...current,
        state: shouldArchive ? "archived" : "completed",
        result: parsedOutput ? parsedOutput.data : output,
        completedAt: now,
        archivedAt: shouldArchive ? now : undefined,
        archiveDay: shouldArchive ? formatArchiveDay(now) : undefined,
        durationMs,
        updatedAt: now
      }));
      const next = completed ?? job;

      await runJobHook(options.onJobSuccess, next);
      return { job: next, state: next.state };
    } catch (unknownError) {
      const now = queue.clock();
      const error = toJobErrorDetails(unknownError, "handler");
      const canRetry = job.attempts < job.maxAttempts;

      if (canRetry) {
        const delayMs = calculateBackoffMs(job.backoff, job.attempts);
        const readyAt = new Date(now.getTime() + delayMs);
        const retried = await queue.storage.update(job.id, (current) => ({
          ...current,
          state: delayMs > 0 ? "delayed" : "enqueued",
          readyAt,
          delayMs,
          failedAt: now,
          errors: [...current.errors, error],
          updatedAt: now
        }));
        const next = retried ?? job;

        await runFailureHook(options.onJobFailure, next, error);
        return { job: next, state: next.state, error };
      }

      const shouldDeadLetter = definition.options?.deadLetterQueue === true;
      const failed = await queue.storage.update(job.id, (current) => ({
        ...current,
        state: shouldDeadLetter ? "dead-letter" : "failed",
        failedAt: now,
        failed: {
          attempts: current.attempts,
          error,
          failedAt: now
        },
        deadLetter: shouldDeadLetter
          ? createDeadLetterMetadata(current, error, now)
          : undefined,
        errors: [...current.errors, error],
        updatedAt: now
      }));
      const next = failed ?? job;

      await runFailureHook(options.onJobFailure, next, error);

      if (shouldDeadLetter) {
        await runJobHook(options.onJobDeadLetter, next);
      }

      return { job: next, state: next.state, error };
    }
  };

  const processOnce = async (): Promise<WorkerProcessResult[]> => {
    const now = queue.clock();
    const concurrency = Math.max(1, options.concurrency ?? 1);
    const jobs = await queue.storage.claimReady({
      now,
      limit: concurrency,
      queue: options.queue
    });

    return Promise.all(jobs.map((job) => processOne(job)));
  };

  const loop = async (): Promise<void> => {
    if (stopped) {
      return;
    }

    activeRun = processOnce().then(() => undefined);
    await activeRun;

    if (!stopped) {
      timer = setTimeout(loop, options.pollIntervalMs ?? 1_000);
    }
  };

  return {
    processOnce,
    start() {
      if (!stopped) {
        return;
      }

      stopped = false;
      void loop();
    },
    async stop() {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
      }

      await activeRun;
    }
  };
}
