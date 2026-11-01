---
id: RFC-001
title: Embedding CypherLite in Web Frameworks
status: review
created: 2026-11-01
adrs: []
---

# RFC-001: Embedding CypherLite in Web Frameworks

## 1. Summary

CypherLite is an embedded property graph database queried with Cypher. In the browser it is available only as a WebAssembly (WASM) module. Outside the browser it is also available as a native library for Node with durable local storage, and it can be served over HTTP. Web frameworks, from static site generators to full-stack frameworks, run code in several different places (at build time, on a server, in the page), and each has its own way of bundling, serving, and hydrating assets. Putting a database into a website therefore raises a hosting question before any feature work starts: where does the database instance live, who loads it, and what data does it start with?

The organizing claim is that the answer should be settled once, as a shared core, and expressed in each framework as a thin adapter. The alternative, working out hosting separately for every framework, repeats the hardest decisions several times and produces integrations that behave differently from each other.

The hosting problem decomposes into independent axes: which distribution runs where, where the instance runs, what it starts with, how long it lives, and how faults are contained. Time-boxed spikes can measure each axis, and decision records can then settle them one at a time. No approach is chosen here.

## 2. Problem / Motivation

The facts of the distributions shape every option. Browser constraints come from the WASM module; the native Node library and HTTP serving remove some of them off the browser.

- **In-memory by default in the browser.** A new WASM database instance is empty and lives only as long as the page or worker that created it. Anything it should contain on first load has to be delivered to it.
- **Browser persistence is narrow.** It exists only inside a dedicated worker, using the browser's origin-private file storage, and stores JSON snapshots (serialized copies of the graph) because the browser build has no columnar file codec. There is no persistence on the main thread. The native Node library persists to local files (Parquet or JSON, depending on the build and configuration), so a build-time or server instance can hold more data, and in more formats, than the browser build.
- **A fault kills the instance.** A Rust panic traps the WASM module and leaves the instance unusable. The documented remedies are replacing the worker or reloading the page, which makes isolation a design input, not an afterthought.
- **Bundlers disturb asset loading.** The WASM module fetches its `.wasm` file relative to itself. Bundlers that relocate or hash assets break that assumption, so the file's location has to be passed explicitly, differently in each toolchain. In one static-site framework the bundler emitted the module's JavaScript but not the binary, so the default lookup returned a 404 page; the integration worked once the binary was placed among the site's static assets and its URL was handed to the initializer. The same framework's bundler also failed to resolve a package installed as a symlink to a directory outside the project (`Could not resolve entry module`), while the same package copied in, or symlinked from inside the project, built normally.
- **The module is large for a content page.** The release WASM module of CypherLite 0.14.0 is 5,973,771 bytes raw, about 2.1 MB gzipped and 1.5 MB brotli-compressed. It initialized in tens of milliseconds on localhost, which says nothing about a cold fetch over a real network.
- **Results need reshaping.** In the same integration the statement result could not be handed to other components as is: row keys arrived alphabetical, not in column order (an open upstream issue); graph entities arrive tagged and paths as alternating node and relationship arrays; and an engine error arrives in-band as a reduced result with no column types. After normalizing those, the results were consumed unchanged by charting, input, table, aggregation and SQL components.
- **Runtimes differ in what each distribution can do.** A static build step, a Node server, a serverless function, and an edge runtime each constrain module size, startup time, available threads, filesystem access, and whether platform-specific native binaries can be loaded at all. A website built on a framework that spans several of these runtimes cannot assume one environment or one distribution.

The facts about how each distribution behaves are documented in CypherLite's WASM API contract (`docs/api/wasm/spec.md`), its decisions on the browser file store (ADR-0145) and the size-optimized build (ADR-0100), and the description of the Node package (`docs/api/javascript/description.md`). The observed bundler failures, the size figures and the result-shape findings come from an integration with Observable Framework, recorded in SPIKE-001 (`design/spikes/SPIKE-001-observable-framework-wasm/SPIKE.md`).

Each framework layers its own behavior on top. A static site generator has a build step where data can be prepared but no server at request time. A full-stack framework can render on a server and then hydrate in the browser, so the same component may run in two runtimes. Client-side navigation keeps one page alive across route changes, while a multi-page site reloads and re-instantiates everything on each navigation.

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

A core package owns everything that does not depend on a framework: loading whichever distribution applies, creating and disposing instances, running queries, handling faults, and receiving initial data. A framework adapter owns only what is framework-specific: wiring the core into the framework's build and render lifecycle, locating the `.wasm` asset under that framework's bundler, and exposing the result through the framework's idioms for pages and components. Two responsibilities of the core have evidence behind them: it takes the binary's location as an input that the adapter supplies, and it reshapes statement results into plain row arrays with column metadata, which charting, input, table and SQL components consumed directly.

