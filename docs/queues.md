# Queues

`createTypedQueue` creates a framework-agnostic queue.

The only built-in storage is Redis. Redis configuration is required and
explicit: pass `redis: { client }` or `redis: { options: { url }, keyPrefix }`
to `createTypedQueue`.

Supported enqueue options:

- `id`
- `readyAt`
- `priority`
- `attempts`
- `backoff`
- `metadata`
- `correlationId`
- `traceId`

The queue exposes `jobs.list`, `jobs.registered`, `jobs.archived`,
`jobs.deadLetter`, `jobs.get`, `jobs.retry`, `jobs.moveToDeadLetter`,
`jobs.archive`, `jobs.remove`, and `jobs.clearArchive` for introspection and
operational workflows supported by the current core.

Jobs registered with `createTypedQueue` also get active-record style helpers:

```ts
const { id } = await sendEmailJob.enqueue(payload);
await sendEmailJob.registered({ criteria: { input: { to: "user@example.com" } } });
await sendEmailJob.archived({ day: "2026-05-27" });
await sendEmailJob.deadLetter();
```

Enqueueing does not return handler output. It only returns the job id. Query
methods return envelopes with `id`, `status`, `retries`, `input`, and `output`
or `error`.
