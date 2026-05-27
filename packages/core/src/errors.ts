import type { z } from "zod";
import type { JobErrorDetails } from "./types.js";

export class TypedQueueError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TypedQueueError";
  }
}

export class DuplicateJobError extends TypedQueueError {
  constructor(jobName: string) {
    super(`Job "${jobName}" is already registered.`);
    this.name = "DuplicateJobError";
  }
}

export class JobNotFoundError extends TypedQueueError {
  constructor(jobNameOrId: string) {
    super(`Job "${jobNameOrId}" was not found.`);
    this.name = "JobNotFoundError";
  }
}

export class JobInputValidationError extends TypedQueueError {
  readonly issues: z.ZodIssue[];

  constructor(jobName: string, error: z.ZodError) {
    super(`Input for job "${jobName}" failed validation.`, { cause: error });
    this.name = "JobInputValidationError";
    this.issues = error.issues;
  }
}

export class JobOutputValidationError extends TypedQueueError {
  readonly issues: z.ZodIssue[];

  constructor(jobName: string, error: z.ZodError) {
    super(`Output for job "${jobName}" failed validation.`, { cause: error });
    this.name = "JobOutputValidationError";
    this.issues = error.issues;
  }
}

export class JobExecutionError extends TypedQueueError {
  constructor(jobName: string, cause: unknown) {
    super(`Handler for job "${jobName}" failed.`, { cause });
    this.name = "JobExecutionError";
  }
}

export function toJobErrorDetails(
  error: unknown,
  type: JobErrorDetails["type"] = "unknown",
): JobErrorDetails {
  if (error instanceof JobInputValidationError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      issues: error.issues,
      type: "validation"
    };
  }

  if (error instanceof JobOutputValidationError) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      issues: error.issues,
      type: "output-validation"
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      type
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    type
  };
}
