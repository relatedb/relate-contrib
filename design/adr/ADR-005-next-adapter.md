---
id: ADR-005
title: The Next.js Adapter as React Bindings over the Core
status: accepted (amended 2026-11-05)
rfcs: [RFC-001, RFC-002]
created: 2026-11-05
---

# ADR-005: The Next.js Adapter as React Bindings over the Core

## 1. Context

Next.js is a React framework with a bundler (Turbopack by default in version 16, webpack as an option), a router that swaps pages in the browser (the app router), and several output modes: a static export, a Node server, and serverless or edge deployments. Six facts about it shape how the embedded graph database is added to a Next site.

- **The core already loads under Next with no configuration.** The core package `@relate/web-core` hosts the engine in a Web Worker. Under both bundlers, from a workspace link and from packed tarballs, in development, in a production build and in a static export, with and without `basePath`, the worker script and the engine's `.wasm` file were emitted and found when the app passed `new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url)` as the engine URL (SPIKE-006 §5.1). The adapter places nothing.
- **A client held in module state survives the app router.** The same worker, module and generation persisted through link clicks, history back and forward, `router.push` and `router.replace`, and navigation during a query or a load, in Chromium, Firefox and WebKit for the link and history cases (SPIKE-006 §5.2). The router is client-side by default, so the core's `client-routing` profile (one retained client for the visit) is the natural default, the reverse of Astro, where the default is one page per document.
- **Next has no way to inject a route or a virtual module.** An Astro integration adds endpoints and a configuration module to a site. A Next app owns its `app/` tree, and a bundler plugin would have to be written twice, once per bundler. What does work is a route handler written by the site author: `app/related-web/[id]/[file]/route.ts`, with `dynamic = "force-static"`, `dynamicParams = false` and a `generateStaticParams` that lists `descriptor.json` and `graph.<revision>.json`, wrote both files into a static export under both bundlers and with a base path, and served them from `next start` and `next dev`; an id that is not listed answered 404 (SPIKE-006 §4, addendum). A folder named `_related` is a private folder that the router skips, so the path cannot start with an underscore.
- **Content is not in a collection API.** Astro's sources can call `astro:content`. A Next site reads content from files, MDX, a CMS or its own modules. A graph source is therefore a plain function in the site's own code, run by Next's bundler (so it may import the site's modules and use its path aliases) when the route handler is built or requested.
- **Components render twice.** A server component renders on the server, and a client component renders on the server and again in the browser. A client component that showed a value from the instance during render produced React error 418 on hydration; moving the value into an effect removed it (SPIKE-006 §5.3). With the app router, the visible lifetime of a page is the lifetime of the components it mounts, not a router event, so a page-scoped client has to follow the React lifecycle (effects, unmount, and the double effect run of strict mode in development).
- **Server routes and static export exclude each other.** A route handler with `dynamic = "force-dynamic"` stopped `output: "export"` from building (SPIKE-006 §4, addendum). The engine itself ran in a Node route handler under both bundlers, but only when the `.wasm` path was not statically analyzable (`require.resolve` of the file failed in both bundlers); the edge runtime is marked deprecated in 16.4.5 and gave mixed results (SPIKE-006 §5.4).

The Astro adapter (ADR-004) settled the decisions that do not depend on the framework: graphs are declared either as registered graphs (a revision-named data file plus a descriptor, from a source function) or as inline page graphs (a small validated document written into the page); a registered graph has a `"page"` or a `"visit"` lifetime; a page asks for a graph by id; the profile is an explicit option. What is different for Next, and what the two adapters should now share, is decided below. The decision serves RFC-001 (embedding in frameworks) and RFC-002 (page graphs and shared graphs alike). It settles RFC-001 §7.7 (no placement work under either bundler) and §7.6 for the app router; §7.5 is answered for static export and the Node server and stays open for edge and serverless.

## 2. Decision

### 2.1 Package: `@relate/web-next`, with a server entry and a client entry

A workspace package `packages/next`, published as `@relate/web-next`, in the `@relate` organizational namespace the project's packages are adopting (2026-11-05). The core and the Astro adapter are in the same namespace, as `@relate/web-core` and `@relate/web-astro`. It has three entry points:

