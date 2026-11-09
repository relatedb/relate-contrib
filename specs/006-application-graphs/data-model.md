# Data Model: Application Graphs in the Core

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-09

Terms are those of the specification; types are described by what they carry. Names marked * are fixed by ADR-009.

## Marker*

One node in the store, label `_RelateApplication`* (reserved, in `config.ts` as `MARKER_LABEL`).

| Property | Type | Rule |
|---|---|---|
| `format`* | integer | 1. A value above the code's `format` fails with `store-newer`. |
| `version`* | integer | Schema version of the stored data; 1 or more. Set last at the end of each migration step and at the end of seeding or import. |
| `state`* | string | `seeding`, `ready` or `importing`. |

The marker has no `id` property and is not part of any seed or export. There is at most one. A store that holds more than one fails as `store-unreadable` with the text "more than one marker"; only an application statement could cause it.

### Marker states and what the core does on open

| Stored | Condition | Action | Result |
|---|---|---|---|
| no marker | store empty (no node, no index) | first run | write `seeding`; load seed; create indexes; set `ready` last |
| no marker | store holds data | none | fail `store-unmarked` |
| `seeding` | any | reset, first run again | `ready` |
| `importing` | any | none | fail `import-interrupted` |
| `ready` | `format` above the code's, or `version` above the code's | none | fail `store-newer` |
| `ready` | `version` below the code's | run migrations from `version + 1` to the code's | `ready` at the code's version, or fail with the migration diagnostic |
| `ready` | `version` equals the code's | none | `ready` |

Transitions written by the core: `seeding` to `ready` (first run); `ready` to `importing` to `ready` (import); `ready` at version n to version n+1 (a migration step). `resetApplication()` writes nothing of its own: it resets the store and runs the first run.

## ApplicationOptions

| Field | Type | Rule |
|---|---|---|
| `name`* | string | `[A-Za-z0-9_-]{1,60}`; throws at creation otherwise. Store name `app-<name>`. |
| `version`* | integer | 1 or more; throws otherwise. |
| `seed`* | graph data document, document URL, descriptor or descriptor URL | Required; creation throws naming the missing seed. A document containing `_RelateApplication` as a label is rejected at load. |
| `indexes`* | list of `{ label, property }` | Used when the seed is a plain document; ignored when it is a descriptor (the descriptor's win). Created on first run only. |
| `migrations`* | map from target version to list of steps | Keys are consecutive integers from 2 to `version`, each at most `version`, else throws naming the key. A key for 1 throws. |
| `onUnavailable`* | `"memory"` or `"fail"` | Default `"memory"`. |
| `onError`* | `"fail"` or `"memory"` | Default `"fail"`. |
| `whenLocked`* | `"wait"` or `"memory"` | Default `"wait"`. |

A migration step is a Cypher string or a **range step** `{ kind: "ranges", label, property, step, statement }` made by `inRanges`. `step` is a positive integer; `statement` contains `$from` and `$to`; `label` is not the marker's.

## StorageStatus*

`{ kind, reason?, persisted }`.

| `kind` | `reason` | Meaning |
|---|---|---|
| `durable` | none | The store is open and writes reach it. |
| `waiting` | `locked` | Another holder has the store; the client is `loading`, retrying every second. |
| `memory` | `unavailable` | The browser offers no store and `onUnavailable` is `"memory"`. |
| `memory` | `locked` | The store stayed locked after the bounded retry and `whenLocked` is `"memory"`. |
| `memory` | `error` | Opening failed for another reason and `onError` is `"memory"`. |

`persisted` is the answer of `navigator.storage.persisted()` when the page can ask, else `null`. Before the worker has reported anything, `storage` is `{ kind: "waiting", persisted: null }` with no reason, meaning nothing has been opened yet. A failed client keeps the last value reported.

A change event is emitted when `kind`, `reason` or `persisted` changes.

## Failures

A failed application client's `diagnostic.reason` is one of the following; the core does not retry them (D-3).

| Reason | Cause | Store afterwards |
|---|---|---|
| `store-unmarked` | data and no marker | unchanged |
| `store-newer` | marker or format above the code's | unchanged |
| `import-interrupted` | marker `importing` | unchanged |
| `store-unreadable` | opening failed other than by lock or absence of storage; or two markers | unchanged |
| `unavailable` | no store and `onUnavailable: "fail"` | not opened |
| `migration-failed` | a step failed; the diagnostic names the target version and the statement | at the last completed version |
| `invalid-document`, `invalid-descriptor`, `mismatch` | the seed or an import document is rejected (existing reasons) | on first run the marker stays `seeding` |

## ExportEnvelope* and LossReport

```text
ExportEnvelope = {
  format: "relate-application-export",
  version: 1,
  application: { name, version },
  document: GraphDocument            // ADR-002; no marker node
}
LossReport = Array<{ kind, count, droppedLinks? }>
kind ∈ integer-beyond-2^53 | whole-number-float | date | duration | point | empty-list | node-without-string-id
```

- A property whose value is a loss is written to the document as the format carries it (the integer as the nearest number, the whole-number float as an integer, a date or duration as its text, a point omitted, an empty list as an empty list or omitted if the format cannot carry it) and counted once per value. The exact rendering of each is fixed by the schema in [contracts/export-envelope.schema.json](contracts/export-envelope.schema.json) and the format's own rules (ADR-002), settled at implementation and recorded in the README.
- A node without a string `id` is omitted from the document and counted; relationships that end at an omitted node are omitted and counted in that entry's `droppedLinks`.
- `exportApplication({ allowLoss })` rejects with the loss report when the list is not empty and `allowLoss` is not `true`; with `allowLoss: true` it returns the envelope and the same list.

## Range step progress

Not stored. A range step reads the minimum and maximum of its property over its label at the start of each run, so a rerun after an interruption finds the work not yet done by the author's own filter in `statement`, and finishes when `[from, to)` passes the maximum.
