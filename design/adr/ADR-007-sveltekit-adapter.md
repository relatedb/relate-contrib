---
id: ADR-007
title: The SvelteKit Adapter as Svelte 5 Helpers over the Core
status: accepted
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

The core package `@relate/contrib-web` provides the client, loader, descriptor handling and profiles (ADR-001, ADR-002, ADR-003), and the build-time code in `@relate/contrib-web/build` (canonical text, revision, document preparation, descriptor construction, the inline-document check and JSON escaping; ADR-005). The Astro, Next and Observable adapters (ADR-004, ADR-005, ADR-006) show the shape of an adapter: publish graphs at build time, let a page ask for one, tie its client to the page's lifetime. RFC-001 §5.1 frames an adapter as owning only that wiring; RFC-002 §5.1 and §5.2 list the data sources and page shapes it has to cover.

## 2. Decision

### 2.1 Package: `@relate/contrib-sveltekit`, two entries

A workspace package `packages/sveltekit`, published as `@relate/contrib-sveltekit`, for SvelteKit 3 and Svelte 5:

- `@relate/contrib-sveltekit`: Svelte source for the browser and for rendering: `RelateProvider`, `GraphData`, `useGraph`, `useQuery`, `graph` (section 2.3 and 2.4), shipped as `.svelte` components (which may use TypeScript) and `.svelte.js` rune modules (plain JavaScript with JSDoc types and a `.d.ts` beside each), with `svelte` and `default` export conditions pointing at them, so the site's build compiles them (a `.svelte.ts` module in a package fails the development server's dependency optimization);
- `@relate/contrib-sveltekit/server`: plain TypeScript for server code: `createGraphRoute` and `catalog` (section 2.2).

Peer dependencies are `@sveltejs/kit` (version 3), `svelte` (version 5), `@relate/contrib-web` and `@relate/relate-wasm`. There is no other runtime dependency and no Vite plugin: nothing in the adapter needs the bundler's cooperation. The package never imports the engine's binary; the site imports it as a `?url` asset and hands the URL to the provider.

### 2.2 Build time: a prerendered route, a catalog from a layout

A graph is identified by an id (the id rule of ADR-003) and declared as in ADR-005. A registered graph's *descriptor* is a small JSON file that names its data location, revision and counts, so a page can restore a stored copy of the graph kept in the browser instead of fetching the data; a *holder* below is a component that uses a graph and has not been removed from the page. A graph is declared as: an id mapped to `{ source, indexes?, lifetime? }`, where `source` is a function returning an ADR-002 document or a promise of one, and `lifetime` is `"page"` (default) or `"visit"`. The adapter ships no default extractor; what a document contains is outside this decision.

**The route.** The site writes `src/routes/relate/[id]/[file]/+server.ts`:

```ts
import { createGraphRoute } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts"; // any module path: the site's declarations
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
```

`export const prerender = true` stays a literal in the file, since SvelteKit reads it from the text. For each registered graph the builder publishes a descriptor (`descriptor.json`) and a data file (`graph.<revision>.json`), where `<revision>` is the first 12 hex digits of the SHA-256 of the canonical document (the core's build code, not a copy). `entries()` lists both names for every graph. `GET` answers a name that is not listed with 404. The descriptor's data location carries the site's base path; the builder derives it from the request, as everything in the request's path before `/relate/`, so the server entry has no dependency on SvelteKit's virtual modules.

**Failure at build time.** A document that fails the core's validator fails the build, naming the graph and the path of the first problem. Because `entries()` and `GET` run in one process, the check that Next needs between processes would see nothing; instead `entries()` evaluates every source twice, independently, and fails the build, naming the graph, when the two canonical texts differ. A malformed id or a duplicate id fails when the builder is called.

**In development** the endpoint is not prerendered: `GET` evaluates the source on each request, so the descriptor's revision follows edits, and answers 404 for a revision that is not the current one.

**The catalog.** `catalog(graphs)` returns plain data: ids, lifetimes and indexes, with no locations. The site returns it from a server-only layout load, so the sources never enter the browser bundle (a universal `+layout.ts` load would run in the browser and pull them in). The client helpers, which are Svelte source compiled by the site's build, build each descriptor's location with `resolve("/relate/<id>/descriptor.json")` from `$app/paths`, so the base path joins in the browser (the server render, which never fetches a graph, gets a location relative to the page); the route builder, plain TypeScript, derives the base from the request and uses no `$app` module.

```ts
// src/routes/+layout.server.ts
import { catalog } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const load = () => ({ catalog: catalog(graphs) });
```

### 2.3 Inline graphs and the provider

`GraphData` is a component that takes `id`, `document`, an optional `config` (a list of indexes, created before the nodes) and `page` (a name for error messages). It validates the document with the core's inline check and writes `<script type="application/json" data-relate-graph="<id>">` with the document escaped, using `{@html}`. It has no descriptor, no revision, no stored copy and no request. The render fails, naming the page, for an invalid document or `config`, for an id used twice in one render, and for an id that is also registered; the record of ids used so far is made per render, in the provider's context, and the registered ids come from the same context; neither is module state.

`RelateProvider` takes the catalog, the engine's URL (the site's `?url` import) and `navigation` (`"client-routing"`, the default, or `"multi-page"`), and makes them available to the helpers through Svelte's context. It creates no client and starts no worker. It belongs in the root layout.

