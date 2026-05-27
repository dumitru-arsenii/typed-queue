import type {
  AnyOutputSchema,
  EnqueueOptions,
  JobDefinitionConfig,
  JobDispatchReceipt,
  JobEnvelope,
  JobScopedCriteria,
  JobMetadata,
  TypedQueue,
  TypedQueueJobDefinition
} from "./types.js";
import { TypedQueueError } from "./errors.js";
import type { z } from "zod";

const jobBindings = new WeakMap<object, TypedQueue>();

function requireBoundQueue(job: object, jobName: string): TypedQueue {
  const queue = jobBindings.get(job);

  if (!queue) {
    throw new TypedQueueError(
      `Job "${jobName}" is not attached to a typed queue. Pass it to createTypedQueue({ redis, jobs: [...] }) before using active-record methods.`,
    );
  }

  return queue;
}

function withJobName<TInput>(
  name: string,
  criteria: JobScopedCriteria<TInput> | undefined,
) {
  return {
    ...criteria,
    queue: name
  };
}

export function bindJobToQueue(job: object, queue: TypedQueue): void {
  jobBindings.set(job, queue);
}

export function defineJob<
  const TName extends string,
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends AnyOutputSchema = undefined,
  TContext = unknown,
  TMetadata extends JobMetadata = JobMetadata,
>(
  config: JobDefinitionConfig<
    TName,
    TInputSchema,
    TOutputSchema,
    TContext,
    TMetadata
  >,
): TypedQueueJobDefinition<
  TName,
  TInputSchema,
  TOutputSchema,
  TContext,
  TMetadata
> {
  type TInput = z.output<TInputSchema>;
  type TOutput = TOutputSchema extends z.ZodTypeAny
    ? z.output<TOutputSchema>
    : unknown;

  const jobRef: { current?: object } = {};
  const job: TypedQueueJobDefinition<
    TName,
    TInputSchema,
    TOutputSchema,
    TContext,
    TMetadata
  > = {
    ...config,
    options: config.options ? { ...config.options } : undefined,
    metadata: config.metadata ? { ...config.metadata } : undefined,
    enqueue(input: TInput, options?: EnqueueOptions): Promise<JobDispatchReceipt> {
      return requireBoundQueue(jobRef.current ?? jobRef, config.name).enqueue(
        config.name,
        input as never,
        options,
      );
    },
    list(criteria?: JobScopedCriteria<TInput>): Promise<JobEnvelope<TInput, TOutput>[]> {
      return requireBoundQueue(jobRef.current ?? jobRef, config.name).jobs.list(
        withJobName(config.name, criteria),
      ) as Promise<JobEnvelope<TInput, TOutput>[]>;
    },
    registered(
      criteria?: JobScopedCriteria<TInput>,
    ): Promise<JobEnvelope<TInput, TOutput>[]> {
      return requireBoundQueue(jobRef.current ?? jobRef, config.name).jobs.registered(
        withJobName(config.name, criteria),
      ) as Promise<JobEnvelope<TInput, TOutput>[]>;
    },
    archived(
      criteria?: JobScopedCriteria<TInput>,
    ): Promise<JobEnvelope<TInput, TOutput>[]> {
      return requireBoundQueue(jobRef.current ?? jobRef, config.name).jobs.archived(
        withJobName(config.name, criteria),
      ) as Promise<JobEnvelope<TInput, TOutput>[]>;
    },
    deadLetter(
      criteria?: JobScopedCriteria<TInput>,
    ): Promise<JobEnvelope<TInput, TOutput>[]> {
      return requireBoundQueue(jobRef.current ?? jobRef, config.name).jobs.deadLetter(
        withJobName(config.name, criteria),
      ) as Promise<JobEnvelope<TInput, TOutput>[]>;
    }
  };

  jobRef.current = job;
  return Object.freeze(job);
}
