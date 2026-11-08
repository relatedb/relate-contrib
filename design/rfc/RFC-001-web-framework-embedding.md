---
id: RFC-001
title: Embedding CypherLite in Web Frameworks
status: accepted
created: 2026-11-01
adrs: [ADR-001, ADR-002, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]
---

# RFC-001: Embedding CypherLite in Web Frameworks

## 1. Summary

CypherLite is an embedded property graph database queried with Cypher. In the browser it is available only as a WebAssembly (WASM) module. Outside the browser it is also available as a native library for Node with durable local storage, and it can be served over HTTP. Web frameworks, from static site generators to full-stack frameworks, run code in several different places (at build time, on a server, in the page), and each has its own way of bundling, serving, and hydrating assets. The first frameworks in scope are Observable Framework and Astro (both already measured), followed by Next, Nuxt and SvelteKit. Putting a database into a website therefore raises a hosting question before any feature work starts: where does the database instance live, who loads it, and what data does it start with?

The organizing claim is that the answer should be settled once, as a shared core, and expressed in each framework as a thin adapter. The alternative, working out hosting separately for every framework, repeats the hardest decisions several times and produces integrations that behave differently from each other.

The hosting problem decomposes into independent axes: which distribution runs where, where the instance runs, what it starts with, how long it lives, and how faults are contained. Time-boxed spikes can measure each axis, and decision records can then settle them one at a time. No approach is chosen here.

## 2. Problem / Motivation

The facts of the distributions shape every option. Browser constraints come from the WASM module; the native Node library and HTTP serving remove some of them off the browser.

