---
id: ADR-007
title: The SvelteKit Adapter as Svelte 5 Helpers over the Core
status: proposed
rfcs: [RFC-001, RFC-002]
created: 2026-11-08
---

# ADR-007: The SvelteKit Adapter as Svelte 5 Helpers over the Core

## 1. Context

SvelteKit builds a site from files under `src/routes`, renders pages on a server or at build time (prerendering), hydrates them in the browser, and then replaces one page component with another on each client-side navigation. Its bundler is Vite. Six facts about the current version, SvelteKit 3 with Svelte 5, shape how the embedded graph database can be added to a site (SPIKE-007 ran all of them in Chromium, Firefox and WebKit).

- **The bundler places the binary and the worker.** With the engine's binary imported by the site as a `?url` asset, an unmodified core ran in `vite dev` and in production builds for `adapter-static` and `adapter-node`, with and without a base path: the worker came out as `_app/immutable/workers/worker-<hash>.js`, the binary as `_app/immutable/assets/relate_bg.<hash>.wasm`, both prefixed by the base. The binary is emitted two or three times in the output (6.25 MB each). A core symlinked from a workspace needed `server.fs.allow` in `vite dev` and nothing in a build; a core and engine installed from tarballs needed nothing anywhere.
- **SvelteKit cannot add routes, and its configuration moved.** Routes are files; a package cannot inject one, so the descriptor and the data file have to come from a route the site writes. SvelteKit 3 reads its configuration from the `sveltekit({ ... })` Vite plugin (a `svelte.config.js` stops the build), removed `$lib` and `base` from `$app/paths`, and expects TypeScript 6.
- **A prerendered endpoint publishes the files.** `src/routes/relate/[id]/[file]/+server.ts` with `export const prerender = true` and an `entries()` function wrote `relate/example/descriptor.json` and `relate/example/graph.<revision>.json` into the static output, under a base path too, and a static host answered 404 for another name. `entries()` and every `GET` ran in one process, which a build of Next does not do.
- **A module-state client survives navigation, and the old page ends first.** One client and one worker lasted across link clicks, `goto` and history navigation; a hard reload and a link that reloads the document ended them. When SvelteKit replaces one page with another, the old page's `onDestroy` ran before the new page's `onMount`, so a graph used by consecutive pages has no holder in between.
- **Svelte's lifecycle is not symmetric on the server.** During prerendering a component's script and `onDestroy` run, with `window` undefined, and `onMount` and `$effect` do not. A component that read the instance in its first render showed the server's text on the server and the client's after hydration, with no warning.
- **A package can ship Svelte source.** A package with `.svelte` and `.svelte.js` (rune) files and a `svelte` export condition, installed from a tarball, was compiled by the site's own build, prerendered, and reacted in the browser.

An inline graph is a `<script type="application/json">` element written with `{@html}`; with the document escaped by the core's `escapeJson`, text containing `</script>`, `<!--` and `&` survived the round trip, and after a navigation and after going back the document held one such element, since SvelteKit replaces the page.

The core package `@relate/web` provides the client, loader, descriptor handling and profiles (ADR-001, ADR-002, ADR-003), and the build-time code in `@relate/web/build` (canonical text, revision, document preparation, descriptor construction, the inline-document check and JSON escaping; ADR-005). The Astro, Next and Observable adapters (ADR-004, ADR-005, ADR-006) show the shape of an adapter: publish graphs at build time, let a page ask for one, tie its client to the page's lifetime. RFC-001 §5.1 frames an adapter as owning only that wiring; RFC-002 §5.1 and §5.2 list the data sources and page shapes it has to cover.

## 2. Decision

### 2.1 Package: `@relate/sveltekit`, two entries

A workspace package `packages/sveltekit`, published as `@relate/sveltekit`, for SvelteKit 3 and Svelte 5:

- `@relate/sveltekit`: Svelte source for the browser and for rendering: `RelateProvider`, `GraphData`, `useGraph`, `useQuery`, `graph` (section 2.3 and 2.4), shipped as `.svelte` and `.svelte.ts` files, with `svelte` and `default` export conditions pointing at them, so the site's build compiles them;
- `@relate/sveltekit/server`: plain TypeScript for server code: `createGraphRoute` and `catalog` (section 2.2).

Peer dependencies are `@sveltejs/kit` (version 3), `svelte` (version 5), `@relate/web` and `@relate/relate-wasm`. There is no other runtime dependency and no Vite plugin: nothing in the adapter needs the bundler's cooperation. The package never imports the engine's binary; the site imports it as a `?url` asset and hands the URL to the provider.

### 2.2 Build time: a prerendered route, a catalog from a layout

