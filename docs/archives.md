# Archives

Enable daily archive behavior per job:

```ts
defineJob({
  name: "email.send",
  input,
  options: {
    archive: {
      strategy: "daily"
    }
  },
  handler
});
```

The current worker marks successful jobs as `archived` in Redis when daily
archives are enabled and stores an `archiveDay` such as `2026-05-27`.

Storage implementations can use:

- `formatArchiveDay(date)`
- `createArchiveKey(day)`
- `isArchiveDay(value)`
