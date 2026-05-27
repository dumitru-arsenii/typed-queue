# Job Definition

Jobs are created with `defineJob`.

Each job has:

- `name`
- `input` Zod schema
- optional `output` Zod schema
- `handler`
- optional `options`
- optional `metadata`

Input validation happens when a job is enqueued. Input and output validation
also happen when the in-process worker executes a job.

`defineJob` intentionally keeps the job object small. More advanced behavior
should be added through queue storage, worker options, and lifecycle hooks.