A graph is identified by an id (the id rule of ADR-003) and declared as in ADR-005: an id mapped to `{ source, indexes?, lifetime? }`, where `source` is a function returning an ADR-002 document or a promise of one, and `lifetime` is `"page"` (default) or `"visit"`. The adapter ships no default extractor; what a document contains is outside this decision.

**The route.** The site writes `src/routes/relate/[id]/[file]/+server.ts`:

```ts
import { createGraphRoute } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
```

`export const prerender = true` stays a literal in the file, since SvelteKit reads it from the text. For each registered graph the builder publishes a descriptor (`descriptor.json`) and a data file (`graph.<revision>.json`), where `<revision>` is the first 12 hex digits of the SHA-256 of the canonical document (the core's build code, not a copy). `entries()` lists both names for every graph. `GET` answers a name that is not listed with 404. The descriptor's data location and the route's own location carry the site's base path; the builder derives it from the request, as everything in the request's path before `/relate/`, and uses no `$app` module, so the server entry has no dependency on SvelteKit's virtual modules.

**Failure at build time.** A document that fails the core's validator fails the build, naming the graph and the path of the first problem. Because `entries()` and `GET` run in one process, the check that Next needs between processes would see nothing; instead `entries()` evaluates every source twice, independently, and fails the build, naming the graph, when the two canonical texts differ. A malformed id or a duplicate id fails when the builder is called.

**In development** the endpoint is not prerendered: `GET` evaluates the source on each request, so the descriptor's revision follows edits, and answers 404 for a revision that is not the current one.

**The catalog.** `catalog(graphs)` returns plain data (ids, descriptor locations with the base path, lifetimes, indexes). The site returns it from a server-only layout load, so the sources never enter the browser bundle:

```ts
// src/routes/+layout.server.ts
import { catalog } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const load = () => ({ catalog: catalog(graphs) });
```

### 2.3 Inline graphs and the provider

`GraphData` is a component that takes `id`, `document`, an optional `config` (a list of indexes, created before the nodes) and `page` (a name for error messages). It validates the document with the core's inline check and writes `<script type="application/json" data-relate-graph="<id>">` with the document escaped, using `{@html}`. It has no descriptor, no revision, no stored copy and no request. The render fails, naming the page, for an invalid document or `config`, for an id used twice in one render, and for an id that is also registered; the render's own record of ids and the registered ids come from the provider's context.

`RelateProvider` takes the catalog, the engine's URL (the site's `?url` import) and `navigation` (`"client-routing"`, the default, or `"multi-page"`), and makes them available to the helpers through Svelte's context. It creates no client and starts no worker. It belongs in the root layout.

### 2.4 Client helpers: Svelte 5 reactive objects over `onMount`

All helpers are called while a component initializes, and none touches the instance before the component has mounted.