### 2.4 Client helpers: Svelte 5 reactive objects over `onMount`

All helpers are called while a component initializes, and none touches the instance before the component has mounted.

- `useGraph(id, options?)` returns an object whose `client` property is the core's client, reactive, and `null` on the server and until the component has mounted.
- `useQuery(id, statement, params?)` returns an object with reactive `status` (`"idle"` until mounted, then the core's), `rows`, `error` and `generation`; it subscribes through the client and re-runs after a replacement.
- `graph(id, options?)` returns the client for a visit-lifetime registered graph outside a component. It throws for a page-lifetime or inline graph, naming the graph, and for an unknown id, naming the registered ids.

Everything lifetime-related is done in the browser only: a holder acquires its graph in an `$effect`, which runs only in the browser after mount, releases it in that effect's cleanup, and acquires again when the `id` it reads changes; nothing counts in `onDestroy`, which also runs on the server. The registries (visit clients, page-lifetime holders) are module state that is touched only after mount, since module state on a server is shared by every request. A graph id is looked up first among the page's inline graphs and then among the registered ones, and an unknown id fails with a message that names it and lists the registered ids. Lifetimes follow ADR-005:

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

`packages/sveltekit/conformance-site` is a SvelteKit app, not published, that reproduces the example pages' `data-rel-*` markup (defined in the core's `conformance/example-site/rel-page.ts`) using only `@relate/contrib-sveltekit`. It has pages for each way a graph is used: a shared registered graph (`"visit"`), a page with its own inline graph, a page that holds a registered `"page"` graph, a page with two graphs, and a page for the direct lookup. It is built once per profile and once per adapter (a static build served as files, a Node build served by its own server), and `runConformance` from `@relate/contrib-web/conformance` runs against each in Chromium, Firefox and WebKit. A failure blocks the adapter's release.

The adapter's own behaviors have their own tests: a page-lifetime client is destroyed on departure and its store is free for the next page; consecutive pages that use one registered page graph keep its client; `graph()` rejects page-lifetime and inline ids; the build fails for an invalid document, a source that is not deterministic, a duplicate id, an id both registered and inline; the revision in a data file's name matches the descriptor's.

