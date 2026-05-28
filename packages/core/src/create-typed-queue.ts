import { JobInputValidationError, JobNotFoundError } from "./errors.js";
import { bindJobToQueue } from "./define-job.js";
import { createJobsIntrospection } from "./introspection.js";
import { normalizeEnqueueOptions } from "./queue.js";
import { createRedisQueueStorage } from "./redis-storage.js";
import { JobRegistry } from "./registry.js";
import { createTypedQueueWorker } from "./worker.js";
import type {
  AnyTypedQueueJob,
  CreateTypedQueueOptions,
  EnqueueOptions,
  JobDispatchReceipt,
  JobRecord,
  TypedQueue,
  WorkerOptions
} from "./types.js";

function defaultIdGenerator(jobName: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${jobName}:${Date.now()}:${random}`;
}

export function createTypedQueue<
  const TJobs extends readonly AnyTypedQueueJob[] = readonly AnyTypedQueueJob[],
>(options: CreateTypedQueueOptions<TJobs>): TypedQueue<TJobs> {
  const clock = options.now ?? (() => new Date());
  const queueRef: { current?: TypedQueue<TJobs> } = {};
  const registry = new JobRegistry<TJobs>([], (job) => {
    if (queueRef.current) {
      bindJobToQueue(job, queueRef.current, enqueueJob);
    }
  });
  const storage = createRedisQueueStorage(options.redis);
  const idGenerator = options.idGenerator ?? defaultIdGenerator;

  async function enqueueJob(
    name: string,
    input: unknown,
    enqueueOptions?: EnqueueOptions,
  ): Promise<JobDispatchReceipt> {
    const definition = registry.get(name);

    if (!definition) {
      throw new JobNotFoundError(name);
    }

    const parsed = definition.input.safeParse(input);

    if (!parsed.success) {
      throw new JobInputValidationError(definition.name, parsed.error);
    }

    const now = clock();
    const normalized = normalizeEnqueueOptions({
      options: enqueueOptions,
      jobOptions: definition.options,
      now
    });
    const id = normalized.id ?? idGenerator(definition.name);
    const record: JobRecord<unknown> = {
      id,
      name: definition.name,
      payload: parsed.data,
      state: normalized.state,
      attempts: 0,
      maxAttempts: normalized.attempts,
      priority: normalized.priority,
      createdAt: now,
      updatedAt: now,
      readyAt: normalized.readyAt,
      delayMs: normalized.delayMs,
      backoff: normalized.backoff,
      metadata: normalized.metadata,
      correlationId: normalized.correlationId,
      traceId: normalized.traceId,
      errors: []
    };

    await storage.add(record);
    return { id };
  }

  const queue: TypedQueue<TJobs> = {
    registry,
    storage,
    clock,
    jobs: createJobsIntrospection(storage, clock),

    createWorker<TContext = unknown>(workerOptions?: WorkerOptions<TContext>) {
      return createTypedQueueWorker(queue, workerOptions);
    }
  };

  queueRef.current = queue;

  for (const job of options.jobs ?? []) {
    registry.register(job);
  }

  return queue;
}
