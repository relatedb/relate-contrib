---
id: ADR-004
title: The Astro Adapter as an Integration over the Core
status: proposed
rfcs: [RFC-001, RFC-002]
created: 2026-11-04
---

# ADR-004: The Astro Adapter as an Integration over the Core

## 1. Context

Astro, a Vite-based site generator, builds pages from content at build time and then serves them as static files, with an optional client-side router (`ClientRouter`, with view transitions). Four facts about it shape how the embedded graph database can be added to an Astro site.

- **Graphs vary in how many pages use them.** One graph may serve every page (a site-wide graph), a group of pages, or a single page (a notebook, a cookbook recipe, a dashboard's data). A page may also carry several independent graphs. Whichever it is, the data starts from content that exists only while Astro renders or builds pages: content collections (`getCollection`, the `astro:content` module), a page's own frontmatter, or files beside it. For a site-wide graph, a static endpoint that reads the collection and returns JSON produced a correct page-and-link graph (SPIKE-002 §5.1). A script outside Astro would need its own copy of the content-reading logic, and a page already has that content in hand when it renders.
- **The two navigation profiles map onto Astro's two modes.** With `ClientRouter`, a worker client held in module state kept the same worker, generation and registered queries across link clicks, history back and forward, and programmatic navigation, and a swap took about 24 ms (SPIKE-005 §5.1). That retention helps a graph that many pages share. A graph only one page uses has nothing to retain and must not outlive its page. Without the router, every navigation loads a new document, so the client, its worker and its replay start again (SPIKE-003 §5.1). Module scripts run once per document, so under the router a page's own work has to be driven by the router's events (`astro:page-load`, `astro:before-swap`), not by the script's first run.
- **The binary and the hydration rules are already known.** The bundler emitted the engine's `.wasm` once, with a hashed name, and rewrote the glue's default lookup to it, so no workaround was needed (SPIKE-002 §5.3). A component that read the instance during its first render mismatched the server output once the instance outlived the page; one that showed a placeholder first did not (SPIKE-003 §5.3).
- **Small graphs and large graphs want different delivery.** A graph of a few dozen nodes written beside a page's prose costs less inline than as a second request with its own descriptor. A graph shared by many pages, or a large one, benefits from a cacheable file and a stored copy that is restored when its revision has not changed (ADR-003).

The core package `related-web-core` already provides the client, the loader, the descriptor handling and the two profiles (ADR-001, ADR-002, ADR-003), plus a conformance check that drives example pages (`packages/core/conformance/example-site`). `createSiteClient` returns one retained client under `client-routing`; `createClient` makes a new independent client, and a page may have several. What remains is the Astro-specific wiring: where each kind of graph's data comes from at build time, how its lifetime is chosen, how the profile is chosen, how a page's own data follows the router, and how the adapter is checked. RFC-001 §5.1 frames the adapter as owning only that wiring; RFC-002 §5.1 and §5.2 list the sources and the page shapes it has to cover.

## 2. Decision

### 2.1 Package: `related-web-astro`, an Astro integration

A workspace package `packages/astro`, published as `related-web-astro` (a working name, following `related-web-core`). It has three entry points:

- the default export, an Astro integration, added to `astro.config` as `relatedWeb({ ... })`;
- `related-web-astro/graph-data`, an Astro component (an `.astro` file, not a React, Vue or Svelte component) that puts a small graph into a page;
- `related-web-astro/client`, a browser module for pages and islands.

Peer dependencies are `astro` (version 7, the version the spikes ran on), `related-web-core` and `@neo4j-labs/cypherlite-wasm`. The adapter has no other runtime dependency. It ships no components for UI frameworks; the client module is plain TypeScript and is used from Astro `<script>` blocks and from islands of any framework.

### 2.2 Build time: two ways to declare a graph

A graph is identified by an id (the id rule of ADR-003). It is declared in one of two ways, and the way is chosen by the author per graph. Which pages use it is not declared anywhere: a page uses a graph by asking for its id (section 2.3), so the same mechanism serves a graph for every page, for a few, or for one. In both ways the data is an ADR-002 data document, and the adapter validates it with `related-web-core/validate` and fails the build with the path of the first problem. What a document contains, the schema that turns content into nodes and links, is outside this decision (RFC-003 for the site graph, RFC-002 for page graphs). The adapter ships no default extractor.

**Registered graph: a file served from static endpoints.** The integration option `graphs` maps an id to a source and optional indexes and a lifetime (section 2.3):

```js
relatedWeb({
  graphs: {
    site: { source: "./src/site-graph.ts", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
    "pantry-data": { source: "./src/data/pantry.json" },
  },
  navigation: "client-routing", // or "multi-page"
})
```

A source is a module that default-exports a function returning an ADR-002 document, or a promise of one, or a JSON file holding one. A module is imported through Vite, so it can use `astro:content`. For each registered graph the integration injects two prerendered routes, using Astro's `injectRoute`:

- `/_related/<id>/graph.<revision>.json`, the data document, where `<revision>` is the first 12 hex digits of the SHA-256 of the canonical document;
- `/_related/<id>/descriptor.json`, the ADR-003 descriptor, with `revision` set to the same value, `data.url` pointing at the hashed file, and `data.nodes` and `data.links` set to the counts.

Both routes share one evaluation of the source per build, so the descriptor, the document and its hash always agree. The data URL changes with the content, so it can be cached indefinitely; the small descriptor is the only file a browser revalidates, and a stored copy is restored by revision (ADR-003). The routes respect Astro's `base` setting. In `astro dev` the source is re-evaluated when its inputs change, so the descriptor's revision follows edits.

**Page graph: a document written into the page.** The component takes an `id` and a `document` prop:

```astro
---
import GraphData from "related-web-astro/graph-data";
const entry = await getEntry("recipes", Astro.params.slug);
const document = { version: 1, nodes: [...], links: [...] }; // from the entry, or written by hand
---
<GraphData id="recipe" document={document} />
```

The `document` is built in the page's frontmatter, where the page's own content (`getEntry`, `getCollection`, its own data) is already available, so a graph per page derived from each page's content needs no entry in the integration options. The component validates the document at build time and renders it as `<script type="application/json" data-gw-graph-data="<id>">`. A page graph has no descriptor, so it has no revision and no stored copy, and it costs no extra request; it is replayed on each load. The component fails the build if the id is also registered in `graphs`. Several `<GraphData>` elements with different ids may appear on one page.

### 2.3 Client module: configuration comes from the integration

The integration provides a virtual module (`virtual:related-web/config`) holding the registered graph ids, their descriptor URLs and lifetimes, the profile, and the options for the core. `related-web-astro/client` reads it and exports:

- `onPage(setup)`: calls `setup(page)` on the first page and again on every `astro:page-load`; the function `setup` returns is called on `astro:before-swap` and on `pagehide`. This is the one place the adapter's page lifecycle lives. `page.graph(id, options?)` returns the core client for a graph that this page uses and ties that client to the page: a page-lifetime client is created with the core's `createClient` and destroyed on departure, so it cannot outlive its page and a page may hold several. Subscriptions made with the client's `subscribe` and views made with the core's `attachView` inside `setup` are added on arrival and dropped on departure under both profiles, without the page author listening to router events. `attachView` already ignores arrival work that completes after `detach()`.
- `graph(id = "site", options?)`: the same lookup outside a page's setup, for code that lives across pages (a persisted navigation element, say). It accepts only a graph whose lifetime is `"visit"` and throws for any other.

`id` is looked up first among the inline `<GraphData>` elements of the current page, then among the registered graphs. `options.navigation` overrides the profile (a testing aid; see section 4). The engine's binary URL comes from `@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url`, imported inside `related-web-astro/client` so the bundler places and hashes it.

**Lifetime** is a property of a registered graph: `"page"` (the default) or `"visit"`. A `"visit"` graph is a graph that many pages share; it is made with the core's `createSiteClient`, so under `client-routing` it is one client for the whole visit, and under `multi-page` each page makes its own, as the core defines. A `"page"` graph is made with `createClient` for the page that asks and is destroyed when that page is left, which is also correct for a graph several pages use but that one page at a time works with. An inline page graph is always `"page"`. `"page"` is the default because it is correct for every graph under either profile; a graph declared `"visit"` gains the retained instance and takes the obligation to hold only data that pages share.

The client never starts before a page asks for it. A page that does not import the module pays nothing, and nothing in the page's first render may depend on the instance.

### 2.4 Profile: an explicit option

`navigation` is `"multi-page"` (the default) or `"client-routing"`. It is set once in the integration options and is the profile passed to the core; a call to `page.graph()` or `graph()` may override it (see the consequences in section 4). The adapter does not infer it from the site's layouts. A site that sets `client-routing` must include `ClientRouter` in its layouts; in development the client module warns when the option and the presence of the router's `astro-view-transitions-enabled` meta tag disagree.

`multi-page` is the default because it is correct under either routing mode; under `ClientRouter` it only gives up the retained instance. Under `multi-page` a graph's lifetime has no effect, since every page starts its own client.

### 2.5 Checked against the core's conformance scenarios

`packages/astro/conformance-site` is an Astro site, not published, that reproduces the example pages' `data-gw-*` markup (`conformance/example-site/gw-page.ts` in the core defines it) using only `related-web-astro`. It has pages for each way a graph is used: a shared registered graph (`"visit"`), a page with its own inline graph, a page that asks for a registered `"page"` graph, and a page with two graphs. It is built twice, once per profile, with `ClientRouter` in the layout only for `client-routing`. `runConformance` from `related-web-core/conformance` runs against each build in Chromium, Firefox and WebKit, and a failure blocks the adapter's release. These browsers render the page, so the router's real view-transition path is exercised, not only its no-animation swap.

A package test, like the core's, packs `related-web-astro` and the core, installs them in a clean Astro project outside the repository, and builds and runs a page.

### 2.6 Scope of the first version

- Static output only. A site rendered on demand (`output: "server"`) is not supported; the injected routes are prerendered.
- Astro 7. Other versions are not checked.
- Several graphs per site and several clients per page are supported. The page-level graph, the shared graph, and two graphs on one page are covered by the conformance site.

## 3. Alternatives Considered

- **Only registered graphs, every graph through the integration options.** Rejected for page graphs: a graph per page would need an options entry and a generated id for each page, and the page that holds the content that defines the graph would not be the place that declares it.
- **Only inline graphs.** Rejected for shared and large graphs: every page would carry the document in its HTML, and there would be no revision, so no cacheable file and no stored copy.
- **Documentation and a recipe, no package.** Each site would copy the endpoints, the hash, the descriptor and the lifecycle wiring. Rejected: those pieces are the same on every Astro site, and a copy cannot be checked against the conformance scenarios.
- **A UI-framework component as the primary API (a React island, for example).** Rejected: it ties the adapter to one UI framework, and a component that holds the client is the island whose unmount ended the worker in SPIKE-005 §5.3. A persisted island (`transition:persist`) also keeps the worker alive, and a site may use one with the client module; it is not the default because module state does the same job with less machinery.
- **Writing the data and descriptor from a Node script or an `astro:build:done` hook.** Rejected: content collections are not available there, so the content-reading logic would exist twice, once for pages and once for the graph.
- **A fixed data URL (`graph.json`) with cache revalidation.** Rejected: every page load would revalidate the larger file, and a CDN could not cache it indefinitely. The hashed name moves the revalidation to the descriptor.
- **Detecting the profile at build time by scanning layouts for `ClientRouter`.** Rejected: the router can be added in a layout the scan does not see, and a wrong guess silently loses the retained instance or retains one that should not be. An explicit option with a development warning fails visibly.
- **A shared worker for all pages.** Rejected by ADR-001; the spike showed it ends with the last connected page on a multi-page site (SPIKE-003 §5.1).

## 4. Consequences

- A site gets a working graph from one integration entry, one source module and the client module; a page gets one from a component and a call. Neither writes endpoint, hashing or lifecycle code.
- Whether a graph belongs to every page, some or one is decided where it is used, not where it is declared. The cost is that nothing checks that a `"visit"` graph holds only shared data; an author who puts one page's data in it shares that data with every page.
- Inline page graphs have no revision and no stored copy, so they are replayed on every load, and their size adds to every load of the page. The size at which a graph should be registered instead has not been measured; it is follow-up work for the conformance site's load figures. A page graph that a visitor edits recovers by replaying its inline document (RFC-002 §5.3's read-only case); keeping visitor statements is not decided here.
- The page client and the visit client are independent instances. A page that wants both composes their results itself; loading a page graph into the site instance as scoped data is the core's `attachView`, and which of the options of RFC-002 §5.5 to prefer is left open.
- The adapter owns the descriptor's `revision`, so content changes invalidate stored graphs without the site author managing a version. The cost is that a source function that is not deterministic (timestamps, unordered output) makes every build look new; the adapter canonicalizes key and array order for the hash, and the source must still avoid varying data.
- The conformance site closes a gap left open by SPIKE-005 and by ADR-001's acceptance gate: the module-state client has so far been observed only through the router's no-animation path in a browser that did not render the page. The three-browser run observes the real path.
- The core's conformance scenario C-09 opens a page with the other profile in its query string and expects that value to decide the profile. The adapter therefore lets a caller override the profile (`{ navigation }` in the options of `graph` and `page.graph`), and the conformance site's pages pass the query value through. The override changes which core profile is used and nothing else; it does not add or remove the router. The override is documented as a testing aid.
- Components in other UI frameworks (a hook or composable that wraps `graph()` and `onPage`) are not provided. They are follow-up work, and the placeholder-first rule they must follow is documented in the adapter's README.
- The adapter cannot say what a good site graph or a good page graph is. Until RFC-003 and RFC-002's decisions are made, each site writes its own documents, and the conformance site uses small hand-written ones.
- Dev-server behavior, the production data URL under a non-root `base`, and installing the adapter as a published package (rather than a workspace link) each need a test; the last repeats the failure SPIKE-001 saw with a symlinked package under Observable Framework.

## 5. Related

- RFCs: RFC-001, RFC-002
- Builds on: ADR-001 (hosting and profiles), ADR-002 (data format), ADR-003 (descriptor)
- Evidence: SPIKE-002 (build-time graph), SPIKE-003 (client-side navigation), SPIKE-005 (worker survival across navigation)