- `@relate/web-next` (default entry): `withRelatedWeb(nextConfig, options)`, a wrapper for `next.config`. It adds the site's `basePath` and the profile to `env` so client code can read them, and changes nothing else. The client must prefix descriptor URLs with the base path; the router's own copy of it is an internal name (`__NEXT_ROUTER_BASEPATH`) that SPIKE-006 did not try. The wrapper is also where later options go, as the `config` value on `GraphData` is for a graph.
- `@relate/web-next/server`: `createGraphRoute(graphs)`, which builds the exports of the route handler (section 2.2); `catalog(graphs)`, which turns the graph declarations into plain data (ids, descriptor paths, lifetimes) a server component can pass to a client component; and `GraphData`, a server component that writes an inline graph into the page (section 2.3). It has no browser dependency and is imported only from server code.
- `@relate/web-next/client`: a `'use client'` module with `RelatedWebProvider` and the hooks (section 2.4).

Peer dependencies are `next` (version 16), `react` (version 19), `@relate/web-core` and `@neo4j-labs/cypherlite-wasm`. The adapter has no other runtime dependency. The site passes `new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url)` through the provider's `engineUrl` prop; the adapter does not import the binary itself, since a static `.wasm` import in a package that server code can reach is the trap described in section 1.

### 2.2 Build time: a route handler written by the site, built by the adapter

The site declares registered graphs in one module and hands them to a route file that is three lines long:

```ts
// lib/graphs.ts
export const graphs = {
  "pantry-data": { source: () => loadPantry() },
  site: { source: () => buildSiteGraph(), lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
};

// app/related-web/[id]/[file]/route.ts
import { createGraphRoute } from "@relate/web-next/server";
import { graphs } from "../../../../lib/graphs";
export const dynamic = "force-static";
export const dynamicParams = false;
export const { GET, generateStaticParams } = createGraphRoute(graphs);
```

The two `export const` lines are written out in the route file, because Next reads route segment configuration from the file's own text and does not follow a re-export.

A `source` is a function that returns an ADR-002 data document or a promise of one (ADR-002), run by Next's bundler in server code. `createGraphRoute` evaluates it, validates the document with the core's validators, and produces:

