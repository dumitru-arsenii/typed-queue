# Getting Started

Install the core package and Zod:

```sh
pnpm add @typed-queue/core zod
```

Run Redis locally and pass Redis configuration explicitly. The core package does
not read Redis environment variables.

Define a job:

```ts
import { z } from "zod";
import { defineJob } from "@typed-queue/core";

export const job = defineJob({
  name: "email.send",
  input: z.object({
    to: z.string().email()
  }),
  handler: async ({ input }) => {
    return { deliveredTo: input.to };
  }
});
```

Create a queue:

```ts
import { createTypedQueue } from "@typed-queue/core";

export const queue = createTypedQueue({
  redis: {
    options: {
      url: "redis://localhost:6379"
    }
  },
  jobs: [job]
});
```

Enqueue through the queue or through the bound job object. Enqueueing returns
only the created job id; query the envelope later to read output or error.

```ts
const { id } = await queue.enqueue("email.send", {
  to: "user@example.com"
});

await job.enqueue({
  to: "user@example.com"
});

const envelope = await queue.jobs.get(id);
```