- **In-memory by default in the browser.** A new WASM database instance is empty and lives only as long as the page or worker that created it. Anything it should contain on first load has to be delivered to it.
- **Browser persistence is narrow.** It exists only inside a dedicated worker, using the browser's origin-private file storage, and stores JSON snapshots (serialized copies of the graph) because the browser build has no columnar file codec. There is no persistence on the main thread. The native Node library persists to local files (Parquet or JSON, depending on the build and configuration), so a build-time or server instance can hold more data, and in more formats, than the browser build.
- **A fault kills the instance.** A Rust panic traps the WASM module and leaves the instance unusable. The documented remedies are replacing the worker or reloading the page, which makes isolation a design input.
- **Bundlers disturb asset loading.** The WASM module fetches its `.wasm` file relative to itself. Bundlers that relocate or hash assets break that assumption, so the file's location has to be passed explicitly, differently in each toolchain. In one static-site framework the bundler emitted the module's JavaScript but not the binary, so the default lookup returned a 404 page; the integration worked once the binary was placed among the site's static assets and its URL was handed to the initializer. The same framework's bundler also failed to resolve a package installed as a symlink to a directory outside the project (`Could not resolve entry module`), while the same package copied in, or symlinked from inside the project, built normally. A Vite-based framework needed none of this: its bundler rewrote the default lookup and emitted one hashed copy of the binary, so initializing with no argument worked in development and in a production build, and a package symlinked from outside the project built and was served in development.
- **The browser build has no snapshot import.** Its public interface runs statements and scripts, resets, and opens the origin-private store; nothing loads a serialized graph. A graph reaches an instance by replaying statements, or by writing the origin-private store's catalog and slot files by hand, a format internal to the database. A checkpoint written by the native library therefore cannot be loaded by the browser build.
- **Replay cost grows with the graph, and blocks the page.** A content graph shipped as JSON and loaded through two fixed statements, with an index on the lookup property, loaded 1,000 pages and 5,000 links in about 190 ms and 5,000 pages and 25,000 links in about 530 ms in a browser on the main thread. Execution is synchronous, so the larger load blocks the page. Without the index, each link lookup scans every page, and 1,000 pages took about 6 s in Node.
- **How long an instance lives depends on how the site navigates.** With client-side routing, a main-thread instance kept in module state, or an island the router keeps in the page, survived every navigation, and a navigation took about 20 ms where re-initializing took 113–128 ms for 1,000 pages and about 1.3–1.5 s for 5,000. On a multi-page site every page load pays the full replay (about 0.3–0.5 s for 1,000 pages). A shared worker did not change that for one visitor in one tab: the worker ended when the old page closed and before the new one connected, so five navigations produced five instances. It kept an instance only while another tab stayed connected. A worker client held the way the main-thread instance was (in module state, or inside an island the router keeps) also survived link clicks, history back and forward and programmatic navigation, and was lost only when the document was replaced or when an island that owned its client unmounted.
- **A worker removes the page freeze but delays the graph, and a fault costs a full reload of the data.** Replaying a content graph in a dedicated worker left the page's timer undisturbed (largest gap 5–9 ms at 1,000, 5,000 and 20,000 pages), where main-thread replay froze it for 0.16 s, 0.6 s and 2.2 s. The same replay took 1.8–2.8× longer in the worker (about 1.4 s at 5,000 pages and 6.3 s at 20,000). A statement with about a thousand nested parentheses traps the engine, and a runaway query has to be stopped by terminating the worker; replacing the worker and replaying took as long as a first load (0.3 s, 1.5 s and 6.8 s at those sizes).
- **A stored graph restores faster than a replay, for one tab.** Opening the origin-private store in a dedicated worker restored 5,000 pages in about 0.35 s and 20,000 in 1.3 s, against 1.4 s and 6.3 s to replay in the worker. A second tab could not open a store the first tab held, and a worker terminated mid-query kept the store locked for about 2.3 s.
- **Server and browser renders can disagree once an instance outlives the page.** A component that read the instance's answer during its first render matched the server output on a full page load and mismatched it (a React text-content error) on the first client-side navigation after the instance was ready. A component that rendered a placeholder first did not mismatch.
- **The module is large for a content page.** The release WASM module of CypherLite 0.14.0 is 5,973,771 bytes raw, about 2.1 MB gzipped and 1.5 MB brotli-compressed. It initialized in 16–37 ms in a browser with the binary on localhost, which says nothing about a cold fetch over a real network; the preview server used for the measurement did not compress the binary.
- **Results need reshaping.** In the same integration the statement result could not be handed to other components as is: row keys arrived alphabetical, not in column order (an open upstream issue); graph entities arrive tagged and paths as alternating node and relationship arrays; and an engine error arrives in-band as a reduced result with no column types. After normalizing those, the results were consumed unchanged by charting, input, table, aggregation and SQL components.
- **Runtimes differ in what each distribution can do.** A static build step, a Node server, a serverless function, and an edge runtime each constrain module size, startup time, available threads, filesystem access, and whether platform-specific native binaries can be loaded at all. A website built on a framework that spans several of these runtimes cannot assume one environment or one distribution.

The facts about how each distribution behaves are documented in CypherLite's WASM API contract (`docs/api/wasm/spec.md`), its decisions on the browser file store (ADR-0145) and the size-optimized build (ADR-0100), and the description of the Node package (`docs/api/javascript/description.md`). The observed bundler failures, the size figures and the result-shape findings come from an integration with Observable Framework, recorded in SPIKE-001 (`design/spikes/SPIKE-001-observable-framework-wasm/SPIKE.md`). The Vite-based bundler behavior, the absence of a snapshot import, and the replay measurements come from a build-time content graph in an Astro site, recorded in SPIKE-002 (`design/spikes/SPIKE-002-astro-build-time-graph/SPIKE.md`). The lifetime, overlay and hydration measurements come from the same Astro site with client-side routing, recorded in SPIKE-003 (`design/spikes/SPIKE-003-astro-client-side-navigation/SPIKE.md`). The worker, store and fault measurements come from the same site with a dedicated worker, recorded in SPIKE-004 (`design/spikes/SPIKE-004-worker-hosting-and-faults/SPIKE.md`). The survival of the worker client across route changes comes from SPIKE-005 (`design/spikes/SPIKE-005-worker-survival-across-navigation/SPIKE.md`).

Each framework layers its own behavior on top. A static site generator has a build step where data can be prepared but no server at request time. A full-stack framework can render on a server and then hydrate in the browser, so the same component may run in two runtimes. Client-side navigation keeps one page alive across route changes, while a multi-page site reloads and re-instantiates everything on each navigation.

