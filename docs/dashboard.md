# Dashboard

`@typed-queue/dashboard` serves a React SPA from an existing Node `http` or
`https` server.

```ts
import { createServer } from "node:http";
import { attachTypedQueueDashboard } from "@typed-queue/dashboard";
import { queue } from "./queue";

const server = createServer();

attachTypedQueueDashboard(server, {
  queue,
  path: "/typed-queue"
});

server.listen(3000);
```

Implemented:

- registered job view
- archive view with day filtering
- dead-letter view
- dispatch form
- registered job removal
- archive bucket clearing
- retry from DLQ

Current limitations:

- The SPA currently loads React from `esm.sh`.
- Authentication and authorization hooks are not implemented yet.
- The dashboard reflects the Redis-backed storage attached to core.
