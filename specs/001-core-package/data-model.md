# Data Model: Core Package

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Entities and rules, without implementation. Field names are those of the public contracts.

## Graph data document

The input of ADR-002 (as amended). Full shape: [contracts/graph-data.schema.json](contracts/graph-data.schema.json).

| Field | Rule |
|---|---|
| `version` | required, integer, `1` |
| `revision` | optional string; when the graph has a descriptor it must equal the descriptor's, otherwise it has no effect |
| `nodes[]` | each: `id` (non-empty string, unique in the document), `labels` (non-empty strings, may be empty), `properties` (no `id` key; no `scope` key when a load is scoped) |
| `links[]` | each: `source` and `target` (ids of nodes in the document), `type` (non-empty string), `properties` |
| property value | string, finite number, boolean, or a non-empty array of one of those kinds |

Checks a schema cannot express, done by the validator: unique node ids, endpoints exist, finite numbers,
the `scope` rule. The first problem is reported with its path, for example `nodes[3].properties.id`.

Number handling at load: a whole number is an integer, any other number a float; an array containing a
fractional item is loaded as floats throughout (research R2).

## Graph descriptor

The document of ADR-003, served beside the data. Full shape:
[contracts/graph-descriptor.schema.json](contracts/graph-descriptor.schema.json).

| Field | Rule |
|---|---|
| `version` | required, integer, `1` |
| `id` | required, 1 to 48 characters from `A-Z a-z 0-9 _ -`; names the store; unique among the graphs of an origin that use a store |
| `revision` | required non-empty string; changes whenever the data or the descriptor changes |
| `data.url` | required; relative to the descriptor's URL when fetched, to the page's URL when embedded |
| `data.nodes`, `data.links` | required non-negative integers; the loader checks them against the document |
| `indexes[]` | optional `{label, property}` pairs of non-empty strings, created before the nodes load |

`shape` and `embeddings` are reserved and rejected in version 1. A graph may have no descriptor; then it has
no revision, no store, and takes its indexes from a caller option.

## Client

State held by one client. Each client is independent (FR-035).

| Field | Meaning |
|---|---|
| `generation` | integer, starts at 1 for the first instance, increases on every replacement |
| `status` | `loading`, `ready`, `recovering` or `failed` |
| `failures` | consecutive attempts that did not reach `ready` (0 to 3) |
| `diagnostic` | present when `failed`: last failure reason, `failures`, engine error text |
| `subscriptions` | registered queries with listeners |
| `generationListeners` | listeners called when a new instance is ready |
| `scopes` | page-view scope values this client has added, for departure |

### Status transitions

```text
            start                         ready reached
  (none) ───────────► loading ─────────────────────────────► ready
                        │ ▲                                    │
          attempt fails │ │ retry()                  fault     │
        (count < 3)     │ │ resets count             (trap, timeout,
                        ▼ │                          worker error)
                    recovering ◄───────────────────────────────┘
                        │  │
        attempt fails   │  └── ready reached ──► ready
        (count reaches 3)
                        ▼
                     failed        (also: no worker support, with reason `unsupported`)
```

Rules:

- An attempt is one start of an instance; the initial load is attempt 1. A failure is an attempt that ends
  without `ready`. `ready` sets `failures` to 0. A fault from `ready` is not itself a failed attempt, so the
  next three replacements may all fail before `failed`.
- On a fault the generation increases only when the replacement instance is ready (calls in flight reject
  with `lost` at once). Subscriptions re-run after `generationListeners` have run.
- In `failed` nothing is replaced and `query()`, `run()` and subscriptions reject with `failed`.
  `retry()` returns the client to `loading` with `failures` at 0.
- A descriptor or data document that fails validation, or a data document that disagrees with its
  descriptor, counts as a failed attempt.

## Subscription

| Field | Meaning |
|---|---|
| `statement`, `params` | the registered query |
| `listener` | called with `{status, generation, rows, error}` |
| lifecycle | runs when the instance is ready, and again after each replacement; results that arrive after `unsubscribe` are dropped |

## Scope

A string that identifies one page view (not a page), generated per view. When given to a load, every node
the load creates gets a `scope` property with the value. Dropping a scope is a detach-delete of the nodes
with that value. The worker removes every node with a `scope` property when it starts (the sweep, FR-027).

## Store and stored copy

One origin-private store per descriptor `id` (`rel-<id>`), used by one worker at a time, and one small file
beside it (outside the engine's directory) holding the **stored copy** of the descriptor.

| Item | Meaning |
|---|---|
| store contents | exactly the loaded graph; no bookkeeping node |
| stored copy | the descriptor of the graph the store holds; removed first, written last |
| states seen by a starting worker | no copy or empty store, matching revision, different revision, locked |
| start decisions | matching: restore without fetching the data, sweep, then check the node count against `data.nodes`; no copy, different revision or count mismatch: remove the copy, reset if not empty, fetch, validate, load, write the copy; locked: retry 100 ms rising to 500 ms for at most 5 s, then load in memory and write nothing |

## Profile

| Value | Configuration `navigation` | Behavior |
|---|---|---|
| `persistent` | `client-routing` | one client per visit; store optional |
| `per-page` | `multi-page` | one client per page; store on by default when a descriptor is given; departure on `pagehide` |

## Events

| Event | Payload |
|---|---|
| `status` | the new status and generation |
| `replaced` | reason (`trap`, `timeout`, `worker-error`, `stopped`) and the new generation |
| `timing` | phase (`init`, `open`, `load`, `restore`, `total`), milliseconds, and whether the graph was restored |

## Example site and conformance scenarios

A fixed descriptor and data document (a few hundred pages with links), plain pages that use the client, and
a list of scenarios (see [contracts/conformance.md](contracts/conformance.md)). The files and scenarios are
data that adapters import.
