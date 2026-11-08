# Data Model: Observable Framework Adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

The adapter owns no stored data. It moves three existing shapes (ADR-002's document, ADR-003's descriptor, the engine's result envelope) and defines the objects below.

## Graph source

A module whose default export is a function returning an ADR-002 document or a promise of one. Shared by the document loader and the descriptor loader of one graph. Plain JavaScript or JSON.

## Loader outputs

| Loader helper | Output (standard output) | Published as |
|---|---|---|
| `engine()` | the bytes of the installed engine's binary | `_file/data/<name>.<hash>.wasm` |
| `worker()` | one ES module: the core's worker entry and the engine's script glue | `_file/data/<name>.<hash>.js` |
| `document(id, source)` | the canonical text of the validated document (the core's canonical form) | `_file/data/<id>.graph.<hash>.json` |
| `descriptor(id, source, options)` | the ADR-003 descriptor: `{ version: 1, id, revision, data: { url, nodes, links }, indexes? }` with `revision` = first 12 hex digits of the SHA-256 of the canonical text, `data.nodes` and `data.links` the document's counts, and `data.url` the data file's logical name (`data/<id>.graph.json`) | `_file/data/<id>.descriptor.<hash>.json` |

Constraints, quoted from the spec and ADR-003: `id` follows ADR-003's id rule; a document that fails the core's validator fails the build with the path of the first problem (FR-009); `revision` does not depend on key or item order (FR-008).

## Open options

| Field | Type | Rule |
|---|---|---|
| `engine` | file attachment | the published engine binary; required |
| `worker` | file attachment | the published worker module; required |
| `graph` | `{ descriptor, data }` or `{ document, indexes? }` | `descriptor` and `data` are file attachments; `document` is a file attachment or an object the cell holds |
| `invalidation` | promise | the cell's invalidation; required |

For a descriptor input, the descriptor is read and its `data.url` replaced by the data attachment's published location before it reaches the core (FR-013).

## Opened graph

The resolved value of `open`'s promise.

| Member | Meaning |
|---|---|
| `client` | the core's client, created with the per-page profile |
| `ready` | resolves when the instance is ready; rejects when the client reaches `failed`, with the core's failure wording |
| `cypher` | the tagged template (FR-020) |
| `query(text, params)` | resolves to a normalized result through the core client's `query` |
| `graph(result)` | `{ nodes, links }` for a force layout (FR-019) |

State transitions are the core's (`loading`, `ready`, `recovering`, `failed`); the opened graph adds one: destroyed, on invalidation, on `pagehide`, and a document reload on `pageshow` with `persisted` (ADR-006 §2.3).

## Normalized result

`{ columns, columnTypes, rows, tableRows, stats, error, elapsedMs }`: `rows` are keyed in column order and keep the engine's tagged entities; `tableRows` flatten entities (node: `id`, `labels`, properties; relationship: `id`, `type`, `start`, `end`, properties; path: an array) with a non-enumerable text form; `error` is a string or null; an empty result has an empty `rows` that still carries its `columns`.

## Graph (for a force layout)

`{ nodes: [{ id, label, name, properties }], links: [{ source, target, type }] }`; a link whose endpoints are not both in `nodes` is dropped; a result with no entities gives `{ nodes: [], links: [] }`.