A package test packs `@relate/contrib-sveltekit`, the core and the engine, installs them in a clean SvelteKit 3 project outside the repository, builds it with each adapter, and runs a page.

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
- The helpers are Svelte source compiled by the site, so they follow the site's Svelte version (peer range `^5`) and its compiler options. A `.svelte.ts` module shipped in a package builds but fails `vite dev` (dependency optimization), so rune modules are plain `.svelte.js` with types beside them, written by hand; components may use TypeScript.
- An inline graph's document is in the page twice: once in the `<script type="application/json">` element and once in the page's hydration data or its component code, which the Next adapter's server component avoids. The extra bytes scale with the inline graph; whether the client can leave the server-written element alone on hydration is checked while building the adapter, and the size at which a graph should be registered instead stays unmeasured, as in ADR-004.
- SvelteKit 3 and Svelte 5 only means a site still on SvelteKit 2 or Svelte 4 cannot use the adapter.
- Doubling every source's evaluation in `entries()` makes a build as slow as the source twice; the cost is unmeasured.
- The binary appears two or three times in a build's output (SPIKE-007 5.2), 6.25 MB each, and only one is requested. The extra copies cost disk and deploy size, not page weight; suppressing them is follow-up work, in the adapter's notes until then.
- A workspace site (this repository's conformance site) needs `server.fs.allow` for the repository root in `vite dev`; a published install does not.
- Page-lifetime sharing with a deferred destroy is now written for the third time (Astro, Next, SvelteKit). ADR-004 and ADR-005 named moving it into the core as follow-up work once a second adapter needed it; this is the third.
- Checked in the spike, so settled: the destructured route export, the catalog through a server-only layout load (one run: first load, client navigation, reload), and, for production builds only, rune modules written in TypeScript shipped in a package (SPIKE-007 5.7, 5.8; the plan's check V-2 found that `vite dev` rejects them). Not checked, and tested while building the adapter: the endpoint under `adapter-node` and a build that fails when a source throws; the development server following a source edit; hydration of a holder in an on-demand rendered page; that the helpers' `$app/paths` import works from a package compiled by the site's build; the inline element under `data-sveltekit-reload`; and installing the packed adapter in a clean project.
- This decision settles RFC-001 §7.7 for SvelteKit (Vite places the binary and the worker), §7.5 for static and Node output with edge and serverless left open, and §7.6 and §7.10 in part (a module-state client survives the router; `onMount` is browser-only and `onDestroy` is not).
- Edge and serverless adapters are undecided (RFC-001 §7.5); only the static and Node outputs are settled.
- The adapter cannot say what a good graph is. Until RFC-003 and RFC-002's decisions are made, each site writes its own documents, and the conformance site uses small hand-written ones.

## 5. Related

- RFCs: RFC-001, RFC-002
- Builds on: ADR-001 (hosting and profiles), ADR-002 (data format), ADR-003 (descriptor), ADR-004 and ADR-005 (the adapters this one follows; ADR-005 for the build code and the lifetimes)
- Evidence: SPIKE-007 (embedding the core in SvelteKit)

## 6. Amendments

- 2026-11-08: `/adr-review` before acceptance found that the catalog could not carry the base path (it runs without a request, and the server entry avoids `$app` modules). The catalog now holds no locations and the client helpers build them with `resolve()`; a universal layout load is recorded as rejected. Also added: the definitions of the descriptor and a holder, an any-module-path note on the snippets, the exact acquire and release rule, the lookup order, the browser-only rule for module state, a per-render duplicate record, the doubled bytes of an inline graph, the SvelteKit 3 scope consequence, the three assumptions the spike then confirmed, and the statement of what the decision settles in RFC-001.
- 2026-11-08: planning checks (`specs/005-sveltekit-adapter/research.md`, V-1 to V-9; single runs on the same versions as SPIKE-007) changed three statements and settled six open items. Changed: (1) rune modules shipped in a package are `.svelte.js` with JSDoc types and a `.d.ts`, because a `.svelte.ts` module builds but makes `vite dev` fail in dependency optimization (`Unexpected token`), and SPIKE-007 had only run builds; (2) `resolve()` from `$app/paths`, called in a package compiled by the site's build, returned a path relative to the page during server rendering and the base-prefixed path in the browser, so the base path joins in the browser and the server render's location is never fetched (section 2.2 reads accordingly); (3) `GraphData` writes the same `{@html}` element on the server and in the browser, since a version written only on the server (`{#if import.meta.env.SSR}`) had its element removed by hydration. Settled: the endpoint under the Node output (the prerendered files are served: descriptor 200 as `application/json`, data file 200, another revision and another id 404); a build fails, naming the graph, for a source that throws, a source that is not deterministic and an invalid document; the development server follows a source edit at once (new revision, new data file 200, old revision 404); a holder in an on-demand rendered page hydrates in all three browsers with no warning; with `data-sveltekit-reload` on the body every link loads a document and the inline element is found; a package's `$app/paths` import compiles in the site's build.
- 2026-11-08: the open items of section 4, checked in the implementation (`specs/005-sveltekit-adapter/research.md` V-10, V-11 and the planning checks V-1 to V-9; single runs on SvelteKit 3.1.1, Svelte 5.57.3, Vite 8.3.6, Node 24, macOS):
  - Endpoint under the Node output: the prerendered files are served (descriptor 200 as `application/json`, data file 200, another revision and another id 404), in a fixture build and in the conformance site's two Node builds.
  - Throwing source: the build fails with the graph's name; so do a source that is not deterministic, an invalid document, a duplicate id and a malformed id.
  - Development server: the descriptor's revision and the data file follow a source edit at once, the old revision answers 404, a source that throws answers 500 with its message. `process.env.NODE_ENV` decides development; a test process that sets `NODE_ENV=test` and starts `vite dev` makes the server believe it is not in development.
  - Hydration of a holder in a page rendered on demand: it hydrates and queries in the three browsers with no warning (and so do prerendered pages, in production and in `vite dev`).
  - `$app/paths` from a package compiled by the site's build: it works, in production, in `vite dev` and from a packed install; the server render gets a page-relative path, the browser the base-prefixed one.
  - `data-sveltekit-reload` on the body: every link loads a document, the inline element is found, and the same attribute is added by a `handle` hook that also applies while prerendering.
  - The packed adapter, core and engine in a clean project: the static build, the Node build and `vite dev` each build or start and answer the queries; rune modules shipped as `.svelte.js` survive dependency optimization.
  - The inline element on hydration: it stays (the same `{@html}` is written in the browser); the document is in the page twice.
  - RFC-001 §7.5 is settled for the static and Node outputs; edge and serverless adapters stay open.
- 2026-11-08: further changes found while implementing. (1) A holder acquires in an `$effect` (browser only) and releases in its cleanup; `onMount` is not used, and section 2.4 reads accordingly. (2) `RelateProvider` records its configuration for the direct lookup in an `$effect.pre`, because Svelte runs a child's `onMount` before its parent's, so a `graph()` call in a child's `onMount` would otherwise find no provider. (3) Duplicate inline ids are judged within one server render only; in the browser each check starts empty, because the provider outlives pages. (4) `GET` answers a source that fails with a 500 and its message in every mode: `entries()` has already evaluated every source at build time, so the build is what refuses a bad source. (5) A route folder named `index.html` is reported as unseen by the prerenderer, so a site whose scenarios open `/index.html` makes the home page the root route; a Node server answers `/index.html` 404.
