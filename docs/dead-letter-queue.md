# Dead-Letter Queue

Enable dead-letter behavior per job:

```ts
defineJob({
  name: "email.send",
  input,
  options: {
    attempts: 3,
    deadLetterQueue: true
  },
  handler
});
```

When retry attempts are exhausted, the in-process worker moves the job to
`dead-letter`.

Dead-letter metadata includes:

- original job name
- original payload
- error details
- stack trace when available
- attempts
- timestamps
- correlation id
- trace id
