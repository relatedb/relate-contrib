---
id: ADR-004
title: The Astro Adapter as an Integration over the Core
status: proposed
rfcs: [RFC-001]
created: 2026-11-04
---

# ADR-004: The Astro Adapter as an Integration over the Core

## 1. Context

Astro, a Vite-based site generator, builds pages from content at build time and then serves them as static files, with an optional client-side router (`ClientRouter`, with view transitions). Three facts about it shape how the embedded graph database can be added to an Astro site.

- **The graph can only be built inside Astro's runtime.** The content a site's graph comes from lives in content collections (`getCollection`, the `astro:content` module), which exist only while Astro renders or builds pages. A static endpoint that reads the collection and returns JSON produced a correct page-and-link graph in the spike that measured it (SPIKE-002 §5.1). A script outside Astro would need its own copy of the content-reading logic.
- **The two navigation profiles map onto Astro's two modes.** With `ClientRouter`, a worker client held in module state kept the same worker, generation and registered queries across link clicks, history back and forward, and programmatic navigation, and a swap took about 24 ms (SPIKE-005 §5.1). Without it, every navigation loads a new document, so the client, its worker and its replay start again (SPIKE-003 §5.1). Module scripts run once per document, so under the router a page's own work has to be driven by the router's events (`astro:page-load`, `astro:before-swap`), not by the script's first run.
- **The binary and the hydration rules are already known.** The bundler emitted the engine's `.wasm` once, with a hashed name, and rewrote the glue's default lookup to it, so no workaround was needed (SPIKE-002 §5.3). A component that read the instance during its first render mismatched the server output once the instance outlived the page; one that showed a placeholder first did not (SPIKE-003 §5.3).

The core package `related-web-core` already provides the client, the loader, the descriptor handling and the two profiles (ADR-001, ADR-002, ADR-003), plus a conformance check that drives example pages (`packages/core/conformance/example-site`). What remains is the Astro-specific wiring: where the data and the descriptor come from at build time, how the profile is chosen, how a page's own data follows the router, and how the adapter is checked. RFC-001 §5.1 frames the adapter as owning only that wiring.

## 2. Decision

### 2.1 Package: `related-web-astro`, an Astro integration

A workspace package `packages/astro`, published as `related-web-astro` (a working name, following `related-web-core`). It has two entry points:

- the default export, an Astro integration, added to `astro.config` as `relatedWeb({ ... })`;
- `related-web-astro/client`, a browser module for pages and islands.

Peer dependencies are `astro` (version 7, the version the spikes ran on), `related-web-core` and `@neo4j-labs/cypherlite-wasm`. The adapter has no other runtime dependency. It does not ship components for React, Vue or Svelte; the client module is plain TypeScript and is used from Astro `<script>` blocks and from islands of any framework.

### 2.2 Build time: a graph source module, served as static endpoints

The integration option `graphs` maps a graph id (the id rule of ADR-003) to a **source module** and optional indexes:

```js
relatedWeb({
  graphs: { site: { source: "./src/site-graph.ts", indexes: [{ label: "Page", property: "id" }] } },
  navigation: "client-routing", // or "multi-page"
})
```

The source module default-exports a function that returns an ADR-002 data document, or a promise of one. Because it is imported through Vite, it can use `astro:content`. What the document contains, the schema that turns content into nodes and links, is outside this decision (RFC-003). The adapter ships no default extractor.

For each graph the integration injects two prerendered routes, using Astro's `injectRoute`:

- `/_related/<id>/graph.<revision>.json`, the data document, where `<revision>` is the first 12 hex digits of the SHA-256 of the canonical document;
- `/_related/<id>/descriptor.json`, the ADR-003 descriptor, with `revision` set to the same value, `data.url` pointing at the hashed file, and `data.nodes` and `data.links` set to the counts.

Both routes share one evaluation of the source function per build, so the descriptor, the document and its hash always agree. Before writing, the adapter validates the document with `related-web-core/validate` and fails the build with the path of the first problem. The data URL changes with the content, so it can be cached indefinitely; the small descriptor is the only file a browser revalidates. The routes respect Astro's `base` setting. In `astro dev` the source is re-evaluated when its inputs change, so the descriptor's revision follows edits.

### 2.3 Client module: configuration comes from the integration

The integration provides a virtual module (`virtual:related-web/config`) holding the graph ids, descriptor URLs, the profile and the options for the core. `related-web-astro/client` reads it and exports:

- `graph(id = "site", options?)`: `options.navigation` overrides the profile; it returns the core client for that graph, made with `createSiteClient`. The engine's binary URL comes from `@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url`, imported inside `related-web-astro/client` so the bundler places and hashes it. Under `client-routing` the call returns the same client for the whole visit; under `multi-page` each call makes a new client for that page, as the core defines.
- `onPage(setup)`: calls `setup(context)` on the first page and again on every `astro:page-load`; the function `setup` returns is called on `astro:before-swap` and on `pagehide`. This is the one place the adapter's page lifecycle lives. Subscriptions made with `graph().subscribe` and views made with the core's `attachView` inside `setup` are therefore added on arrival and dropped on departure under both profiles, without the page author listening to router events. `attachView` already ignores arrival work that completes after `detach()`.

