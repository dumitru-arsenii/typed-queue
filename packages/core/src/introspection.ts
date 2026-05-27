import { formatArchiveDay } from "./archive.js";
import { createDeadLetterMetadata } from "./dlq.js";
import { TypedQueueError, toJobErrorDetails } from "./errors.js";
import { requireJob, toJobEnvelope } from "./queue.js";
import type {
  ArchiveDay,
  Clock,
  EnqueueOptions,
  JobEnvelope,
  JobErrorDetails,
  JobsIntrospection,
  ListJobsOptions,
  QueueStorage
} from "./types.js";

const registeredStates = [
  "enqueued",
  "delayed",
  "ready",
  "active",
  "completed",
  "failed"
] as const;

export function createJobsIntrospection(
  storage: QueueStorage,
  clock: Clock,
): JobsIntrospection {
  return {
    list(options?: ListJobsOptions) {
      return storage.list(options).then((jobs) => jobs.map(toJobEnvelope));
    },

    registered(options?: ListJobsOptions) {
      const requestedStates = options?.state
        ? [options.state]
        : options?.states;
      const states = requestedStates
        ? requestedStates.filter((state) => registeredStates.includes(state as never))
        : registeredStates;

      return storage.list({
        ...options,
        state: undefined,
        states
      }).then((jobs) => jobs.map(toJobEnvelope));
    },

    archived(options?: ListJobsOptions) {
      return storage.list({
        ...options,
        state: "archived",
        states: undefined
      }).then((jobs) => jobs.map(toJobEnvelope));
    },

    deadLetter(options?: ListJobsOptions) {
      return storage.list({
        ...options,
        state: "dead-letter",
        states: undefined
      }).then((jobs) => jobs.map(toJobEnvelope));
    },

    async get(id: string) {
      const job = await storage.get(id);
      return job ? toJobEnvelope(job) : undefined;
    },

    async retry(
      id: string,
      options?: Pick<EnqueueOptions, "readyAt">,
    ): Promise<JobEnvelope> {
      await requireJob(storage, id);
      const now = clock();
      const readyAt = options?.readyAt ?? now;

      const next = await storage.update(id, (job) => ({
        ...job,
        state: readyAt.getTime() > now.getTime() ? "delayed" : "enqueued",
        attempts: 0,
        readyAt,
        delayMs: Math.max(0, readyAt.getTime() - now.getTime()),
        failedAt: undefined,
        failed: undefined,
        deadLetter: undefined,
        updatedAt: now
      }));

      return toJobEnvelope(next!);
    },

    async moveToDeadLetter(
      id: string,
      reason?: JobErrorDetails,
    ): Promise<JobEnvelope> {
      const job = await requireJob(storage, id);
      const now = clock();
      const error =
        reason ??
        toJobErrorDetails(
          new Error(`Job "${job.id}" was manually moved to the dead-letter queue.`),
          "handler",
        );

      const next = await storage.update(id, (current) => ({
        ...current,
        state: "dead-letter",
        failedAt: now,
        failed: {
          attempts: current.attempts,
          error,
          failedAt: now
        },
        deadLetter: createDeadLetterMetadata(current, error, now),
        errors: [...current.errors, error],
        updatedAt: now
      }));

      return toJobEnvelope(next!);
    },

    async archive(id: string, day?: ArchiveDay): Promise<JobEnvelope> {
      await requireJob(storage, id);
      const now = clock();
      const archiveDay = day ?? formatArchiveDay(now);

      const next = await storage.update(id, (job) => ({
        ...job,
        state: "archived",
        archiveDay,
        archivedAt: now,
        updatedAt: now
      }));

      return toJobEnvelope(next!);
    },

    async remove(id: string): Promise<JobEnvelope> {
      const job = await requireJob(storage, id);

      if (job.state === "active") {
        throw new TypedQueueError(`Active job "${id}" cannot be removed.`);
      }

      const removed = await storage.delete(id);
      return toJobEnvelope(removed!);
    },

    async clearArchive(options = {}): Promise<JobEnvelope[]> {
      const removed = await storage.deleteWhere({
        queue: options.queue,
        state: "archived",
        day: options.day
      });
      return removed.map(toJobEnvelope);
    }
  };
}