The integrations exist to show CypherLite running inside real websites, starting with its own. A design that hides the database behind precomputed data does not meet that purpose, so the browser instance is a requirement, not an optimization.

Two uses of the database sharpen the problem. Consider a documentation page that embeds a query result drawn from its own content, while a navigation element on the same page needs the whole site's graph. In that scenario the page's own graph wants an instance close to the page, and the site-wide graph, shared by every page and by navigation, wants to be loaded once and reused. If each page instantiates the module and loads the site data independently, a visitor pays startup and download cost on every navigation. If one instance is shared, something has to own its lifetime across pages, and a fault in it affects everything that depends on it.

Without an agreed hosting model, every integration becomes its own investigation, and findings from one framework do not carry over to the next unless the shape of the problem is explicit.

## 3. Goals

- Identify the independent decisions that make up "hosting CypherLite in a web page" so each can be settled and revisited separately.
- Define a shared core that every framework adapter builds on. Every adapter passes the same conformance check, run against a small shared example website that exercises per-page queries, a shared graph, and failure of the database to load, without adding its own decisions about instance lifetime, fault handling, or data delivery.
- Cover every runtime a framework may execute in (build time, server, and browser, including worker and main-thread variants) and every CypherLite distribution available in each.
- Describe how a per-page graph and a site-wide graph coexist, including who owns instance lifetime across navigation.
- Make fault containment, page weight, and first-load latency explicit evaluation criteria.
- Produce a list of empirical questions suitable for time-boxed spikes.

## 4. Non-Goals

- Choosing a hosting approach. That is the job of spikes and the decision records that follow them.
- The structure of the site-wide graph, how page content becomes graph data, and vector embeddings. These are a separate problem that depends on the hosting model but not the reverse.
- The design of the navigation element and its language interface.
- Changes to CypherLite itself. Where an integration needs something the database does not provide, the need is recorded and raised with the database's maintainers.
- Deployments where a page queries a separately hosted CypherLite instance over the network. The scope is the embedded, in-process case; a served instance is considered only as a comparison point and as a possible build-time tool.

## 5. Proposed Approach (high-level)

The approach has three parts: a shared core, a set of axes along which hosting can vary, and a way of relating the two kinds of graph.

### 5.1 A shared core with thin adapters

A core package owns everything that does not depend on a framework: loading whichever distribution applies, creating and disposing instances, running queries, handling faults, and receiving initial data. A framework adapter owns only what is framework-specific: wiring the core into the framework's build and render lifecycle, locating the `.wasm` asset under that framework's bundler, and exposing the result through the framework's idioms for pages and components. The measured integrations suggest two responsibilities for the core: accepting the binary's location from the adapter, and presenting results in a form that charting, input, table and SQL components can consume directly. For delivering data, one candidate is to ship the graph as plain data and load it with a fixed set of statements, which needs no database at build time.

Success for this split is that adding a framework requires no new decisions about instance lifetime, fault handling, or data delivery, and that every adapter can be checked against the same sample site.

### 5.2 Axes of variation

The candidate approaches differ along five mostly independent axes. Each axis becomes one or more spikes and, once evidence exists, one decision record.

**Which distribution runs where.** The WASM module, the native Node library, or a served instance reached over HTTP (considered only as a build-time tool or comparison point; see §4). The browser admits only WASM. Build time and server runtimes could use the native library, which has durable storage and no browser size or storage limits, or WASM for parity with the browser. A common hybrid is native at build time and WASM in the browser, which makes what the two builds can exchange a first-order question. A native checkpoint cannot be loaded by the browser build; data shipped as JSON and replayed through fixed statements can, which would need no database at build time.

**Where the instance runs.** Build time only (the database is a data-preparation tool and the browser receives results), a server runtime (queries answered per request), the browser main thread, a browser dedicated worker, or a browser shared worker serving several pages. Combinations are likely: build-time preparation feeding a browser instance is the natural fit for static sites.

**What the instance starts with.** Nothing (pages populate it on load), a precomputed snapshot delivered with the site, or a snapshot restored from browser persistence when present. This axis decides first-load cost and how stale a visitor's data can be. A stored graph restored 4–5× faster than a replay in a worker, for one tab at a time, and can go stale after the content changes.

