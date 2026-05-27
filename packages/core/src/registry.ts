import { DuplicateJobError } from "./errors.js";
import type {
  AnyTypedQueueJob,
  JobByName,
  JobName,
  JobRegistryApi
} from "./types.js";

export class JobRegistry<
  TJobs extends readonly AnyTypedQueueJob[] = readonly AnyTypedQueueJob[],
> implements JobRegistryApi<TJobs>
{
  private readonly jobs = new Map<string, AnyTypedQueueJob>();
  private readonly onRegister?: (job: AnyTypedQueueJob) => void;

  constructor(
    jobs: readonly AnyTypedQueueJob[] = [],
    onRegister?: (job: AnyTypedQueueJob) => void,
  ) {
    this.onRegister = onRegister;

    for (const job of jobs) {
      this.register(job);
    }
  }

  register<TJob extends AnyTypedQueueJob>(job: TJob): void {
    if (this.jobs.has(job.name)) {
      throw new DuplicateJobError(job.name);
    }

    this.jobs.set(job.name, job);
    this.onRegister?.(job);
  }

  get<TName extends JobName<TJobs>>(
    name: TName,
  ): JobByName<TJobs, TName> | undefined {
    return this.jobs.get(name) as JobByName<TJobs, TName> | undefined;
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }

  list(): AnyTypedQueueJob[] {
    return [...this.jobs.values()];
  }
}
