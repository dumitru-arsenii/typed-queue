# typed-queue

`typed-queue` is a schema-first typed job execution framework for TypeScript.
Jobs are defined with Zod schemas, so the same definition validates runtime
payloads and drives TypeScript inference for enqueueing and handler code.

The project is currently early and experimental. `@typed-queue/core` includes a
framework-agnostic Redis-backed queue, active-record style job helpers,
validation, basic worker execution, retries, dead-letter metadata, daily archive
helpers, and introspection APIs. `@typed-queue/dashboard` exposes a small React
SPA that can be attached to a Node `http` or `https` server.

## Installation

```sh
pnpm add @typed-queue/core zod
```

`@typed-queue/core` uses Redis as its built-in storage. Redis configuration is
explicit: pass either a Redis client or Redis client options to
`createTypedQueue`.

Packages:

- `@typed-queue/core`
- `@typed-queue/dashboard`

## Basic Usage

```ts
import { z } from "zod";
import { createTypedQueue, defineJob } from "@typed-queue/core";

const sendEmailJob = defineJob({
  name: "email.send",
  input: z.object({
    to: z.string().email(),
    subject: z.string(),
    body: z.string()
  }),
  output: z.object({
    messageId: z.string()
  }),
  options: {
    attempts: 5,
    concurrency: 10,
    deadLetterQueue: true,
    archive: {
      strategy: "daily"
    }
  },
  handler: async ({ input }) => ({
    messageId: `message:${input.to}`
  })
});

const typedQueue = createTypedQueue({
  redis: {
    options: {
      url: "redis://localhost:6379"
    }
  },
  jobs: [sendEmailJob]
});

const { id } = await typedQueue.enqueue("email.send", {
  to: "user@example.com",
  subject: "Hello",
  body: "Message"
});

await sendEmailJob.enqueue({
  to: "user@example.com",
  subject: "Hello",
  body: "Message"
});

await typedQueue.createWorker({ concurrency: 2 }).processOnce();

const envelope = await typedQueue.jobs.get(id);
```

## Delayed Jobs

```ts
const delayed = await typedQueue.enqueue(
  "email.send",
  {
    to: "user@example.com",
    subject: "Hello",
    body: "Message"
  },
  {
    readyAt: new Date("2026-05-28T10:00:00Z")
  },
);
```

## Introspection

```ts
const enqueuedJobs = await typedQueue.jobs.list({
  queue: "email.send",
  state: "enqueued"
});

await typedQueue.jobs.list({
  queue: "email.send",
  state: "dead-letter"
});

await typedQueue.jobs.list({
  queue: "email.send",
  state: "archived",
  day: "2026-05-27"
});

await sendEmailJob.registered({
  criteria: {
    input: {
      to: "user@example.com"
    }
  }
});

await sendEmailJob.archived({
  day: "2026-05-27"
});
```

Query APIs return job envelopes:

```ts
{
  id: "email.send:...",
  name: "email.send",
  status: "completed",
  retries: {
    attempts: 1,
    maxAttempts: 5,
    remaining: 4
  },
  input: {
    to: "user@example.com",
    subject: "Hello",
    body: "Message"
  },
  output: {
    messageId: "message:user@example.com"
  }
}
```

## Dashboard

```ts
import { createServer } from "node:http";
import { attachTypedQueueDashboard } from "@typed-queue/dashboard";
import { typedQueue } from "./queue";

const server = createServer();

attachTypedQueueDashboard(server, {
  queue: typedQueue,
  path: "/typed-queue"
});

server.listen(3000);
```

The dashboard serves a React SPA for registered jobs, archive buckets, and
dead-letter jobs. It can dispatch jobs, remove registered jobs, clear archives,
and retry DLQ jobs through the core APIs.

## Current Status

Implemented:

- Zod-first job definitions
- Typed enqueue API returning a job id receipt
- Active-record job enqueue and same-type queries
- Redis-backed queue storage
- Basic worker processing
- Input and output validation
- Retry attempts with fixed or exponential backoff
- Dead-letter metadata after retry exhaustion
- Daily archive helpers and archived job state
- Introspection for listed and stored jobs

Planned:

- Atomic Redis leases for multi-process workers
- Metrics and tracing integrations
- More complete lifecycle hooks and operational controls

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```