**How long the instance lives.** One per page load, one per browser session shared across pages, or one per origin kept alive across visits through persistence. This axis is where framework navigation behavior matters most: with client-side routing one page-lifetime instance can serve the whole visit, while a multi-page site reloads the page and the instance with it.

**How faults are contained.** Running in a worker lets a trapped instance be replaced without losing the page; running on the main thread does not. The choice interacts with where the instance runs and with how many components depend on a single instance. In a measured worker, a trapped or runaway instance was replaced without disturbing the page and registered queries recovered without code of their own, at the cost of loading the data again.

### 5.3 Relating per-page and site-wide graphs

Two arrangements are candidates. In the first, a single instance holds the shared site data and each page adds its own data to it, in effect an overlay that is discarded when the page goes away. In the second, the site-wide graph and each page's graph are separate instances, and queries that span both are composed outside the database. The first favors cross-graph queries and simplicity; the second favors isolation and independent lifetimes. In a measured overlay, removing a page's data was exact and fast (see 7.4); page data needs a key that identifies the page view, because the same page can be open in several tabs.

### 5.4 Cross-cutting concerns

These apply regardless of which axis values are chosen:

- **Page weight and startup.** The module and any snapshot are downloaded by every visitor. Budgets for both need to exist before approaches are compared.
- **Progressive behavior.** Pages must remain usable and navigable before the database is ready and when it fails to load. Navigation links cannot depend on the database being up.
- **Server-render and hydration consistency.** When a component renders on a server and again in the browser, the results must agree, or the framework will report mismatches.
- **Runtime limits.** Serverless and edge runtimes constrain module size, startup time, available storage, and the loading of native binaries in ways that differ per host. Approaches that need a server runtime must be checked against those limits, not just against a local development server.
- **Version coupling.** The snapshot format and the module version must stay compatible, so a site never loads a snapshot its module cannot read.

## 6. Alternatives Considered

- **Per-framework integrations with no shared core.** Rejected: each framework would resolve instance lifetime, fault handling, and data delivery on its own, and the integrations would diverge.
- **A hosted CypherLite server that pages query over the network.** Rejected for the browser-facing path: it removes the embedded, no-server property that is the reason to showcase the database on a website, and requires infrastructure that static hosting cannot provide. It remains relevant as a comparison point for latency and capability.
- **WASM everywhere, including build time and server.** Kept as one value of the distribution axis rather than rejected outright. It gives one code path, at the cost of the native library's durable storage and without its size and storage advantages.
- **Native library at build time and on the server, WASM only in the browser.** Kept as the leading hybrid to evaluate. The two builds cannot exchange checkpoints (7.8), but a build step needs no database to produce data the browser replays, so the native library's role narrows to graphs built or queried on a server.
- **Embedding the existing CypherLite playground per page.** Kept as a comparison point for the per-page graph, since it is the cheapest way to put a live graph in a page. Likely rejected for the site-wide graph: it offers no way to share an instance or data with the rest of the page or site.
- **Build-time only, with no browser instance.** Kept as one end of the "where it runs" axis rather than rejected outright. It covers static content well but gives up per-page interactivity and any query driven by the visitor.
- **Compiling the site's data into plain structures and skipping the database in the browser.** Rejected: it forgoes the demonstration of the database itself, which is the purpose of the integration.

## 7. Open Questions

7.1. The release module measures about 6.0 MB raw and 1.5 MB compressed, and initializes in tens of milliseconds on localhost. What is the cold start over a real network, and what budget does a content-focused website tolerate for download plus start-up?

7.2. A trapped instance (provoked by a statement with about a thousand nested parentheses) and a runaway query were handled by terminating the worker and starting a new one, re-running registered queries, with recovery taking as long as a first load (0.3 s at 1,000 pages, 1.5 s at 5,000, 6.8 s at 20,000; 0.36 s at 5,000 with a stored graph). The adapter had to mark an instance dead at its first trap, because the bundle's trap check classified the second error from the dead instance as an ordinary error, and a store stayed locked for about 2.3 s after a worker was terminated mid-query. What interface should adapters expose (a generation counter, a status and a call timeout worked), how should page-scoped data be re-applied after a replacement, and can recovery avoid loading the full data again?

