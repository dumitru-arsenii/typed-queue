import type { z } from "zod";

export type MaybePromise<T> = T | Promise<T>;

export type JobState =
  | "enqueued"
  | "delayed"
  | "ready"
  | "active"
  | "completed"
  | "failed"
  | "dead-letter"
  | "archived";

export type ArchiveDay = string;

export type JobMetadata = Record<string, unknown>;

export interface BackoffOptions {
  readonly strategy: "fixed" | "exponential";
  readonly delayMs: number;
  readonly maxDelayMs?: number;
}

export interface ArchiveOptions {
  readonly strategy: "daily";
  readonly retentionDays?: number;
}

export interface JobOptions {
  readonly attempts?: number;
  readonly backoff?: BackoffOptions;
  readonly concurrency?: number;
  readonly deadLetterQueue?: boolean;
  readonly archive?: ArchiveOptions;
}

export interface EnqueueOptions {
  readonly id?: string;
  readonly readyAt?: Date;
  readonly priority?: number;
  readonly attempts?: number;
  readonly backoff?: BackoffOptions;
  readonly metadata?: JobMetadata;
  readonly correlationId?: string;
  readonly traceId?: string;
}

export interface NormalizedEnqueueOptions {
  readonly id?: string;
  readonly readyAt: Date;
  readonly delayMs: number;
  readonly state: "enqueued" | "delayed";
  readonly priority: number;
  readonly attempts: number;
  readonly backoff?: BackoffOptions;
  readonly metadata?: JobMetadata;
  readonly correlationId?: string;
  readonly traceId?: string;
}

export interface JobErrorDetails {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: unknown;
  readonly issues?: unknown;
  readonly type:
    | "validation"
    | "handler"
    | "output-validation"
    | "unknown-job"
    | "unknown";
}

export interface FailedJobMetadata {
  readonly attempts: number;
  readonly error: JobErrorDetails;
  readonly failedAt: Date;
}

export interface DeadLetterMetadata extends FailedJobMetadata {
  readonly originalJobName: string;
  readonly originalPayload: unknown;
  readonly movedAt: Date;
  readonly correlationId?: string;
  readonly traceId?: string;
}

export interface JobRetryEnvelope {
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly remaining: number;
}

export interface JobDispatchReceipt {
  readonly id: string;
}

export interface JobEnvelope<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly status: JobState;
  readonly retries: JobRetryEnvelope;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly error?: JobErrorDetails;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly readyAt: Date;
  readonly archivedAt?: Date;
  readonly archiveDay?: ArchiveDay;
  readonly durationMs?: number;
  readonly metadata?: JobMetadata;
  readonly correlationId?: string;
  readonly traceId?: string;
}

export interface JobRecord<TPayload = unknown, TResult = unknown> {
  readonly id: string;
  readonly name: string;
  readonly payload: TPayload;
  readonly state: JobState;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly priority: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly readyAt: Date;
  readonly delayMs: number;
  readonly backoff?: BackoffOptions;
  readonly metadata?: JobMetadata;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly failedAt?: Date;
  readonly archivedAt?: Date;
  readonly archiveDay?: ArchiveDay;
  readonly durationMs?: number;
  readonly result?: TResult;
  readonly errors: readonly JobErrorDetails[];
  readonly failed?: FailedJobMetadata;
  readonly deadLetter?: DeadLetterMetadata;
}

export interface JobRecordCriteria<TPayload = unknown> {
  readonly id?: string;
  readonly state?: JobState | readonly JobState[];
  readonly day?: ArchiveDay;
  readonly input?: Partial<TPayload> | ((input: TPayload) => boolean);
  readonly payload?: Partial<TPayload> | ((payload: TPayload) => boolean);
  readonly metadata?: JobMetadata;
  readonly correlationId?: string;
  readonly traceId?: string;
  readonly createdAfter?: Date;
  readonly createdBefore?: Date;
  readonly readyAfter?: Date;
  readonly readyBefore?: Date;
  readonly updatedAfter?: Date;
  readonly updatedBefore?: Date;
}

export interface JobHandlerContext<TContext = unknown> {
  readonly ctx: TContext;
  readonly job: JobRecord;
  readonly attempt: number;
  readonly signal?: AbortSignal;
}

