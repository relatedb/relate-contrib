# @relate/contrib-nextjs

Next.js (app router) integration for `@relate/contrib-web`. It publishes graphs built from a site's content as revision-named static files, carries small graphs inside pages, and ties each graph's client to React components. The core does the rest: the worker, loading, faults, status.

Implements [ADR-005](../../design/adr/ADR-005-next-adapter.md). Needs Next 16, React 19, `@relate/contrib-web` and `@relate/relate-wasm` (all peer dependencies). Static export and the Node server are supported; the pages router, edge and serverless runtimes are not.

## Use, in five steps

1. **Wrap the configuration.** It makes the base path and the navigation profile (`"client-routing"` by default, or `"multi-page"`) known to client code and changes nothing else.

   ```js
   // next.config.mjs
   import { withRelate } from "@relate/contrib-nextjs";
   export default withRelate({ /* your config */ }, { navigation: "client-routing" });
   ```

2. **Declare the graphs.** A name maps to a source that returns a graph document (ADR-002), with optional indexes and a lifetime: `"page"` (default) or `"visit"`.

   ```ts
   // lib/graphs.ts
   import type { Graphs } from "@relate/contrib-nextjs/server";
   export const graphs = {
     site: { source: async () => buildSiteGraph(), lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
   } satisfies Graphs;
   ```

3. **Add the route file.** The two `export const` lines are literal because Next reads route settings from the file's text.

   ```ts
   // app/relate/[id]/[file]/route.ts
   import { createGraphRoute } from "@relate/contrib-nextjs/server";
   import { graphs } from "../../../../lib/graphs";
   export const dynamic = "force-static";
   export const dynamicParams = false;
   export const { GET, generateStaticParams } = createGraphRoute(graphs);
   ```

   With `cacheComponents: true`, Next refuses `dynamic` and `dynamicParams`; leave those two lines out.

4. **Add the provider** to the root layout. The layout is a server component and passes the catalog as props; the engine binary's URL is the site's to give.

   ```tsx
   // app/layout.tsx (server)            // app/providers.tsx ("use client")
   <Providers catalog={catalog(graphs)}>  <RelateProvider catalog={catalog} engineUrl={new URL("@relate/relate-wasm/relate_bg.wasm", import.meta.url)}>
   ```

   The root layout must call `catalog()`: `GraphData` uses the names it records to refuse an inline graph named like a registered one.

5. **Query from a component.**

   ```tsx
   "use client";
   import { useQuery } from "@relate/contrib-nextjs/client";
   const { status, rows } = useQuery("site", "MATCH (n:Page) RETURN count(n) AS c");
   ```

## Rules worth knowing

- **Provider placement.** The provider is cheap (it creates no client and starts no worker), but its module graph is in the bundle of every page under it. A site that wants pages without graphs to carry none of it mounts the provider in the layout of the sections that use graphs, not in the root layout. The engine binary is only fetched when a client is made.
- **Placeholder first.** `useGraph` returns `null` and `useQuery` returns `{ status: "idle", rows: null, error: null }` on the server and on the first client render, so the markup matches and hydration warns of nothing. The client is asked for in an effect. A page that uses no hook pays nothing.
- **Lifetimes.** A visit graph is made once and never destroyed by navigation. A registered page graph is shared by its holders and destroyed one task after the last one unmounts (so React's development double mount ends nothing), and at once when the document ends (`pagehide`, except when the browser keeps the page for the back button). Two consecutive pages that both ask for it in the same commit share one client.
- **Inline graphs.** `<GraphData id page document config />` (server; `page` is the page's path, for error messages, since a server component cannot read its own route without becoming dynamic) writes a validated `<script type="application/json" data-relate-graph>` into the page: no descriptor, no revision, no stored copy. Ask for it by name with the same hooks. A page can carry several; a second use of a name, an invalid document, and a name that is also registered fail the render (the server's check of the last depends on `catalog()` having run in the process, so the browser repeats it and refuses such a graph too). Under `cacheComponents` a hidden earlier page's element can stay in the document; the lookup takes the only match, else the first whose parent is visible.
- **Direct lookup.** `graph(id)` returns a visit graph for code outside components. It refuses page graphs and inline graphs, and is available once the provider has mounted (a later task or an event handler, not a child's first effect).
- **Determinism.** Next builds in several processes, and each evaluates a source. The same content gives the same revision in all of them, whatever the order of keys, nodes and links; a source that does not fails the build, naming the graph.
- **Base path.** The catalog's and the descriptor's locations include it, in a static export and for the Node server.
- **Static export hosting.** Serve the router's `.txt` payloads as `text/x-component`, or the router falls back to full page loads.
- **Testing aids.** Both hooks and `graph` accept `{ navigation, descriptor }` to override the profile or the descriptor location, each changing only what it names; the provider accepts `navigation`.

## Layout, tests

`src/` (`index.ts`, `env.ts`, `server/`, `client/`), `tests/` (unit, build, browser, package, trace), `conformance-site/` (an unpublished Next app built once per profile, as a server build and as an export, plus a `cacheComponents` build and a base-path build). The shared build code lives in `@relate/contrib-web/build`.

```sh
pnpm test:next                # unit, build and development-server tests
pnpm test:next-browsers       # Playwright in Chromium, Firefox and WebKit
pnpm test:next-conformance    # the core's conformance runner over the conformance site
pnpm test:next-package        # a clean Next project outside the repository, both bundlers
pnpm test:next-trace          # every requirement and success criterion has a passing, tagged test
```

`REL_ONLY=client-routing,multi-page` limits the builds Playwright makes and serves (names are in `playwright.config.ts`).