Success for this split is that adding a framework requires no new decisions about instance lifetime, fault handling, or data delivery, and that every adapter can be checked against the same sample site.

### 5.2 Axes of variation

The candidate approaches differ along five mostly independent axes. Each axis becomes one or more spikes and, once evidence exists, one decision record.

**Which distribution runs where.** The WASM module, the native Node library, or a served instance reached over HTTP (considered only as a build-time tool or comparison point; see §4). The browser admits only WASM. Build time and server runtimes could use the native library, which has durable storage and no browser size or storage limits, or WASM for parity with the browser. A common hybrid is native at build time and WASM in the browser, which makes the compatibility of what the two builds can exchange a first-order question.

**Where the instance runs.** Build time only (the database is a data-preparation tool and the browser receives results), a server runtime (queries answered per request), the browser main thread, a browser dedicated worker, or a browser shared worker serving several pages. Combinations are likely: build-time preparation feeding a browser instance is the natural fit for static sites.

**What the instance starts with.** Nothing (pages populate it on load), a precomputed snapshot delivered with the site, or a snapshot restored from browser persistence when present. This axis decides first-load cost and how stale a visitor's data can be.

**How long the instance lives.** One per page load, one per browser session shared across pages, or one per origin kept alive across visits through persistence. This axis is where framework navigation behavior matters most.

**How faults are contained.** Running in a worker lets a trapped instance be replaced without losing the page; running on the main thread does not. The choice interacts with where the instance runs and with how many components depend on a single instance.

### 5.3 Relating per-page and site-wide graphs

Two arrangements are candidates. In the first, a single instance holds the shared site data and each page adds its own data to it, in effect an overlay that is discarded when the page goes away. In the second, the site-wide graph and each page's graph are separate instances, and queries that span both are composed outside the database. The first favors cross-graph queries and simplicity; the second favors isolation and independent lifetimes. Which is workable depends on what the database can do for removing or scoping a page's data, and a spike should establish that (see 7.4).

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
- **Native library at build time and on the server, WASM only in the browser.** Kept as the leading hybrid to evaluate. It depends on the two builds exchanging data, which is the subject of 7.9.
- **Embedding the existing CypherLite playground per page.** Kept as a comparison point for the per-page graph, since it is the cheapest way to put a live graph in a page. Likely rejected for the site-wide graph: it offers no way to share an instance or data with the rest of the page or site.
- **Build-time only, with no browser instance.** Kept as one end of the "where it runs" axis rather than rejected outright. It covers static content well but gives up per-page interactivity and any query driven by the visitor.
- **Compiling the site's data into plain structures and skipping the database in the browser.** Rejected: it forgoes the demonstration of the database itself, which is the purpose of the integration.

## 7. Open Questions

7.1. The release module measures about 6.0 MB raw and 1.5 MB compressed, and initializes in tens of milliseconds on localhost. What is the cold start over a real network, and what budget does a content-focused website tolerate for download plus start-up?

7.2. Can a trapped instance be replaced transparently for components that hold query state, and what do adapters need to expose so that components recover cleanly?

7.3. How does a snapshot reach the instance: at construction, by loading after construction, or by replaying statements? What does each cost for a site-sized graph?

7.4. Can an instance hold shared site data plus a page's own data and then remove only the page's data on navigation, or is separate instances the only clean option?

7.5. Which server runtimes does each target framework offer, and in each (for example serverless functions and edge runtimes), which distributions load within the size and startup limits: the native library, WASM, both, or neither?

7.6. Does a browser shared worker, or an equivalent mechanism, give a practical single instance across the pages of a multi-page site, and how widely is it supported?

7.7. One framework required its adapter to place the binary among static assets and pass its location to the core. Does the same hold for the other target frameworks, and does a published package, unlike a local checkout, avoid the dependency-resolution failure seen with a symlinked package outside the project?

7.8. Which upstream capabilities would change the answers to 7.3 and 7.4 (for example loading a snapshot directly, or scoping and dropping a subset of data), and should they be requested from the database's maintainers?

7.9. The native library can write Parquet or JSON checkpoints, and the browser build currently loads JSON snapshots. Does a JSON checkpoint written by the native library load in the WASM build as is, and at what size and load cost for a site-sized graph?

7.10. WASM results needed reshaping before other components could use them: column order, entity tagging, path shape, and a reduced error envelope. The Node package follows a different, driver-style session and result API. Does it produce the same shapes, and what must the core's query interface normalize across both distributions?

## 8. ADRs

_(populated automatically as `/adr-create` links ADRs to this RFC)_