export type JobHandler<TInput, TOutput, TContext = unknown> = (args: {
  readonly input: TInput;
  readonly ctx: TContext;
  readonly job: JobRecord<TInput, TOutput>;
  readonly attempt: number;
  readonly signal?: AbortSignal;
}) => MaybePromise<TOutput>;

export type AnyOutputSchema = z.ZodTypeAny | undefined;

export type OutputFromSchema<TSchema extends AnyOutputSchema> =
  TSchema extends z.ZodTypeAny ? z.output<TSchema> : unknown;

export interface JobDefinitionConfig<
  TName extends string,
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends AnyOutputSchema = undefined,
  TContext = unknown,
  TMetadata extends JobMetadata = JobMetadata,
> {
  readonly name: TName;
  readonly input: TInputSchema;
  readonly output?: TOutputSchema;
  readonly options?: JobOptions;
  readonly metadata?: TMetadata;
  readonly handler: JobHandler<
    z.output<TInputSchema>,
    OutputFromSchema<TOutputSchema>,
    TContext
  >;
}

export type JobScopedCriteria<TPayload = unknown> = Omit<
  ListJobsOptions<TPayload>,
  "queue"
>;

export interface JobActiveRecordApi<TInput = unknown, TOutput = unknown> {
  enqueue(input: TInput, options?: EnqueueOptions): Promise<JobDispatchReceipt>;
  list(criteria?: JobScopedCriteria<TInput>): Promise<JobEnvelope<TInput, TOutput>[]>;
  registered(
    criteria?: JobScopedCriteria<TInput>,
  ): Promise<JobEnvelope<TInput, TOutput>[]>;
  archived(
    criteria?: JobScopedCriteria<TInput>,
  ): Promise<JobEnvelope<TInput, TOutput>[]>;
  deadLetter(
    criteria?: JobScopedCriteria<TInput>,
  ): Promise<JobEnvelope<TInput, TOutput>[]>;
}

export type InferJobInput<TJob extends AnyTypedQueueJob> =
  TJob extends { readonly input: infer TInputSchema }
    ? TInputSchema extends z.ZodTypeAny
      ? z.output<TInputSchema>
      : never
    : never;

export type InferJobOutput<TJob extends AnyTypedQueueJob> =
  TJob extends { readonly output?: infer TOutputSchema }
    ? TOutputSchema extends z.ZodTypeAny
      ? z.output<TOutputSchema>
      : unknown
    : unknown;

export type JobName<TJobs extends readonly AnyTypedQueueJob[]> =
  TJobs[number]["name"] & string;

export type JobByName<
  TJobs extends readonly AnyTypedQueueJob[],
  TName extends string,
> = Extract<TJobs[number], { readonly name: TName }>;

export type TypedQueueJobDefinition<
  TName extends string = string,
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends AnyOutputSchema = AnyOutputSchema,
  TContext = unknown,
  TMetadata extends JobMetadata = JobMetadata,
> = JobDefinitionConfig<TName, TInputSchema, TOutputSchema, TContext, TMetadata> &
  JobActiveRecordApi<
    z.output<TInputSchema>,
    OutputFromSchema<TOutputSchema>
  >;

export type AnyTypedQueueJob = TypedQueueJobDefinition<
  string,
  z.ZodTypeAny,
  AnyOutputSchema,
  unknown,
  JobMetadata
>;

export interface ListJobsOptions<TPayload = unknown> {
  readonly queue?: string;
  readonly state?: JobState;
  readonly states?: readonly JobState[];
  readonly day?: ArchiveDay;
  readonly criteria?: JobRecordCriteria<TPayload>;
  readonly limit?: number;
  readonly offset?: number;
}

export interface QueueStorage {
  add<TPayload, TResult>(record: JobRecord<TPayload, TResult>): Promise<void>;
  get(id: string): Promise<JobRecord | undefined>;
  list(options?: ListJobsOptions): Promise<JobRecord[]>;
  update(
    id: string,
    updater: (record: JobRecord) => JobRecord,
  ): Promise<JobRecord | undefined>;
  delete(id: string): Promise<JobRecord | undefined>;
  deleteWhere(options?: ListJobsOptions): Promise<JobRecord[]>;
  claimReady(options: {
    readonly now: Date;
    readonly limit: number;
    readonly queue?: string;
  }): Promise<JobRecord[]>;
}

