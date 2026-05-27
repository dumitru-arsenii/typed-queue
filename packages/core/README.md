# @typed-queue/core

Framework-agnostic core for `typed-queue`.

This package is experimental. It currently ships a Zod-first job API,
active-record style job helpers, Redis-backed queue storage, worker processing,
retries, dead-letter metadata, daily archive helpers, and introspection APIs.
Redis is the only built-in storage backend.

Redis configuration is required. Pass either a Redis client:

```ts
const queue = createTypedQueue({
  redis: {
    client
  },
  jobs: [sendEmailJob]
});
```

or explicit Redis client options:

```ts
const queue = createTypedQueue({
  redis: {
    options: {
      url: "redis://localhost:6379"
    },
    keyPrefix: "typed-queue"
  },
  jobs: [sendEmailJob]
});
```

## Define a Job

```ts
import { z } from "zod";
import { defineJob } from "@typed-queue/core";

export const sendEmailJob = defineJob({
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
    deadLetterQueue: true,
    archive: {
      strategy: "daily"
    }
  },
  handler: async ({ input }) => ({
    messageId: `message:${input.to}`
  })
});
```

## Enqueue

```ts
import { createTypedQueue } from "@typed-queue/core";
import { sendEmailJob } from "./jobs";

const queue = createTypedQueue({
  redis: {
    options: {
      url: "redis://localhost:6379"
    }
  },
  jobs: [sendEmailJob]
});

const { id } = await queue.enqueue("email.send", {
  to: "user@example.com",
  subject: "Hello",
  body: "Message"
});

await sendEmailJob.enqueue({
  to: "user@example.com",
  subject: "Hello",
  body: "Message"
});
```

Enqueueing only validates and stores the job. It returns a receipt with the
created job id; workers produce output later.

`defineJob` returns an object that is bound when it is registered with
`createTypedQueue`. After binding, the job can enqueue and query records of its
own type:

```ts
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

await sendEmailJob.deadLetter();
```

Query methods return job envelopes:

```ts
const [job] = await sendEmailJob.archived({
  day: "2026-05-27"
});

job?.input;
job?.output;
job?.error;
job?.retries;
```

## Worker

```ts
const worker = queue.createWorker({
  concurrency: 5
});

await worker.processOnce();
```

The current worker is in-process and uses the configured Redis-backed
`QueueStorage`. More robust Redis leasing for multi-process workers is planned.

## Delayed Jobs

```ts
const delayed = await queue.enqueue(
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

Jobs with a future `readyAt` are stored as `delayed` until a worker sees that
the time has passed.

## Introspection

```ts
await queue.jobs.list({
  queue: "email.send",
  state: "enqueued"
});

await queue.jobs.get("job-id");
```

Implemented job operations:

- `jobs.list`
- `jobs.registered`
- `jobs.archived`
- `jobs.deadLetter`
- `jobs.get`
- `jobs.retry`
- `jobs.moveToDeadLetter`
- `jobs.archive`
- `jobs.remove`
- `jobs.clearArchive`

## Dead-Letter Queue

If `deadLetterQueue: true` is set on a job, retry exhaustion moves the job to
state `dead-letter`. Metadata includes original job name, original payload,
error details, attempts, timestamps, correlation id, and trace id when present.

## Archives

If `archive: { strategy: "daily" }` is set on a job, successful completion
marks the Redis-backed record as `archived` and stores an `archiveDay` such as
`2026-05-27`. Helpers such as `formatArchiveDay` and `createArchiveKey` are
exported for archive-key conventions.

## Public API

Import from the package root only:

```ts
import { createTypedQueue, defineJob } from "@typed-queue/core";
```

Internal source files are not part of the public import contract.
