# Data Model: SvelteKit Adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

The adapter owns no stored data. It moves two existing shapes (ADR-002's document, ADR-003's descriptor) and defines the objects below.

## Declaration

`graphs` maps an id to `{ source, indexes?, lifetime? }`.

| Field | Type | Rule |
|---|---|---|
| id (the key) | string | ADR-003's id rule (checked with the core's descriptor validator); no duplicates |
| `source` | `() => GraphDocument \| Promise<GraphDocument>` | required; called at build time (twice per graph, independently) and in development on each request |
| `indexes` | `Array<{ label: string; property: string }>` | optional; created before the nodes |
| `lifetime` | `"page" \| "visit"` | default `"page"` |

## Published files

| File | Content |
|---|---|
| `relate/<id>/descriptor.json` | the ADR-003 descriptor: `{ version: 1, id, revision, data: { url, nodes, links }, indexes? }` where `revision` is the first 12 hex digits of the SHA-256 of the canonical text, `data.url` is `<base>/relate/<id>/graph.<revision>.json`, and `nodes` and `links` are the document's counts |
| `relate/<id>/graph.<revision>.json` | the canonical text of the document |

Constraints, from the spec and ADR-003: the id follows the id rule (FR-004); a document that fails the core's validator fails the build with the graph's name and the first problem's path (FR-008); two evaluations of one source give one canonical text (FR-009); the revision does not depend on key or item order (FR-007).

## Catalog

An array of `{ id, lifetime, indexes }`, plain data (JSON round-trips to itself), with no locations (FR-011).

## Inline graph element

`<script type="application/json" data-relate-graph="<id>">` holding the document escaped by the core's `escapeJson`. The `config` (a list of indexes) travels beside the document in the same JSON under a reserved key, validated by the core's inline check.

## Provider context

`{ catalog, engineUrl, navigation, renderIds }`, set once by the provider; `renderIds` is the record of inline ids used so far in one render (made per render, FR-014).

## Holder, lifetimes and state transitions

- A **holder** acquires in `onMount` and releases in that `onMount`'s cleanup (FR-022).
- **visit** graph: absent, then created by the first holder or `graph()` call, then held for the rest of the visit (never destroyed by navigation).
- **page** registered graph: absent, then created by the first holder; holders 1..n share it; when the count reaches 0 a destroy is scheduled one task later; a holder acquiring before the task runs cancels it.
- **inline** graph: keyed by `(id, element)`; the same lifecycle as a page graph; a different element for the same id is a different client.
- Module state is touched only after mount (browser); on the server no registry exists.
