# Contract: server entry (`@relate/nextjs/server`)

Imported only from server code. Needs no browser and no binary (FR-003).

## Route builder

`createGraphRoute(graphs)` returns `{ GET, generateStaticParams }`, meant to be exported by a route file the site writes at `app/relate/[id]/[file]/route.ts`:

```ts
export const dynamic = "force-static";
export const dynamicParams = false;
export const { GET, generateStaticParams } = createGraphRoute(graphs);
```

The two `export const` lines are literal in the route file because Next reads route segment configuration from the file's text; the destructured third export is accepted by both bundlers (research V-1).

- `generateStaticParams()`: for every registered graph, `{ id, file: "descriptor.json" }` and `{ id, file: "graph.<revision>.json" }`.
- `GET(request, { params })`: `descriptor.json` returns the descriptor; `graph.<revision>.json` returns the canonical document; both as JSON. A data file whose revision differs from its own evaluation fails the build (production) or answers 404 (development). An undeclared id answers 404 (FR-005, FR-006, FR-009).
- Errors: an invalid document fails with the graph's name and the first problem's path (FR-008); a malformed or duplicate name fails when the builder is called (FR-012).

## Declarations

`graphs` maps a name to `{ source, indexes?, lifetime? }`:

| Property | Type | Default |
|---|---|---|
| `source` | `() => GraphDocument \| Promise<GraphDocument>` | required |
| `indexes` | `Array<{ label: string; property: string }>` | none |
| `lifetime` | `"page" \| "visit"` | `"page"` |

## Catalog

`catalog(graphs)` returns the plain-data catalog of data-model.md for a server component to pass to the provider. Descriptor paths include the site's base path (FR-010, FR-011).

## `GraphData`

A server component with props `id`, `document` and optional `config: { indexes? }`. It validates with the core's inline check (research D-2) and renders the `data-relate-graph` script with escaped JSON. It fails the render, naming the page, for an invalid document or `config`, a second use of the same id in one render, and an id that is also registered (FR-013, FR-014). Per-render bookkeeping of ids uses a request-scoped store so concurrent renders do not share it.

## Configuration wrapper (`@relate/nextjs`)

`withRelate(nextConfig, { navigation? })` returns the configuration with `env` values for the base path and the profile and nothing else changed. `navigation` is `"client-routing"` (default) or `"multi-page"` (FR-002).