- `generateStaticParams`: one entry for `descriptor.json` and one for `graph.<revision>.json` for every registered graph;
- `GET`: the ADR-003 descriptor (with `revision`, `data.url` pointing at the revision-named file under the site's base path, and `data.nodes` and `data.links`) or the data document, as JSON.

The revision, the canonical text it is computed from, and the descriptor are those of ADR-004 §2.2: the first 12 hex digits of the SHA-256 of the canonical document. Both adapters must produce the same revision for the same document, so that code moves out of `@relate/web-astro` into the core as a runtime-neutral subpath export `@relate/web-core/build` (canonical text, revision, document preparation, descriptor construction, and the inline-document check and JSON escaping for a script element, with no DOM, no Node-only module and no framework import; the revision is hashed with Web Crypto, so it and document preparation are asynchronous). `@relate/web-astro` is changed to import it; its tests, which pin revisions, are the check that nothing moved. This is the follow-up ADR-004 §4 left for the arrival of a second adapter, and ADR-004 §6 is amended to say where the code lives.

Next builds static pages in several worker processes, so a source is evaluated once per process, and the process that writes `descriptor.json` can differ from the one that listed `graph.<revision>.json`. `GET` for a data file therefore checks that the revision in the requested name equals the revision of its own evaluation, and throws if not, so a source that returns different data on each call fails the build instead of producing a descriptor that points at a file that does not exist. Sources must be deterministic, as in ADR-004.

Under `output: "export"` the two files are written to `out/related-web/<id>/`; under `next start` they are served with the route handler's cache headers. The site's base path is added to `data.url` and to the descriptor URL the client uses (section 2.4).

### 2.3 Page graphs: an inline document from a server component

`GraphData` takes `id`, `document` and an optional `config` holding a list of indexes, as the Astro component does, and renders `<script type="application/json" data-related-graph="{id}">` with the JSON escaped for a script element:

```tsx
// app/recipes/[slug]/page.tsx (a server component)
import { GraphData } from "@relate/web-next/server";
export default async function Recipe({ params }) {
  const recipe = await getRecipe((await params).slug);
  return <GraphData id="recipe" document={graphOf(recipe)} />;
}
```

The document is validated when the page renders, which for a statically generated page is at build time; an invalid document, a second `GraphData` with the same id in one render, or an id that is also registered fails that render. An inline graph has no descriptor, revision or stored copy, and the client reads it from the DOM.

### 2.4 Client module: React bindings with the lifetime tied to components

`RelatedWebProvider` is a client component that the root layout renders with the `catalog` (plain data from the server), the `engineUrl`, and the profile. It puts the catalog in React context for the hooks and also writes it to module state in an effect, for the exported `graph(id)`; module state is not written during render, because a client component's render also runs on the server and module variables there are shared across requests. It renders its children unchanged, creates no client and starts no worker.

The hooks (names and result shapes may change when the plan is written) all return a null or idle value on the server and on the first client render, so the markup the server produced is the markup the first render produces:

- `useGraph(id, options?)` returns the core client for the graph, or `null` until the first effect has run. It is the lookup that `onPage` and `graph` provide in the Astro adapter.
- `useQuery(id, statement, params?)` returns `{ status, rows, error }` and subscribes through the core's `subscribe`, which re-runs the statement after a worker replacement.

`options.navigation` overrides the profile and `options.descriptor` overrides a registered graph's descriptor URL, as in ADR-004; both exist for the conformance check (its profile scenario and its descriptor variants) and change nothing else. `useQuery` takes the same options.

Lifetimes follow ADR-004's two values with React's lifecycle in place of router events:

- A registered `"visit"` graph is made once per name in module state (with `createClient` under `client-routing` and `createSiteClient` under `multi-page`, as ADR-004 does) and is never destroyed by navigation. The module outlives layout and page unmounts, which is what SPIKE-006 §5.2 observed.
- A registered `"page"` graph is made with `createClient` (with `store: true`, as in ADR-004) by the first component that holds its id, and is shared by every holder until none remains. The client is destroyed in a task after the last holder unmounts (`setTimeout(0)`), so the mount, unmount, mount sequence of strict mode in development reuses it. A page that follows and asks for the same registered id in that task reuses the client, which is correct because the descriptor, and so the data, is the same; a page that asks for a different id leaves the old client to be destroyed while the new one opens its own store.
- An inline graph is keyed by its id and by the `data-related-graph` element it was read from, so the next page's element gets a new client even when the id is unchanged (every recipe page has its own `"recipe"`). The previous client is destroyed by the same rule. An inline graph has no store, so no store conflict arises.
- A holder is a component that has called `useGraph` or `useQuery` for the id and has not unmounted. An inline graph is found by `id` among the `data-related-graph` elements in the current document at the time of the first effect: the only match if there is one, otherwise the first match whose parent element is visible (`checkVisibility()`), because a router that keeps a departed page hidden leaves its element in the document; a registered graph is found in the catalog. An id found in neither throws an error naming the ids that exist.

A hook or a call that asks for a `"page"` or inline graph from outside a component is not possible; code that lives across pages asks for `"visit"` graphs through `useGraph` in a persistent client component, or through the exported `graph(id)` function, which accepts only visit-lifetime graphs and throws for any other, as ADR-004's `graph()` does.

### 2.5 Profile: `client-routing` by default

`navigation` is `"client-routing"` (the default) or `"multi-page"`, given to `withRelatedWeb` and read by the provider. The app router always has its client router, so no development warning for a mismatch is needed. A site that uses `multi-page` anyway (for example because every navigation is a document load) gets the core's per-page behavior. The pages router is not supported.

### 2.6 Output modes and runtimes

- Static export (`output: "export"`) and the Node server (`next build` then `next start`) are supported. The graph files are built by the route handler in both. A site with any server-only route handler cannot export; that is Next's rule, and the adapter adds no server-only route.
- The adapter does not run the engine on the server. Server code that uses the adapter imports the core's validators and `@relate/web-core/build`, which need no `.wasm`.
- Serverless and edge deployments are not decided. The browser side does not depend on the runtime, and the graph files are static when exported; running the engine in a route handler (it works on Node, SPIKE-006 §5.4) is a different use and out of scope.
- Next 16 is the checked version, with both Turbopack and webpack. The app router only.

### 2.7 Checked against the core's conformance scenarios

`packages/next/conformance-site` is a Next app, not published, that reproduces the example pages' `data-gw-*` markup (`conformance/example-site/gw-page.ts` in the core defines it) using only `@relate/web-next`: a shared registered graph (`"visit"`), a page with its own inline graph, a page that asks for a registered `"page"` graph, and a page with two graphs. It is built once per profile as a production build and served with `next start`, and the same build is exported and served as static files; the core's conformance runner (ADR-004 §2.5, including its `dataRequests` and `descriptor` parameters) drives it in Chromium, Firefox and WebKit. Adapter tests cover destruction of a page client on departure (including under strict mode), a stored copy available to the next page, rejection of a page-lifetime id by `graph()`, and the build failures of section 2.3 and the revision check of section 2.2. A package test, like the core's and the Astro adapter's, packs `@relate/web-next`, the core and the engine, installs them in a clean Next project outside the repository, and builds and runs a page under both bundlers.

## 3. Alternatives Considered

- **A bundler plugin that injects routes and a virtual configuration module, as the Astro integration does.** Rejected: Next exposes no route injection, and a plugin would need a Turbopack implementation and a webpack implementation that agree. The route handler the site owns works under both without plugin code (SPIKE-006 §4).
- **Writing the data and descriptor into `public/` from a script that runs before `next build`.** Rejected: the script runs outside Next's bundler, so a source could not import the site's modules or path aliases without a second transpile step, and `next dev` would serve stale files until the script ran again.
- **Evaluating sources in `next.config` through `withRelatedWeb`.** Rejected for the same reason, and because configuration loading runs before the app's TypeScript, aliases and environment are set up.
- **One shared client through React context alone, with no module state.** Rejected: a context value is lost when a layout that holds the provider remounts, and the spike observed the worker surviving only because the client lived in module state. The provider carries the catalog, not the client.
- **Client components that take the graph as a prop, with no hooks.** Rejected: every component would have to create, share and destroy page clients itself, which is the lifecycle the hooks exist to hold.
- **Tying page clients to route changes with `usePathname`.** Rejected: a layout that stays mounted across pages would not see its children unmount, and an effect on the pathname fires after the next page has already mounted and asked for its own client, which is the ordering that makes two clients open one store.
- **Copying the revision and descriptor code into the Next adapter.** Rejected: two copies of a hash that decides whether a stored graph is reused would drift, and ADR-004 already named the move into the core as the follow-up when a second adapter arrived.
- **Supporting the pages router in the first version.** Deferred: it has a different lifecycle (a single `_app` that persists and `routeChangeStart` events) and a different way to serve files, and the app router is where Next is heading.
- **Supporting the edge runtime for the engine.** Deferred: the edge runtime is marked deprecated in Next 16.4.5 and gave different results per bundler in SPIKE-006, and no browser-facing feature needs it.

## 4. Consequences

- A Next site gets a working graph from a graphs module, a three-line route file, a provider in the root layout and a hook; it writes no hashing, descriptor or lifecycle code. The site writes the route file itself, so a site that forgets it has no graph files and the client's descriptor request fails with the core's `failed` status, not a build error. A development warning from the provider when a registered graph's descriptor answers 404 is follow-up work.
- Moving the revision and descriptor code into `@relate/web-core/build` changes the core's public surface (a new subpath export) and the Astro adapter's imports. It is behavior-preserving and covered by the Astro adapter's existing revision tests, but it is a change to two packages in one change, and the core's own tests need a unit test for the subpath.
- The page lifetime is wired in the adapter again, in React terms this time, so the two implementations share no lifecycle code and each makes its own decision about instance lifetime, which RFC-001 asked the core to hold. Whether the core should hold a primitive that both express (a client owned by a counted set of holders, destroyed after the last one leaves) is open, and a third adapter would settle it.
- A source is evaluated in each of Next's static-generation processes, so an expensive source is run several times per build. The revision check turns nondeterminism into a build failure; it does not reduce the cost.
- A page client is destroyed one task after its last holder unmounts. That is enough for strict mode's remount; a registered graph that two consecutive pages share is reused rather than reopened. A different registered graph's store can be opened by the next page before the old client's worker has released its own; the core's bounded retry for a locked store covers that (ADR-004).
- Inline graphs share ADR-004's cost: no revision, no stored copy, replayed on every load. The size at which a graph should be registered instead is still unmeasured.
- The route's path is `/related-web/<id>/...`, a name in the site's URL space; a site that already uses that path in its router cannot also serve graphs there. `createGraphRoute` takes no path option because the route's location is set by where the file lives, and the client reads the path from the catalog.
- Next 16's behavior when the router keeps an earlier page mounted but hidden (a route cache that preserves a page's state) was not examined in SPIKE-006. A hidden page that stays mounted keeps its holders, so its page clients stay open, and an inline graph read from the document could find the hidden page's element as well as the visible one's. Both need a check in the plan before the lifecycle is implemented.
- Two details the route design relies on were not exercised in SPIKE-006 and are checked first in implementation: that `export const { GET, generateStaticParams } = createGraphRoute(graphs)` is accepted by both bundlers and by `next build` (the spike used declared functions), and that the catalog, with lifetimes and indexes, passes from a server component to the provider as props.
- Next's dev server re-evaluates a route handler per request; whether `generateStaticParams` is re-run so that a changed source gives a new revision-named file in development was not tested and needs a check in the plan, as the Astro adapter's dev behavior did.
- The app router's server components can read the same content as a graph source, so a site can derive a page's inline graph and a registered graph from one function. Querying the graph from a server component (the engine on the server) is a different feature, covered by RFC-002's open questions on dashboards and by RFC-001 §7.5; it is not decided here.
- Serverless size limits, the edge runtime, and the native Node package under Next were not measured and are left open in RFC-001 §7.5.
- The adapter ships hooks for React only, because Next is a React framework; components for other frameworks belong to their own adapters.

