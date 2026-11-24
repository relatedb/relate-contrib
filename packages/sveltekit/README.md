# @relate/contrib-sveltekit

Implements [ADR-007](../../design/adr/ADR-007-sveltekit-adapter.md). Needs SvelteKit 3, Svelte 5, `@relate/contrib-web` and `@relate/relate-wasm` (all peer dependencies). The static and Node adapters are supported; edge and serverless adapters, SvelteKit 2 and hash routing are not.

Two entries:

- `@relate/contrib-sveltekit/server`: plain TypeScript for server code: `createGraphRoute(graphs)` and `catalog(graphs)`.
- `@relate/contrib-sveltekit`: Svelte source your build compiles (`.svelte` components and `.svelte.js` rune modules): `RelateProvider`, `GraphData`, `useGraph`, `useQuery`, `graph`.

There is no Vite plugin and no change to your build configuration.

## Use, in five steps

**1. Declare your registered graphs** in a module of your own (any path; `#lib/graphs.ts` here, through `package.json` `imports`, since SvelteKit 3 removed `$lib`):

```ts
// src/lib/graphs.ts
export const graphs = {
  pantry: { source: () => ({ version: 1, nodes: [/* ... */], links: [/* ... */] }), indexes: [{ label: "Page", property: "id" }], lifetime: "visit" },
};
```

A `source` returns an ADR-002 document (or a promise of one). `lifetime` is `"page"` (default) or `"visit"`.

**2. Add the route file** that publishes them. `export const prerender = true` stays a literal line:

```ts
// src/routes/relate/[id]/[file]/+server.ts
import { createGraphRoute } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
```

At build time each graph gets `relate/<id>/descriptor.json` and `relate/<id>/graph.<revision>.json` (the revision is a hash of the canonical document). A document that breaks the data format, a malformed or duplicate id, or a source that returns different content when called twice stops the build and names the graph and the first problem. The route works with `adapter-static` and `adapter-node` and under a base path (the builder reads the base from the request).

**3. Return the catalog from a server-only layout load** (the sources then never reach the browser bundle):

```ts
// src/routes/+layout.server.ts
import { catalog } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const load = () => ({ catalog: catalog(graphs) });
```

**4. Place the provider in the root layout**, with the engine's URL from your own `?url` import:

```svelte
<script>
  import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
  import { RelateProvider } from "@relate/contrib-sveltekit";
  let { data, children } = $props();
</script>
<RelateProvider catalog={data.catalog} {engineUrl}>{@render children()}</RelateProvider>
```

`navigation` is `"client-routing"` by default; pass `"multi-page"` for a site where every navigation loads a document (put `data-sveltekit-reload` on the body).

**5. Ask for a graph in a component**, and show a placeholder until it answers:

```svelte
<script>
  import { useQuery } from "@relate/contrib-sveltekit";
  const pages = useQuery("pantry", "MATCH (p:Page) RETURN count(p) AS n");
</script>
<p>{pages.rows ? pages.rows[0].n : "…"} pages ({pages.status})</p>
```

`useQuery(id, statement, params?)` returns reactive `status` (`"idle"` until the component has mounted, then the core's), `rows`, `error` and `generation`. `useGraph(id)` returns `{ client }`, the core's client, `null` on the server and until mounted. Arguments may be functions (`useQuery(() => id, () => statement)`) to follow reactive values. `graph(id)` returns the client of a visit-lifetime graph for code outside components and throws for page-lifetime and inline graphs and unknown ids, naming them.

## Inline graphs

```svelte
<script>
  import { GraphData } from "@relate/contrib-sveltekit";
  const document = { version: 1, nodes: [/* ... */], links: [] };
</script>
<GraphData id="recipe" {document} page="/recipes/soup" config={{ indexes: [{ label: "Step", property: "id" }] }} />
```

`GraphData` validates the document at render time and writes it into the page as an escaped `<script type="application/json" data-relate-graph>` element: no descriptor, no revision, no stored copy, no request. `page` names the page in error messages; a render fails for an invalid document or `config`, an id used twice in one render and an id that is also registered. The document is in the page twice (the element, and your component's code or the page's data), so register a graph instead when it is large; the size at which that pays is unmeasured.

## Lifetimes

A **visit** graph is created once and never destroyed by navigation. A registered **page** graph is shared by the components that use it and destroyed one task after the last one is removed, which keeps it across two consecutive pages that use it (SvelteKit removes the old page's components before the new page's appear). An **inline** graph is found by id among the page's inline elements and ends by the same rule. Everything counts in the browser only: `onMount` and `$effect` do not run on the server and `onDestroy` does, so nothing here uses `onDestroy`, and no module state is written on the server.

The helpers pass the core's client, status and events through unaltered: recovery from a crash or a timeout, the three-attempts rule and the failure wording are the core's.

## Notes

- Svelte source and the site's build: the package ships `.svelte` and `.svelte.js` files with `svelte` and `default` export conditions, so the site's build compiles them. Rune modules are plain `.svelte.js` (a `.svelte.ts` module in a package makes `vite dev` fail in dependency optimization).
- Workspace sites: a site that links these packages from a workspace needs `server.fs.allow` to include the repository root in `vite dev`; an installed package does not.
- The engine's binary appears two or three times in a build's output (the build's own copies, 6.25 MB each); only one is requested. Unmeasured costs: the second evaluation of every source at build time, the inline document's second copy, cold-network cost.
- Test hooks: the `navigation` and `descriptor` options of the helpers override the profile and the descriptor location and change nothing else.

## Develop

```sh
pnpm install
pnpm --filter @relate/contrib-sveltekit build
pnpm test:sveltekit              # route builder, registry, inline lookup, build failures, development server
pnpm test:sveltekit-browsers     # lifetimes, inline graphs, direct lookup, hydration, on-demand rendering
pnpm test:sveltekit-conformance  # the core's conformance scenarios over conformance-site/ (both profiles, both outputs)
pnpm test:sveltekit-package      # packs adapter, core and engine; installs in a clean SvelteKit 3 project
pnpm test:sveltekit-trace        # every requirement has a passing, tagged test
```
