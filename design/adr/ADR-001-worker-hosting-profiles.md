---
id: ADR-001
title: Dedicated-Worker Hosting with Two Navigation Profiles
status: accepted
rfcs: [RFC-001]
created: 2026-11-01
---

# ADR-001: Dedicated-Worker Hosting with Two Navigation Profiles

## 1. Context

The browser build of CypherLite is an in-memory database that lives as long as the page or worker that created it. A website's graph (pages and the links between them) has to be loaded into it on every start, and that load costs time in proportion to the graph: replaying 1,000, 5,000 and 20,000 pages through two fixed statements took about 0.16 s, 0.6 s and 2.2 s on the main thread, which is synchronous and freezes the page for that long. In a dedicated worker the page stayed responsive (the longest gap in a 4 ms timer was 5–9 ms at every size), but the load took 1.8–2.8× as long (about 1.4 s at 5,000 pages, 6.3 s at 20,000).

How long an instance can live depends on how the site navigates. With client-side routing one page stays alive across route changes, and a main-thread instance kept in module state served every navigation at about 20 ms. A multi-page site discards the page, and the instance with it, on every navigation. A shared worker did not help a single visitor in one tab: it ended when the old page closed, before the new page connected, so five navigations produced five instances. It also cannot open the origin-private store (the browser's per-origin private file storage, OPFS), which exists only in dedicated workers.

That store restored a 5,000-page graph in about 0.35 s and a 20,000-page graph in 1.3 s, against 1.4 s and 6.3 s to replay in the worker. It has two limits: a second tab cannot open a store another tab holds (`storage locked`), and a worker terminated while running a query kept the store locked for about 2.3 s.

Two faults can end an instance. A statement with about a thousand nested parentheses traps the engine, and so did a cartesian `count(*)` over 5,000 pages; the trapped instance is unusable, and the second error it throws is not classified as a trap by the bundle's own check, `isWasmTrap`. A runaway statement (a three-way cartesian `count(*)`) has no limit of its own and can only be stopped by terminating the worker.

RFC-001 sets out these as independent axes (where the instance runs, what it starts with, how long it lives, how faults are contained). It also proposes a shared core, the package every framework adapter builds on, with a thin adapter per framework that wires the core into that framework's build and rendering. The same instance also serves a different use: a graph that belongs to a single page and has nothing to do with the site's content (a notebook of Cypher examples, a page encoded as a graph, a dashboard driven by data in the page). CypherLite's cookbook already runs page graphs this way: its engine lives in a module worker that starts on the first click of Run, and its Stop control terminates that worker. This decision fixes one hosting model that covers sites with and without client-side routing, and the host and fault handling that page graphs share.

## 2. Decision

### 2.1 One host: a dedicated worker driven by a client

The instance that holds the site-wide graph runs in a dedicated worker. Page graphs use the same worker host unless a later decision allows a small graph on the main thread; such an instance cannot be stopped by a timeout, so it must not run visitor-typed statements. A small client on the page owns the worker and exposes these operations (exact signatures are left to implementation):

- `generation`: an integer that increases each time the instance is replaced.
- `status`: `loading`, `ready`, `recovering` or `failed` (2.2).
- `query`: takes a statement, its parameters and an optional timeout; resolves with the result, or rejects with a reason (`trap`, `timeout`, `lost` when the instance was replaced mid-call, `stopped` when a visitor stopped the statement, or `failed` when the status is `failed`).
- `subscribe`: registers a query and a listener; the client runs the query when the instance is ready and again after every replacement, calling the listener with the status, the generation and the rows. Components use subscriptions and need no retry code.
- `onGeneration`: registers a listener that is called when a new instance is ready, before subscriptions re-run, so the page can re-apply data it wrote (2.5).
- `retry`: from `failed`, resets the failure count and starts a new attempt.

The graph reaches the worker as plain data (a node-link JSON document, ADR-002, with an optional descriptor, ADR-003: a small document beside the data that names the graph, its revision, the data's location and its indexes) and is loaded by a fixed set of parameterized statements. Link endpoints are resolved through the element ids the engine returns for the nodes, so loading needs no index. Indexes serve queries and are named by the descriptor (ADR-003); a lookup by property without one scans every node with that label (1,000 pages took about 6 s in Node). The build step produces the data and needs no database.

### 2.2 Fault handling, common to every instance and profile

- The worker marks its instance dead at the first trap and answers every later call as a trap; the later error is not relied on to identify the state.
- The client terminates the worker on a trap, a timeout or a worker error, starts a new one, and re-runs the subscriptions.
- An attempt is one start of an instance (the first load or a replacement), and a failure is an attempt that ends without reaching `ready`. After three failures in a row the client stops replacing the instance and sets the status to `failed`. The count starts at zero when `ready` is reached, and a fault from `ready` is not itself a failed attempt.
- While `failed`, calls reject with `failed` and nothing is replaced until `retry` starts a new attempt with the count at zero. A browser without worker support is `failed` at once, with no attempts.
- The client never sends a failure report; how a page words a failure is the page's choice.
- A statement that comes from a visitor (a query box) has either a timeout or a visible Stop control (the cookbook uses Stop); both terminate the worker. Fixed statements the site ships need neither. The core's default timeout is configurable and is chosen at implementation.
- Opening a store that reports `storage locked` is retried, starting at 100 ms and backing off to 500 ms, for up to 5 s (the release after a mid-query termination took about 2.3 s). If the store is still locked, the page continues with an in-memory instance loaded by replay for that view.

### 2.3 Profile `persistent` (site-wide graph, client-side routing)

The client is held in module state in the page that persists, or inside an island the router keeps across route changes, so it survives them; a client created by an island that remounts is lost on each navigation. The worker starts once per visit. Components unsubscribe their queries when they unmount and register them again on arrival; a kept island registers again on the router's page-load event, which also fires on history back and forward. Work that finishes after a component has gone is ignored. Arrival at a page (the router's page-load event) and departure (the router's before-swap event, or unmounting of the component) drive the page-scoped data in 2.5. An origin-private store is optional: when configured and the graph has a descriptor, the worker restores from it and replays only when the store is empty or stale, which shortens repeat visits. A client in `failed` stays `failed` across route changes until the page calls `retry`.

### 2.4 Profile `per-page` (site-wide graph, multi-page, no router)

Each page starts its own worker; no instance is shared across pages. Departure, which drops the view's page-scoped data (2.5), runs from `pagehide`, since a multi-page navigation fires no router event. The origin-private store is on by default when the graph has a descriptor (ADR-003): the worker restores the graph from it and replays the data when the store is empty, locked by another tab, or stale. Staleness is decided by comparing the `revision` in the descriptor with the copy of the descriptor the worker keeps beside the store (ADR-003 2.4, 2.5); on a mismatch the worker resets the store (which wipes and reopens it) and replays. Without a descriptor there is no store. The store's name comes from the descriptor's `id`, so sites on one origin do not share a store. A new page starts a fresh attempt, so `failed` does not carry from one page to the next.

The site author chooses the profile in the adapter's configuration (`navigation`, with the values `client-routing` and `multi-page`). An adapter may default to `persistent` where its framework has a client-side router, but the configured value decides.

### 2.5 Page-scoped data and rendering

- Page-scoped data (for example notes about a few site pages) is added over the shared graph on arrival and dropped on departure with a match on a `scope` property and a detach-delete. The scope identifies the page view, not the page, so two tabs on the same page cannot remove each other's data. After a replacement the page re-adds the current view's data from an `onGeneration` listener.
- With a store, page-scoped data would otherwise outlive the page. The worker therefore removes every scoped node when it starts, and the departure hook drops the current view's data.
- A component's first render must not depend on the instance. It shows a placeholder, and the result arrives through a subscription. The measured mismatch (a React text-content error on the first client-side navigation after the instance was ready) came from a component that read the instance during its first render.
- Navigation links and content must work with no instance: they are in the server-rendered page.

### 2.6 Page graphs

A graph that belongs to one page uses the same host, client and fault handling. It lives for one page view, stays in memory (no store, since nothing outlives the page) and is seeded from data the page supplies, not from the site's graph data. It may start on first use, as the cookbook's engine does on the first click of Run, instead of at page load. The profiles above govern only the site-wide graph. How such graphs are authored and delivered, how several on one page are hosted, what state a replacement must restore after the visitor has edited the graph, and whether a small graph may run on the main thread are decided separately (RFC-002 and the decisions that follow it).

### 2.7 Left to other decisions

Where the `.wasm` binary is served from and how it is handed to the worker, how statement results are reshaped into plain rows for components, the framework-specific wiring of the client, and hosting in server and build-time runtimes (RFC-001 7.5) are separate decisions.

## 3. Alternatives Considered

- **A shared worker.** Rejected: it ended between the pages of a one-tab multi-page visit and gave a new instance each time, and it cannot open the origin-private store. It helps only when several tabs are open at once.
- **An iframe shell that holds the worker, with the site's pages inside a frame.** Rejected for now: it reimplements client-side routing (address bar, history, scroll, focus, search indexing) by hand, a same-origin frame typically shares the page's thread, and it adds nothing to the store or fault handling. It was not tested; it remains a candidate for a follow-up spike for a multi-page site that wants one instance across pages.
- **A main-thread instance kept in module state.** Rejected as the default: it served navigations at about 20 ms but froze the page for the length of the replay (0.6 s at 5,000 pages). Kept as a fallback for a graph small enough that the measured freeze is acceptable.
- **A shared worker that starts the dedicated worker holding the store, so several tabs share one store.** Not evaluated. It would not help a one-tab multi-page visit (the shared worker still ends between pages), but it would answer the one-tab-at-a-time limit of the store. A candidate if sharing across tabs matters.
- **A service worker as the host.** Rejected: the browser stops a service worker when it is idle and restarts it on demand, so it cannot hold an in-memory instance for a visit.
- **Per-page replay with no store on a multi-page site.** Rejected: every page load pays the full replay, in a worker 0.3 s at 1,000 pages and about 1.4 s at 5,000. The store restored 4–5× faster.
- **Only the `persistent` profile (require a client-side router).** Rejected: some sites cannot adopt one, and the choice is the site author's.
- **Replacing a failed instance without limit, with growing waits.** Rejected: a document that always crashes would use the CPU for the whole visit, and the page would never reach a failed state it can show. The limit of three failures is a default chosen to absorb a one-off crash and end quickly; it is not measured.

## 4. Consequences

- A visitor waits longer for the graph than on the main thread (replay in the worker took 1.8–2.8× as long) but the page stays responsive. Components must render a usable placeholder until the first result.
- A first visit with a store pays the replay and writes the store (1.49 s against about 1.4 s without it at 5,000 pages). It also fetches the descriptor and writes the stored copy of it (ADR-003). Repeat visits restore in about 0.35 s at 5,000 pages and 1.3 s at 20,000, still growing with the graph.
- The store serves one tab at a time. A second tab replays in memory after the bounded retry, so its startup is the replay time.
- Replacing a failed instance costs a full load (about 0.3 s at 1,000 pages, 1.5 s at 5,000, 6.8 s at 20,000), or a restore (about 0.36 s at 5,000 pages) when a store is available. A worker terminated mid-query can keep the store locked for about 2.3 s, hence the retry.
- A statement a visitor types can trap or hang the engine, so a query box must use a timeout and must be built on the replacement path.
- `failed` is a fourth state that components render. A document that crashes the engine on every load ends in it after three attempts and stays there until the page calls `retry`; the rule is specified here and tested in the core package.
- Acceptance gate: the worker handle survives client-side route changes, observed with the router's simulated swap path or in a browser that renders the page. SPIKE-005 observed it with the simulated path (module state and a kept island, over link clicks, history traversal and programmatic navigation), so the gate is met. An observation with the browser's view transitions in a rendering browser is still open.
- With the loader of ADR-002 a worker loads 20,000 pages in 2.3 to 2.7 s in Chromium, Firefox and WebKit (single runs), against 6.3 s for the indexed replay of the spikes; restoring 5,000 pages from a store took 217 to 310 ms (core package tests).
- Page-scoped writes against an open store cost about 14 ms to add and 3 ms to drop for 50 notes and 50 relationships, against 11 ms and 2 ms in memory (SPIKE-005).
- A worker runs one statement at a time, so a running statement delays the first result of the next page until it finishes.
- The shared example site and its conformance check (RFC-001 3) run under both profiles.
- Not verified:
  - the worker handle surviving route changes with the browser's view transitions, and under the routers of other frameworks;
  - the staleness check (ADR-003), the sweep of leftover scoped data at start-up, and the bounded retry: each is covered by a test in the core package and none is timed;
  - browser support beyond Chromium, Firefox and WebKit on desktop, where the store works in all three;
  - the figures, which are single runs in an embedded browser.
- Follow-up: a run with view transitions in a rendering browser, and a spike on the staleness check; separate decisions for the binary location and result shape (RFC-001 7.7, 7.9).
- RFC-001 questions this decision settles: the interface half of 7.2 (generation, status, timeout, subscriptions, `onGeneration`), 7.4 (overlay on the shared instance, keyed by view) and the shared-worker question in 7.6 (rejected). It leaves open why replay is slower in a worker and whether the store can serve several tabs (7.3), recovery without a full load (7.2), and hydration in other frameworks (7.10).

## 5. Related

- RFCs: RFC-001
- Evidence: `design/spikes/SPIKE-003-astro-client-side-navigation/SPIKE.md`, `design/spikes/SPIKE-004-worker-hosting-and-faults/SPIKE.md`, `design/spikes/SPIKE-005-worker-survival-across-navigation/SPIKE.md`
- Prior art for page graphs, in the CypherLite repository: ADR-0130 (tested recipes with in-page cells run in a module worker), ADR-0151 (graph view with node expansion from the page's database)

## 6. Amendments

- 2026-11-02: added the `failed` status, the three-attempt rule, `retry`, and the `stopped` and `failed` rejection reasons (2.1, 2.2, 2.3, 2.4). Without a stopping rule, a document that crashes the engine on every load would replace the worker without end, or leave the status at `recovering` with nothing for the page to show. The core package specification (`specs/001-core-package/spec.md`, FR-002, FR-009, FR-033) defines the behavior and its tests.
- 2026-11-02: replaced the metadata node and the site identifier with the descriptor of ADR-003 (2.4), and replaced the index on a lookup property with endpoint resolution through element ids (2.1), as ADR-002's loading mechanism and ADR-003 describe.
- 2026-11-02: recorded the results of the core package's tests in the consequences (4).