## 5. Related

- RFCs: RFC-001, RFC-002
- Builds on: ADR-001 (hosting and profiles), ADR-002 (data format), ADR-003 (descriptor), ADR-004 (the Astro adapter)
- Evidence: SPIKE-006 (embedding the core in Next.js)

## 6. Amendments

- 2026-11-05 (planning, `specs/003-next-adapter/research.md`): three gaps found while planning the implementation. (1) The revision cannot use `node:crypto` in a runtime-neutral subpath, so `@relate/web-core/build` hashes with Web Crypto (same SHA-256, same revisions) and `revisionOf` and document preparation become asynchronous; the Astro adapter gains `await` and no changed expectation. (2) The inline-document check and JSON escaping, which `GraphData` needs and Astro already has, move into the same subpath, with the caller's name as a parameter of the error text. (3) With `cacheComponents: true` a departed page's inline-graph element stays in the document, hidden, though its holders are released; the inline lookup in section 2.4 takes the only match, else the first visible one. The destructured route export, the catalog as props, the development server following source edits (a stale revision is a 404 there) and hidden earlier pages were checked and work as section 2 states.
- 2026-11-05: the package is named `@relate/web-next`, under the `@relate` namespace, instead of `related-web-next`. Entry points are `@relate/web-next`, `@relate/web-next/server` and `@relate/web-next/client`. Nothing else in the decision changes. The core and the Astro adapter were named `related-web-core` and `related-web-astro` when this was written; they are renamed `@relate/web-core` and `@relate/web-astro` (2026-11-05, patch `patch/relate-namespace`), and the text of this ADR and the earlier ones uses the new names.

