# Contract: server entry (`@relate/sveltekit/server`)

Imported only from server code (a route file and a server-only layout load). Plain TypeScript; needs no browser, no Svelte file, no SvelteKit virtual module (FR-002), and no engine binary (FR-003).

## Route builder

`createGraphRoute(graphs)` returns `{ GET, entries }`, meant to be exported by a route file the site writes at `src/routes/relate/[id]/[file]/+server.ts`:

```ts
import { createGraphRoute } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";   // any module path
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
```

`export const prerender = true` stays a literal in the route file (SvelteKit reads it from the text); the destructured export is accepted (SPIKE-007 5.8).

- `entries()`: for every registered graph, evaluates the source twice, independently, fails the build when the two canonical texts differ (FR-009), and lists `{ id, file: "descriptor.json" }` and `{ id, file: "graph.<revision>.json" }` (FR-005).
- `GET({ params, url })`: `descriptor.json` returns the descriptor; `graph.<revision>.json` returns the canonical document; both as `application/json`. The base path is everything in `url.pathname` before `/relate/` (research D-6, FR-010). An unlisted id, a revision that is not current, or a path without `/relate/` answers 404 (FR-006). In development each call evaluates the source, so the revision follows edits.
- Errors: an invalid document fails with the graph's name and the first problem's path (FR-008); a malformed or duplicate id fails when the builder is called (FR-012).

## Catalog

`catalog(graphs)` returns the plain-data catalog of [data-model.md](../data-model.md) (FR-011), for a layout load:

```ts
// src/routes/+layout.server.ts
import { catalog } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const load = () => ({ catalog: catalog(graphs) });
```
