# Introduction

`typed-queue` is a schema-first job execution framework for TypeScript.

The core design is simple: define jobs with Zod schemas, enqueue payloads that
are validated at runtime, and let TypeScript infer the payload and result types
from those same schemas.

Dispatching a job only creates work for a worker and returns the created job id.
Output is read later from job envelopes returned by query APIs.

Current status: experimental. The core package includes Redis-backed storage and
an in-process worker so the API can be tested and used locally with Redis. The
dashboard package serves a React SPA from a Node server.
