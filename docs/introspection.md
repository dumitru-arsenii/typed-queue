# Introspection

The core queue exposes:

```ts
await queue.jobs.list({
  queue: "email.send",
  state: "enqueued"
});

await queue.jobs.get("job-id");
```

Job-scoped helpers can query records of the same type:

```ts
await sendEmailJob.registered();
await sendEmailJob.archived({ day: "2026-05-27" });
await sendEmailJob.deadLetter();
```

Query methods return envelopes rather than internal storage records:

```ts
type JobEnvelope = {
  id: string;
  status: JobState;
  retries: {
    attempts: number;
    maxAttempts: number;
    remaining: number;
  };
  input: unknown;
  output?: unknown;
  error?: JobErrorDetails;
};
```

Supported states:

- `enqueued`
- `delayed`
- `ready`
- `active`
- `completed`
- `failed`
- `dead-letter`
- `archived`

Archived jobs can be queried by day:

```ts
await queue.jobs.list({
  state: "archived",
  day: "2026-05-27"
});
```

Operational helpers currently implemented:

- `jobs.retry(id)`
- `jobs.moveToDeadLetter(id)`
- `jobs.remove(id)`
- `jobs.clearArchive({ queue, day })`
