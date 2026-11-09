# Contract: Application mode of the client

**Feature**: [../spec.md](../spec.md) | Extends `specs/001-core-package/contracts/client-api.md`; every existing member and option is unchanged.

## Creating

```ts
createClient({
  engineUrl,                       // as today
  navigation,                      // as today; independent of application mode
  application: ApplicationOptions, // in place of `graph`
});
```

`graph` and `application` are mutually exclusive; giving both, or neither, throws. All option checks in [data-model.md](../data-model.md) run at creation and throw an `Error` whose message names the field and the rule (the name rule, the version rule, the migration key that breaks the sequence, the missing seed, a range step without `$from` or `$to`). Nothing is started and no worker is created when creation throws.

## Added to `Client`

| Member | Behaviour |
|---|---|
| `storage: StorageStatus` | Current value; see data-model. In memory modes it never becomes `durable` for the life of the client. |
| `on("storage", fn)` | Called with the new `StorageStatus` on each change (an addition to the `Events` map). |
| `resetApplication(): Promise<void>` | Ends the current worker, starts one with the reset intent, resolves when the client is `ready` (store reset and seeded), rejects with the failure if it fails. The only call that discards stored data besides the `seeding` recovery. Throws on a client not in application mode. |
| `exportApplication(opts?: { allowLoss?: boolean }): Promise<{ envelope, losses }>` | Waits for `ready`. Rejects with a `GraphError` of reason `export-loss` carrying the loss report when losses exist and `allowLoss` is not `true`. Skips the marker. |
| `importApplication(envelope): Promise<void>` | Waits for `ready`. Rejects, leaving the store unchanged, for an envelope of another name, a version above the code's, a wrong `format`, or an invalid document. Otherwise marks `importing`, resets, loads, marks `ready` at the envelope's version, migrates, and resolves. Never exports first; the core never calls it. |
| `requestPersistence(): Promise<boolean>` | Calls `navigator.storage.persist()` from the page, resolves with the browser's answer (`false` when the call is absent or refused), updates `storage.persisted`. Never called by the core. Does not wait for `ready`. |
| `storageEstimate(): Promise<{ usage: number \| null, quota: number \| null }>` | The browser's `navigator.storage.estimate()`, `null` fields where it gives none. |

`query`, `run`, `subscribe`, `addScoped` and the rest behave as today. While `status` is `loading` (including `storage.kind` `waiting`), `query` and `run` stay pending and do not reject; when the client fails they reject with `failed`.

## Failure

`status` becomes `failed` with `diagnostic.reason` one of the names in data-model; `failureMessage()` words them (see README). `retry()` starts again; `resetApplication()` is the only way out of `store-unmarked`, `store-newer`, `import-interrupted` and `store-unreadable` that changes the store.

## The helper

```ts
inRanges({ label, property, step, statement }): RangeStep
```

Exported from the package root. Used inside a migration list. `statement` is the author's Cypher with the parameters `$from` (inclusive) and `$to` (exclusive) and a filter of its own that makes running it again harmless. The core runs it once per window of `step` over the property's range for the label, never touching the marker.

## Tags

Tests carry `// covers-app: FR-nnn, SC-nnn` for this specification (plan D-8).
