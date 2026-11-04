# Data Model: Astro Adapter

Entities from the spec, with fields and rules. Names are logical; shapes are fixed in `contracts/`.

## Registered graph (build-time, integration option)

| Field | Rule |
|-------|------|
| `name` | graph id; ADR-003's id rule; unique among registered graphs; not used by an inline graph on any page (FR-005, FR-014) |
| `source` | a module whose default export returns an ADR-002 document (or a promise of one), or a JSON file holding one (FR-003) |
| `indexes` | optional list of `{label, property}`, passed to the descriptor (FR-002) |
| `lifetime` | `"page"` (default) or `"visit"` |

Derived at build: `document` (validated, canonical), `revision` (12 hex), `descriptor` (ADR-003: `version`, `id` = name, `revision`, `data.url` = hashed file under the base path, `data.nodes`, `data.links`, `indexes`).

States: *not evaluated* → *ready* (document and revision) or *failed* (error with the path of the first problem). In a build, *failed* ends the build; in the dev server it is served as an error status until the next successful evaluation.

## Inline graph (in a page)

| Field | Rule |
|-------|------|
| `name` | ADR-003 id rule; unique on the page; not registered |
| `document` | ADR-002 document, validated at build |
| `config` | optional `{ indexes: [{label, property}] }`, validated at build; the one place for later per-graph settings |

No descriptor, revision or stored copy. Always `"page"` lifetime.

## Page client (browser)

One core client per (page, name). Created by `page.graph(name)`, destroyed on departure. Fields held by the registry: `name`, `lifetime`, `client`, `page token`. Rule: a second ask for the same name on the same page returns the same client (FR-020). A visit-lifetime graph's client is the core's (`createSiteClient`); under `multi-page` it is also cached per page and name (FR-021).

## Page entry registration

`setup` function, optional `selector` (D-2). States per page: *waiting* → *set up* (cleanup held) → *cleaned up*. Rule: setup of the next page runs only after cleanup of the previous page (FR-019).

## Configuration handed to the client (virtual module)

`profile`, `engineUrl` (set by the client module, not configuration), and for each registered graph: `name`, `descriptor` URL (with base), `lifetime`. The documents and sources are not in it.
