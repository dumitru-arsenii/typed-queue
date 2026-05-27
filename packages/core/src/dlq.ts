import { toJobErrorDetails } from "./errors.js";
import type {
  DeadLetterMetadata,
  FailedJobMetadata,
  JobErrorDetails,
  JobRecord
} from "./types.js";

export function createFailedJobMetadata(
  job: JobRecord,
  error: unknown,
  failedAt: Date,
): FailedJobMetadata {
  return {
    attempts: job.attempts,
    error:
      typeof error === "object" && error !== null && "message" in error
        ? toJobErrorDetails(error, "handler")
        : toJobErrorDetails(error, "unknown"),
    failedAt
  };
}

export function createDeadLetterMetadata(
  job: JobRecord,
  error: JobErrorDetails,
  movedAt: Date,
): DeadLetterMetadata {
  return {
    attempts: job.attempts,
    error,
    failedAt: movedAt,
    originalJobName: job.name,
    originalPayload: job.payload,
    movedAt,
    correlationId: job.correlationId,
    traceId: job.traceId
  };
}
