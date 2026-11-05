# Data Model: Next.js Adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

The adapter owns no stored data. These are the shapes that pass between build time, the page and the client. Field names are the contract; the contracts directory holds the interfaces that carry them.

## Graph declaration (build time, server code)

| Field | Rule |
|---|---|
| name | key of the declaration map; follows ADR-003's id rule; unique (FR-004, FR-012) |
| source | function returning an ADR-002 document or a promise of one (FR-004) |
| indexes | optional list of `{ label, property }`; passed to the descriptor (ADR-003) |
| lifetime | `"page"` (default) or `"visit"` (FR-004) |

A declaration that breaks the id rule or repeats a name fails when the route is built (FR-012).

## Evaluated graph (build time, one per source per process)

| Field | Rule |
|---|---|
| text | canonical text of the validated document; what is served and what the revision hashes (FR-007) |
| revision | first 12 hexadecimal digits of the SHA-256 of `text` (FR-007) |
| nodes, links | counts of the validated document |

Evaluated once per source per process in the production build and per request in development (research D-5). The data file's requested revision must equal the revision of the evaluation that serves it, or the build fails (FR-009); in development a mismatch is a 404 (research D-3).

## Descriptor (published, ADR-003)

`{ version: 1, id: name, revision, data: { url, nodes, links }, indexes? }` where `data.url` is the revision-named file under the site's base path (FR-005, FR-010). Built by the core's build subpath.

## Published files

| Path | Content |
|---|---|
| `/related-web/<name>/descriptor.json` | the descriptor |
| `/related-web/<name>/graph.<revision>.json` | the canonical document |

Statically generated for export and for the production server; any other name or revision is not found (FR-006).

## Catalog (server to client, plain data)

`{ graphs: [{ id, descriptor, lifetime, indexes }] }`, where `descriptor` is the descriptor's path under the base path. Serializable (research V-2), passed as a prop to the provider (FR-011, FR-016).

## Inline graph (in the page)

An element `<script type="application/json" data-related-graph="<name>">` holding `{ document, config? }` as escaped JSON, where `config` is `{ indexes? }`. No descriptor, revision or stored copy (FR-013). Found by the client as in research D-4.

## Client-side state

| State | Where | Rule |
|---|---|---|
| Visit client | module state, one per name (and profile and descriptor) | created on first use, never destroyed by navigation (FR-019) |
| Page holders | module state, keyed `(name)` for registered graphs and `(name, element)` for inline graphs | count of components using the graph; destroy one task after the count reaches zero (FR-020, FR-021) |
| Catalog | React context, mirrored to module state in an effect | not written during render (ADR-005 §2.4) |

### Page client states

`absent` → (first holder) `held` → (last holder removed) `releasing` → (one task later, still no holder) `destroyed`; `releasing` → (a holder arrives in that task) `held`. A client in `destroyed` is never reused; the next holder makes a new one.