The client never starts before a page asks for it. A page that does not import the module pays nothing, and nothing in the page's first render may depend on the instance.

### 2.4 Profile: an explicit option

`navigation` is `"multi-page"` (the default) or `"client-routing"`. It is set once in the integration options and is the profile passed to the core; a call to `graph()` may override it (see the consequences in section 4). The adapter does not infer it from the site's layouts. A site that sets `client-routing` must include `ClientRouter` in its layouts; in development the client module warns when the option and the presence of the router's `astro-view-transitions-enabled` meta tag disagree.

`multi-page` is the default because it is correct under either routing mode; under `ClientRouter` it only gives up the retained instance.

### 2.5 Checked against the core's conformance scenarios

`packages/astro/conformance-site` is an Astro site, not published, that reproduces the example pages' `data-gw-*` markup (`conformance/example-site/gw-page.ts` in the core defines it) using only `related-web-astro`. It is built twice, once per profile, with `ClientRouter` in the layout only for `client-routing`. `runConformance` from `related-web-core/conformance` runs against each build in Chromium, Firefox and WebKit, and a failure blocks the adapter's release. These browsers render the page, so the router's real view-transition path is exercised, not only its no-animation swap.

A package test, like the core's, packs `related-web-astro` and the core, installs them in a clean Astro project outside the repository, and builds and runs a page.

### 2.6 Scope of the first version

- Static output only. A site rendered on demand (`output: "server"`) is not supported; the injected routes are prerendered.
- Astro 7. Other versions are not checked.
- Several graphs per site, and several clients per page, are supported because the core supports them; the conformance site covers one graph and the per-page overlay.

## 3. Alternatives Considered

- **Documentation and a recipe, no package.** Each site would copy the endpoints, the hash, the descriptor and the lifecycle wiring. Rejected: those pieces are the same on every Astro site, and a copy cannot be checked against the conformance scenarios.
- **A UI-framework component as the primary API (a React island, for example).** Rejected: it ties the adapter to one UI framework, and a component that holds the client is the island whose unmount ended the worker in SPIKE-005 §5.3. A persisted island (`transition:persist`) also keeps the worker alive, and a site may use one with the client module; it is not the default because module state does the same job with less machinery.
- **Writing the data and descriptor from a Node script or an `astro:build:done` hook.** Rejected: content collections are not available there, so the content-reading logic would exist twice, once for pages and once for the graph.
- **A fixed data URL (`graph.json`) with cache revalidation.** Rejected: every page load would revalidate the larger file, and a CDN could not cache it indefinitely. The hashed name moves the revalidation to the descriptor.
- **Detecting the profile at build time by scanning layouts for `ClientRouter`.** Rejected: the router can be added in a layout the scan does not see, and a wrong guess silently loses the retained instance or retains one that should not be. An explicit option with a development warning fails visibly.
- **A shared worker for all pages.** Rejected by ADR-001; the spike showed it ends with the last connected page on a multi-page site (SPIKE-003 §5.1).

## 4. Consequences

- A site gets a working graph from one integration entry, one source module and the client module. It writes no endpoint, hashing or lifecycle code.
- The adapter owns the descriptor's `revision`, so content changes invalidate stored graphs without the site author managing a version. The cost is that a source function that is not deterministic (timestamps, unordered output) makes every build look new; the adapter canonicalizes key and array order for the hash, and the source must still avoid varying data.
- The conformance site closes a gap left open by SPIKE-005 and by ADR-001's acceptance gate: the module-state client has so far been observed only through the router's no-animation path in a browser that did not render the page. The three-browser run observes the real path.
- The core's conformance scenario C-09 opens a page with the other profile in its query string and expects that value to decide the profile. The adapter therefore lets a caller override the profile (`graph(id, { navigation })`), and the conformance site's pages pass the query value through. The override changes which core profile is used and nothing else; it does not add or remove the router. The override is documented as a testing aid.
- Components in other UI frameworks (a hook or composable that wraps `graph()` and `onPage`) are not provided. They are follow-up work, and the placeholder-first rule they must follow is documented in the adapter's README.
- The adapter cannot say what a good site graph is. Until RFC-003 is decided, each site writes its own source module, and the conformance site uses a small page-and-link one.
- Dev-server behavior, the production data URL under a non-root `base`, and installing the adapter as a published package (rather than a workspace link) each need a test; the last repeats the failure SPIKE-001 saw with a symlinked package under Observable Framework.

## 5. Related

- RFCs: RFC-001
- Builds on: ADR-001 (hosting and profiles), ADR-002 (data format), ADR-003 (descriptor)
- Evidence: SPIKE-002 (build-time graph), SPIKE-003 (client-side navigation), SPIKE-005 (worker survival across navigation)
