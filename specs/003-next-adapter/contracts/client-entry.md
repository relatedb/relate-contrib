# Contract: client entry (`@relate/web-next/client`)

A `'use client'` module. Hook names and result shapes may change when tasks are written (ADR-005 §2.4).

## Provider

`RelatedWebProvider({ catalog, engineUrl, children })`: puts the catalog and the profile in context for the hooks, mirrors the catalog to module state in an effect, creates no client and starts no worker (FR-016, FR-024). `engineUrl` is the binary's URL, given by the site and passed to the core unchanged.

## Hooks

- `useGraph(id, options?)`: the core's client for the graph, or `null` until the first effect has run (FR-017).
- `useQuery(id, statement, params?, options?)`: `{ status, rows, error }`, subscribing through the core's `subscribe`, which re-runs after a worker replacement. Before the first effect it returns the same empty values the server renders (FR-017, FR-025).

`options` (testing aids, FR-023): `navigation` overrides the profile; `descriptor` overrides a registered graph's descriptor URL. Each changes only what it names.

## Lookup order and errors

A name is looked up among the current document's inline graphs, then the catalog (FR-018). An inline graph is the only matching element, or else the one whose parent element is visible (research D-4). A name found in neither throws, naming it and listing the registered names.

## Lifetimes

- Visit: one client per name, in module state; made with the core's `createClient` under `client-routing` and `createSiteClient` under `multi-page`; never destroyed by navigation (FR-019).
- Registered page: made with `createClient` (with `store: true` when the descriptor exists) by the first holder, shared by every holder, destroyed one task after the last holder is removed (FR-020).
- Inline: keyed by name and element; a new element is a new client; destroyed by the same rule (FR-021).

## Direct lookup

`graph(id, options?)`: a visit-lifetime graph only, available after the provider has mounted; fails for a registered page graph or an inline graph with a message that names the graph and says to ask from a component, and for an unknown name with the registered names (FR-022).