- 2026-11-05 (implementation, `specs/003-next-adapter`): the four questions above and RFC-001 §7.5, checked against the built adapter and the conformance site (Next 16.4.5, Turbopack and webpack, Chromium, Firefox and WebKit).
  - A hidden earlier page: with the default configuration a departed page unmounts and its inline-graph element leaves the document. With `cacheComponents: true` the router keeps the departed page hidden, releases its holders, and leaves its element in the document; the lookup of section 2.4 (the only match, else the first whose parent is visible) gives each page its own graph, and the lifetime tests pass on both builds.
  - The development server follows source edits: a new descriptor revision is served at once, the old revision's file answers 404, and an invalid source answers 500 with the graph's name and the path of the first problem. Next's own list of the route's files can trail an edit by a moment, so the new data file may answer 404 briefly. In a build, a revision that is not the evaluation's fails the build; at any other time (development, or a route not limited to its listed files) it answers 404, decided by `NEXT_PHASE`.
  - The destructured route export and the catalog as props work under both bundlers, in the production server build and in a static export.
  - `cacheComponents: true` refuses the route segment settings `dynamic` and `dynamicParams` in any file. A site that enables it leaves those two lines out of the route file (and out of its own pages); the route is then prerendered from `generateStaticParams`, and an unlisted file reaches `GET`, which answers 404. The rest of the route file is the same three-line form.
  - A page client is also destroyed on `pagehide`, so a closed tab, a reload or a link to another document ends it at once; and two consecutive pages that both ask for one page-lifetime graph in the same commit share one client, because the hold of the arriving page cancels the pending destruction.
  - `GraphData` takes an optional `page` for its messages; its check that an id is not also registered uses the names `catalog()` and `createGraphRoute()` recorded in the process, so the root layout must call `catalog()`. `graph(id)` reads the mounted provider, so it is available after the provider's effect has run (a later task, or an event handler), not in a child's first effect.
  - A static export host must serve the router's `.txt` payloads as `text/x-component`; otherwise the router falls back to full page loads. The conformance site's server does so.
  - RFC-001 §7.5: static export and the Node server are settled for Next 16 with the app router and either bundler. Edge and serverless runtimes remain open; the edge runtime is deprecated and the native package and serverless were not tried.

The open questions this ADR left for implementation, as first written (answered in the entry of the implementation above): whether Next 16 keeps a hidden earlier page mounted (section 4), whether `next dev` gives a new revision-named file when a source changes (section 4), the destructured route export and the catalog passed as props (section 4), and the questions left open in RFC-001 §7.5. The plan and the implementation settle each one, and this ADR is amended with what was found, as ADR-004 was.
