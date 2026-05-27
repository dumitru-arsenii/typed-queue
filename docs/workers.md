# Workers

Workers are created from a queue:

```ts
const worker = queue.createWorker({
  concurrency: 5
});

await worker.processOnce();
```

Implemented:

- in-process job execution
- concurrency for `processOnce`
- input and output validation
- retry exhaustion handling
- dead-letter metadata when enabled
- lifecycle hooks for start, success, failure, and dead-letter events

Planned:

- durable leases
- heartbeat handling
- multi-process coordination
- richer graceful shutdown semantics
