# Contract: Worker protocol additions

**Feature**: [../spec.md](../spec.md) | Extends `specs/001-core-package/contracts/worker-protocol.md`. Not public API.

## From the client

`init` gains a second shape. An application init carries, instead of `descriptor`, `useStore` and `indexes`:

| Field | Meaning |
|---|---|
| `application.name`, `application.version` | As validated on the page; the worker opens `opfs://app-<name>`. |
| `application.intent` | `"open"` (default) or `"reset"` (from `resetApplication()`). |
| `application.seed` | `{ document }` or `{ dataUrl, descriptor? }`; indexes are `descriptor.indexes` or `application.indexes`. |
| `application.migrations` | `{ [version]: Array<string \| RangeStep> }`, plain data. |
| `application.onUnavailable`, `onError`, `whenLocked` | As the option names. |

New messages:

| Message | Fields | Answered by |
|---|---|---|
| `export-application` | `id`, `name`, `version` | `application-exported` or `error` |
| `import-application` | `id`, `envelope` | `done` or `error` |

`query`, `scoped-add` and `scoped-drop` are unchanged. Application mode ignores scoped data's sweep on open: the core's sweep removes nodes with a `scope` property, which an application graph's own records could carry, so the sweep does not run in application mode.

## From the worker

| Message | Fields | When |
|---|---|---|
| `storage` | `kind`, `reason?` | Sent when the worker's storage state changes: `waiting`/`locked` on the first failed attempt after the bounded retry, `durable` once the store is open, `memory` with its reason when it falls back. `persisted` is added by the page. |
| `ready` | as today; `restored` is true when no seed was loaded and no migration ran | Lifecycle finished. |
| `init-failed` | `reason` gains `store-unmarked`, `store-newer`, `import-interrupted`, `store-unreadable`, `unavailable`, `migration-failed`; `message` names the version and statement for `migration-failed` | A lifecycle failure; the worker has not touched the store. |
| `application-exported` | `id`, `envelope`, `losses` | Export finished. |
| `store-retry` | as today | Each wait in the bounded retry (not sent in the waiting loop). |

## Order guarantees

1. `storage: durable` is sent before `ready`, and after the lifecycle's last write the worker sends `ready`; there is no `ready` while the marker's state is not `ready`.
2. A worker never writes after sending `init-failed`.
3. In the waiting loop the worker sends `storage: waiting` once and sends nothing else until it opens the store (then `storage: durable`, then `ready`).
