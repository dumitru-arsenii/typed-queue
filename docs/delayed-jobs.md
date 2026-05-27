# Delayed Jobs

Use `readyAt` to enqueue a delayed job:

```ts
const { id } = await queue.enqueue("email.send", payload, {
  readyAt: new Date("2026-05-28T10:00:00Z")
});
```

If `readyAt` is in the future, the job is stored with state `delayed`. The
worker claims delayed jobs only after their `readyAt` time has passed.

The helper `normalizeEnqueueOptions` exposes the normalized `delayMs` value for
storage and tests.
