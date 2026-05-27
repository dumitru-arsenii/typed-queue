import { formatArchiveDay } from "./archive.js";
import { JobNotFoundError } from "./errors.js";
import type {
  BackoffOptions,
  EnqueueOptions,
  JobEnvelope,
  JobOptions,
  JobRecord,
  ListJobsOptions,
  NormalizedEnqueueOptions,
  QueueStorage
} from "./types.js";

export interface NormalizeEnqueueOptionsInput {
  readonly options?: EnqueueOptions;
  readonly jobOptions?: JobOptions;
  readonly now?: Date;
}

export function normalizeEnqueueOptions({
  options,
  jobOptions,
  now = new Date()
}: NormalizeEnqueueOptionsInput = {}): NormalizedEnqueueOptions {
  const readyAt = options?.readyAt ?? now;
  const delayMs = Math.max(0, readyAt.getTime() - now.getTime());
  const attempts = Math.max(1, options?.attempts ?? jobOptions?.attempts ?? 1);

  return {
    id: options?.id,
    readyAt,
    delayMs,
    state: delayMs > 0 ? "delayed" : "enqueued",
    priority: options?.priority ?? 0,
    attempts,
    backoff: options?.backoff ?? jobOptions?.backoff,
    metadata: options?.metadata,
    correlationId: options?.correlationId,
    traceId: options?.traceId
  };
}

export function calculateBackoffMs(
  backoff: BackoffOptions | undefined,
  attempt: number,
): number {
  if (!backoff) {
    return 0;
  }

  if (backoff.strategy === "fixed") {
    return backoff.delayMs;
  }

  const delay = backoff.delayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, backoff.maxDelayMs ?? delay);
}

function matchesObjectCriteria(
  value: unknown,
  criteria: Record<string, unknown> | undefined,
): boolean {
  if (!criteria) {
    return true;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const source = value as Record<string, unknown>;
  return Object.entries(criteria).every(([key, expected]) =>
    Object.is(source[key], expected),
  );
}

function matchesPayloadCriteria<TPayload>(
  payload: unknown,
  criteria: ListJobsOptions<TPayload>["criteria"],
): boolean {
  const payloadCriteria = criteria?.input ?? criteria?.payload;

  if (!payloadCriteria) {
    return true;
  }

  if (typeof payloadCriteria === "function") {
    return payloadCriteria(payload as TPayload);
  }

  return matchesObjectCriteria(payload, payloadCriteria as Record<string, unknown>);
}

export function matchesJobListOptions<TPayload = unknown>(
  job: JobRecord,
  options: ListJobsOptions<TPayload> = {},
): boolean {
  const criteria = options.criteria;
  const stateCriteria = criteria?.state;
  const stateMatchesCriteria = Array.isArray(stateCriteria)
    ? stateCriteria.includes(job.state)
    : !stateCriteria || job.state === stateCriteria;

  if (options.queue && job.name !== options.queue) {
    return false;
  }

  if (options.state && job.state !== options.state) {
    return false;
  }

  if (options.states && !options.states.includes(job.state)) {
    return false;
  }

  if (options.day && job.archiveDay !== options.day) {
    return false;
  }

  if (criteria?.id && job.id !== criteria.id) {
    return false;
  }

  if (!stateMatchesCriteria) {
    return false;
  }

  if (criteria?.day && job.archiveDay !== criteria.day) {
    return false;
  }

  if (criteria?.correlationId && job.correlationId !== criteria.correlationId) {
    return false;
  }

  if (criteria?.traceId && job.traceId !== criteria.traceId) {
    return false;
  }

  if (!matchesObjectCriteria(job.metadata, criteria?.metadata)) {
    return false;
  }

  if (!matchesPayloadCriteria(job.payload, criteria)) {
    return false;
  }

  if (criteria?.createdAfter && job.createdAt < criteria.createdAfter) {
    return false;
  }

  if (criteria?.createdBefore && job.createdAt > criteria.createdBefore) {
    return false;
  }

  if (criteria?.readyAfter && job.readyAt < criteria.readyAfter) {
    return false;
  }

  if (criteria?.readyBefore && job.readyAt > criteria.readyBefore) {
    return false;
  }

  if (criteria?.updatedAfter && job.updatedAt < criteria.updatedAfter) {
    return false;
  }

  if (criteria?.updatedBefore && job.updatedAt > criteria.updatedBefore) {
    return false;
  }

  return true;
}

export function cloneJobRecord<TPayload, TResult>(
  record: JobRecord<TPayload, TResult>,
): JobRecord<TPayload, TResult> {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    readyAt: new Date(record.readyAt),
    startedAt: record.startedAt ? new Date(record.startedAt) : undefined,
    completedAt: record.completedAt ? new Date(record.completedAt) : undefined,
    failedAt: record.failedAt ? new Date(record.failedAt) : undefined,
    archivedAt: record.archivedAt ? new Date(record.archivedAt) : undefined,
    errors: [...record.errors],
    failed: record.failed
      ? {
          ...record.failed,
          failedAt: new Date(record.failed.failedAt)
        }
      : undefined,
    deadLetter: record.deadLetter
      ? {
          ...record.deadLetter,
          failedAt: new Date(record.deadLetter.failedAt),
          movedAt: new Date(record.deadLetter.movedAt)
        }
      : undefined
  };
}

export function toJobEnvelope<TInput = unknown, TOutput = unknown>(
  record: JobRecord<TInput, TOutput>,
): JobEnvelope<TInput, TOutput> {
  const latestError = record.failed?.error ?? record.errors.at(-1);

  return {
    id: record.id,
    name: record.name,
    status: record.state,
    retries: {
      attempts: record.attempts,
      maxAttempts: record.maxAttempts,
      remaining: Math.max(0, record.maxAttempts - record.attempts)
    },
    input: record.payload,
    output: record.result,
    error: latestError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    readyAt: record.readyAt,
    archivedAt: record.archivedAt,
    archiveDay: record.archiveDay,
    durationMs: record.durationMs,
    metadata: record.metadata,
    correlationId: record.correlationId,
    traceId: record.traceId
  };
}

export function markJobArchived(job: JobRecord, archivedAt: Date): JobRecord {
  return {
    ...job,
    state: "archived",
    archivedAt,
    archiveDay: formatArchiveDay(archivedAt),
    updatedAt: archivedAt
  };
}

export async function requireJob(
  storage: QueueStorage,
  id: string,
): Promise<JobRecord> {
  const job = await storage.get(id);

  if (!job) {
    throw new JobNotFoundError(id);
  }

  return job;
}