- `useGraph(id, options?)` returns an object whose `client` property is the core's client, reactive, and `null` on the server and until the component has mounted.
- `useQuery(id, statement, params?)` returns an object with reactive `status` (`"idle"` until mounted, then the core's), `rows`, `error` and `generation`; it subscribes through the client and re-runs after a replacement.
- `graph(id, options?)` returns the client for a visit-lifetime registered graph outside a component. It throws for a page-lifetime or inline graph, naming the graph, and for an unknown id, naming the registered ids.

Everything lifetime-related counts in `onMount` and in an `$effect`'s cleanup, never in `onDestroy`, which also runs on the server. Lifetimes follow ADR-005:

- a **visit** graph is created once per id, held in module state, and never destroyed by navigation (`client-routing`; under `multi-page` every page is a new document, so this is a per-page client);
- a registered **page** graph is created by its first holder, shared by every holder, uses the stored copy whenever it has a descriptor, and is destroyed one task after the last holder is removed (SvelteKit destroys the old page's holders before the new page's mount, so a graph used by consecutive pages is kept);
- an **inline** graph is found by id among the document's `script[data-relate-graph]` elements (the only match, else the first whose parent is visible), keyed by id and element, and destroyed by the page-lifetime rule.

`options.navigation` and `options.descriptor` override the profile and the descriptor's location. They are testing aids and change nothing else.

### 2.5 Profile, output and scope of the first version

- `client-routing` is the default (SvelteKit's router is client-side). A site that wants every navigation to load a document sets `data-sveltekit-reload` on the page's `<body>` and passes `navigation="multi-page"`.
- `adapter-static` and `adapter-node` are supported, both through the prerendered endpoint (the Node adapter serves a prerendered file from its output); pages may be prerendered or rendered on demand. Other adapters, edge and serverless runtimes are not decided.
- SvelteKit 3 and Svelte 5 only. Other versions, `router.type: "hash"`, and the Svelte 4 store contract are not checked.
- Every instance runs in the core's worker. A dashboard that fetches its data at load, a main-thread instance, running the engine on the server, a default extractor (RFC-003) and a navigation element (RFC-004) are not decided here.
- The core changes in no way.

### 2.6 Checked against the core's conformance scenarios

`packages/sveltekit/conformance-site` is a SvelteKit app, not published, that reproduces the example pages' `data-rel-*` markup (defined in the core's `conformance/example-site/rel-page.ts`) using only `@relate/sveltekit`. It has pages for each way a graph is used: a shared registered graph (`"visit"`), a page with its own inline graph, a page that holds a registered `"page"` graph, a page with two graphs, and a page for the direct lookup. It is built once per profile and once per adapter (a static build served as files, a Node build served by its own server), and `runConformance` from `@relate/web/conformance` runs against each in Chromium, Firefox and WebKit. A failure blocks the adapter's release.

The adapter's own behaviors have their own tests: a page-lifetime client is destroyed on departure and its store is free for the next page; consecutive pages that use one registered page graph keep its client; `graph()` rejects page-lifetime and inline ids; the build fails for an invalid document, a source that is not deterministic, a duplicate id, an id both registered and inline; the revision in a data file's name matches the descriptor's.

A package test packs `@relate/sveltekit`, the core and the engine, installs them in a clean SvelteKit 3 project outside the repository, builds it with each adapter, and runs a page.

## 3. Alternatives Considered

- **A Vite plugin with a virtual module, as the Astro integration has.** Rejected: SvelteKit cannot inject routes, so the descriptor and data still need a route the site writes, and the catalog travels through a layout load without one. A plugin would only move the configuration.
- **A package precompiled with `@sveltejs/package`.** Rejected: shipping source compiled by the site's build works (SPIKE-007) and needs no packaging step that has to match the site's Svelte version.
- **Svelte stores (`readable`, `derived`) as the API.** Rejected: the adapter targets Svelte 5 only, where reactive objects over runes compose with `$derived` and `$effect` and a second contract would double the surface.
- **A render-prop component (`<Graph id>` with a snippet).** Rejected: it hides the lifetime inside a component and cannot be used from a module or a `load`-adjacent helper.
- **Registered graphs as files in `static/`.** Rejected: no validation, no revision in the name, and no failure when a source is not deterministic.
- **The route builder reading the base path from `$app/paths`.** Rejected: SvelteKit 3 removed `base` from it, and a package that imports `$app` modules has to be processed by the site's server build; deriving the base from the request needs neither.
- **Counting holders in `onDestroy`.** Rejected: it runs during server rendering, where nothing mounted.
- **Checking determinism between processes, as the Next adapter does.** Rejected: `entries()` and `GET` share a process here, so the check would never fire.

## 4. Consequences

- A site gets a working graph from one declaration module, a four-line route file, a six-line layout load, one provider and the component's own code, and a page gets one from a call. Neither writes endpoint, hashing or lifecycle code.
- The helpers are Svelte source compiled by the site, so they follow the site's Svelte version (peer range `^5`) and its compiler options. SPIKE-007 verified a component and a `.svelte.js` rune module; a `.svelte.ts` module and a package under `ssr.noExternal` handling are checked while building the adapter.
- Doubling every source's evaluation in `entries()` makes a build as slow as the source twice; the cost is unmeasured.
- The binary appears two or three times in a build's output (SPIKE-007 5.2), 6.25 MB each, and only one is requested. The extra copies cost disk and deploy size, not page weight; suppressing them is follow-up work, in the adapter's notes until then.
- A workspace site (this repository's conformance site) needs `server.fs.allow` for the repository root in `vite dev`; a published install does not.
- Page-lifetime sharing with a deferred destroy is now written for the third time (Astro, Next, SvelteKit). ADR-004 and ADR-005 named moving it into the core as follow-up work once a second adapter needed it; this is the third.
- Not checked, and tested while building the adapter: the endpoint under `adapter-node` and a build that fails when a source throws; the development server following a source edit; hydration of a holder in an on-demand rendered page; that the server entry works when the package is externalized for server rendering; the inline element under `data-sveltekit-reload`; and installing the packed adapter in a clean project.
- Edge and serverless adapters are undecided (RFC-001 §7.5); only the static and Node outputs are settled.
- The adapter cannot say what a good graph is. Until RFC-003 and RFC-002's decisions are made, each site writes its own documents, and the conformance site uses small hand-written ones.

## 5. Related

- RFCs: RFC-001, RFC-002
- Builds on: ADR-001 (hosting and profiles), ADR-002 (data format), ADR-003 (descriptor), ADR-004 and ADR-005 (the adapters this one follows; ADR-005 for the build code and the lifetimes)
- Evidence: SPIKE-007 (embedding the core in SvelteKit)
