# @typed-queue/dashboard

Experimental React dashboard for `typed-queue`.

The dashboard attaches to a Node `http` or `https` server and serves a small SPA
from a chosen URL. It uses the real `@typed-queue/core` APIs for listing,
dispatching, removing, clearing archives, and retrying DLQ jobs.

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

- Node `http` and `https` server attachment
- React SPA served from the configured path
- Registered job view
- Archive view with day filtering
- Dead-letter view
- Dispatch form
- Remove registered job action
- Clear archive bucket action
- Retry DLQ job action

Current limitations:

- The SPA currently loads React from `esm.sh`.
- Auth and permission hooks are not implemented yet.