7.3. Replaying a content graph as JSON through two fixed statements, with an index on the lookup property, loads 1,000 pages in about 160–190 ms, 5,000 pages in about 0.6 s and 20,000 pages in about 2.2 s on the main thread of a browser, and a multi-page site pays it on every page. A dedicated worker removes the main-thread block but takes 1.8–2.8× as long (about 1.4 s at 5,000 pages and 6.3 s at 20,000). Opening a stored graph in the worker took about 0.35 s at 5,000 pages and 1.3 s at 20,000, for one tab at a time. What makes replay slower in a worker, can the store serve more than one tab, and at what graph size does the wait for the graph stop being acceptable for a first visit?

7.4. An overlay on the shared instance (50 nodes and 50 relationships per page, 1,000 and 5,000 pages) was removed exactly in under 1 ms and added in 3–5 ms when the lookup properties were indexed; separate per-page instances were also cheap but cannot be queried together with the site graph. Does the overlay hold up at larger graphs and alongside embeddings, and does it need upstream support (7.8) so that scoping and dropping a page's data does not depend on a convention in the data?

7.5. Which server runtimes does each target framework offer, and in each (for example serverless functions and edge runtimes), which distributions load within the size and startup limits: the native library, WASM, both, or neither?

7.6. A shared worker did not keep an instance across the pages of a one-tab multi-page visit. A dedicated-worker client held in module state, or inside an island the router keeps, survived client-side navigation, history back and forward and programmatic navigation, with a swap taking about 24 ms; this was observed with the router's no-animation swap path in a browser that did not render the page, and a worker was lost only when the document was replaced. Is there any way to keep an instance across a multi-page site's navigations beyond a second connected tab, does the result hold with the browser's view transitions and under the routers of Next, Nuxt and SvelteKit, and how widely is the shared worker supported?

7.7. Under Observable Framework the adapter had to place the binary among static assets and pass its location to the core; under a Vite-based framework (Astro) the bundler handled it. Which of the other target frameworks, especially those outside the Vite family, need the adapter to do it, and does a published package avoid the dependency-resolution failure that Observable's bundler showed for a symlinked package outside the project?

7.8. Which upstream capabilities would change the answers to 7.3 and 7.4, and should they be requested from the database's maintainers? Candidates are scoping and dropping a subset of data, and a direct snapshot load in the browser build. The browser build cannot open a native checkpoint and a content site does not need one, since replayed JSON works, so a snapshot load needs a use case such as a server-built graph too large to replay, or a graph shared with a server instance.

7.9. WASM results needed reshaping before other components could use them: column order, entity tagging, path shape, and a reduced error envelope. The Node package follows a different, driver-style session and result API. Does it produce the same shapes, and what must the core's query interface normalize across both distributions?

7.10. A component that read the instance during its first render mismatched the server output once the instance outlived the page, and a placeholder-first component did not; pages stayed usable before the database was ready and when it failed to load. Does the same hold under the hydration of Next, Nuxt and SvelteKit, and what should an adapter provide so that components avoid the mismatch by default?

## 8. ADRs

- [ADR-001](../adr/ADR-001-worker-hosting-profiles.md): Dedicated-worker hosting with two navigation profiles (accepted)
- [ADR-002](../adr/ADR-002-graph-data-format.md): Node-link JSON as the graph data format (accepted)
- [ADR-003](../adr/ADR-003-graph-descriptor.md): Graph descriptor beside the graph data (accepted)
- [ADR-004](../adr/ADR-004-astro-adapter.md): The Astro adapter as an integration over the core (accepted)
- [ADR-005](../adr/ADR-005-next-adapter.md): The Next.js adapter as React bindings over the core (accepted)
- [ADR-006](../adr/ADR-006-observable-adapter.md): The Observable Framework adapter as a helper package over the core (accepted)
- [ADR-007](../adr/ADR-007-sveltekit-adapter.md): The SvelteKit adapter as Svelte 5 helpers over the core (proposed)