export interface RedisQueueStorageClient {
  readonly isOpen?: boolean;
  readonly isReady?: boolean;
  connect?(): Promise<unknown>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  hGet(key: string, field: string): Promise<string | null | undefined>;
  hVals(key: string): Promise<string[]>;
  hDel(key: string, field: string): Promise<unknown>;
}

export interface RedisQueueStorageClientOptions {
  readonly client: RedisQueueStorageClient;
  readonly options?: never;
  readonly keyPrefix?: string;
  readonly connect?: boolean;
}

export interface RedisQueueStorageCreateClientOptions {
  readonly client?: never;
  readonly options: import("redis").RedisClientOptions;
  readonly keyPrefix?: string;
  readonly connect?: boolean;
}

export type RedisQueueStorageOptions =
  | RedisQueueStorageClientOptions
  | RedisQueueStorageCreateClientOptions;

export interface JobRegistryApi<
  TJobs extends readonly AnyTypedQueueJob[] = readonly AnyTypedQueueJob[],
> {
  register<TJob extends AnyTypedQueueJob>(job: TJob): void;
  get<TName extends JobName<TJobs>>(
    name: TName,
  ): JobByName<TJobs, TName> | undefined;
  has(name: string): boolean;
  list(): AnyTypedQueueJob[];
}

export interface JobsIntrospection {
  list(options?: ListJobsOptions): Promise<JobEnvelope[]>;
  registered(options?: ListJobsOptions): Promise<JobEnvelope[]>;
  archived(options?: ListJobsOptions): Promise<JobEnvelope[]>;
  deadLetter(options?: ListJobsOptions): Promise<JobEnvelope[]>;
  get(id: string): Promise<JobEnvelope | undefined>;
  retry(id: string, options?: Pick<EnqueueOptions, "readyAt">): Promise<JobEnvelope>;
  moveToDeadLetter(id: string, reason?: JobErrorDetails): Promise<JobEnvelope>;
  archive(id: string, day?: ArchiveDay): Promise<JobEnvelope>;
  remove(id: string): Promise<JobEnvelope>;
  clearArchive(options?: {
    readonly queue?: string;
    readonly day?: ArchiveDay;
  }): Promise<JobEnvelope[]>;
}

export interface WorkerLifecycleHooks {
  readonly onJobStart?: (job: JobRecord) => MaybePromise<void>;
  readonly onJobSuccess?: (job: JobRecord) => MaybePromise<void>;
  readonly onJobFailure?: (job: JobRecord, error: JobErrorDetails) => MaybePromise<void>;
  readonly onJobDeadLetter?: (job: JobRecord) => MaybePromise<void>;
}

export interface WorkerOptions<TContext = unknown> extends WorkerLifecycleHooks {
  readonly concurrency?: number;
  readonly queue?: string;
  readonly pollIntervalMs?: number;
  readonly ctx?: TContext;
  readonly signal?: AbortSignal;
}

export interface WorkerProcessResult {
  readonly job: JobRecord;
  readonly state: JobState;
  readonly error?: JobErrorDetails;
}

export interface TypedQueueWorker {
  processOnce(): Promise<WorkerProcessResult[]>;
  start(): void;
  stop(): Promise<void>;
}

export type Clock = () => Date;

export interface CreateTypedQueueOptions<
  TJobs extends readonly AnyTypedQueueJob[] = readonly AnyTypedQueueJob[],
> {
  readonly jobs?: TJobs;
  readonly redis: RedisQueueStorageOptions;
  readonly now?: Clock;
  readonly idGenerator?: (jobName: string) => string;
}

export interface TypedQueue<
  TJobs extends readonly AnyTypedQueueJob[] = readonly AnyTypedQueueJob[],
> {
  readonly registry: JobRegistryApi<TJobs>;
  readonly storage: QueueStorage;
  readonly clock: Clock;
  createWorker<TContext = unknown>(
    options?: WorkerOptions<TContext>,
  ): TypedQueueWorker;
  readonly jobs: JobsIntrospection;
}
