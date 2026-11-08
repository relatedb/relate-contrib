# Feature Specification: SvelteKit Adapter for Embedding the Graph Database in SvelteKit Sites

**Feature Branch**: `adapter/sveltekit` (spec directory `005-sveltekit-adapter`)

**Created**: 2026-11-08

**Status**: Implemented (ADR-007)

**Input**: User description: "The SvelteKit adapter (`@relate/sveltekit`): a workspace package in `packages/sveltekit` that implements accepted ADR-007 (and builds on ADR-001 to ADR-006 and the SPIKE-007 findings) so a SvelteKit 3 / Svelte 5 site can embed the browser graph database through the shared core package. It publishes registered graphs from a prerendered route the site writes, writes inline page graphs into pages, supplies Svelte 5 helpers whose lifetimes follow components, and is checked with a conformance site and a package test."

## Overview

The shared core package (`@relate/web`, specification `specs/001-core-package/spec.md`) runs the embedded graph database in a page and knows nothing about any framework. The Astro, Next and Observable adapters (`specs/002-astro-adapter`, `specs/003-next-adapter`, `specs/004-observable-adapter`) showed what an adapter supplies: graph data and descriptors at build time, a way for a page to ask for a graph, and lifetimes that follow the page or its components. SvelteKit needs the same things in its own shape: it has no route injection, so the published files come from a route the site writes; it renders pages on a server or at build time and hydrates them, with a lifecycle in which `onMount` and `$effect` do not run on the server but `onDestroy` does; and its router destroys the old page before the new page mounts.

Three kinds of people depend on it:

- **Site authors** build a SvelteKit site and want a graph in it with little code: one for every page, for a few, or for one.
- **Adapter authors** of later frameworks read this adapter with the others to see what is framework-specific and what the core should hold.
- **Visitors** read the pages and never see the adapter, but they feel a graph that reloads on every click, shows the previous page's data, or breaks a link.

The adapter implements ADR-007 and builds on ADR-001 (hosting and navigation profiles), ADR-002 (graph data format), ADR-003 (graph descriptor), ADR-004 to ADR-006 (the other adapters) and SPIKE-007. Terms used below: a *registered graph* is declared in one module and delivered as files; an *inline graph* is a small document written into a page; a *holder* is a component that is using a graph and has not been removed from the page; the *profile* is the core's choice between keeping one client for the whole visit (`client-routing`) or one per page (`multi-page`); a *descriptor* is the small file that names a graph's data location, revision and counts, so a page can restore a stored copy of the graph instead of fetching the data.

## Clarifications

### Session 2026-11-08

- Q: What does this feature change in code that other packages own? → A: Nothing. ADR-007 names no core change; the adapter uses the core's existing build subpath, validators, client and conformance runner.
- Q: Which open items does implementation settle, and where are the answers recorded? → A: The ones in ADR-007 §4; each answer is recorded as a dated amendment to ADR-007.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A site registers a graph and a component queries it (Priority: P1)

A site author declares a graph and its source in one module, writes a short route file, returns a catalog from a layout load, and places a provider in the root layout. At build time the adapter validates the graph and publishes it with a descriptor. A component asks for the graph, subscribes to a query, and shows results when the graph is ready. The page renders on the server and in the browser without the instance, and shows a placeholder until the result arrives.

**Why this priority**: it is the smallest slice that proves the adapter's whole build-to-browser path, and every later behavior depends on it.

**Independent Test**: build the conformance site, open a page whose component asks for a registered graph, and check the server-rendered placeholder, the absence of a hydration warning, then the result.

**Acceptance Scenarios**:

1. **Given** a registered graph whose source returns a valid document, **When** the site is built, **Then** a data file named by the document's revision and a descriptor naming that revision and the document's node and link counts are published, and the descriptor's data location points at the data file.
2. **Given** a component that asks for the registered graph and subscribes to a query, **When** the page is rendered on the server and then in the browser, **Then** the server markup holds the placeholder, the hydrated page shows no warning, and the result appears when the graph is ready.
3. **Given** a source that returns an invalid document, **When** the site is built, **Then** the build fails and names the graph and the path of the first problem.
4. **Given** the same source content in two builds, **When** both are built, **Then** both produce the same revision, whatever the order of keys or items in the source.
5. **Given** a source that returns different content on each call, **When** the site is built, **Then** the build fails with a message that names the graph and says its source is not deterministic.
6. **Given** a site with a non-root base path, **When** it is built for each supported output, **Then** the data location in the descriptor and the locations a component requests include the base path and the graph loads.
7. **Given** a graph with an index named in its declaration, **When** a component loads it, **Then** that index is created and no other.
8. **Given** a request for a graph name or file that is not declared, **When** it is made, **Then** it is answered as not found, in the static output, in the Node output and in development.
9. **Given** a malformed or duplicate graph id, **When** the route is built, **Then** the build fails and names the problem.
10. **Given** the engine's binary and the core's worker script, **When** the site is built or run in development, **Then** both are placed and found with no configuration or copying by the site.

---

### User Story 2 - A page carries its own small graph (Priority: P1)

An author writes a small graph beside a page's prose, or builds it from the page's own content. The graph travels in the page, with no extra request, no descriptor and no stored copy. A component asks for it by id and queries it.

**Why this priority**: per-page graphs are as central to the project as the shared one, and this path needs no declaration module at all.

**Independent Test**: build a page that holds an inline graph, load it, and query it; then build a page with an invalid inline graph and check the render fails.

**Acceptance Scenarios**:

1. **Given** a page with an inline graph, **When** the page loads and a component asks for that graph, **Then** the graph is loaded from the page's own content and the query result arrives.
2. **Given** an inline graph built from the page's own data, **When** pages for several entries are built, **Then** each page carries only its own graph and no declaration is needed.
3. **Given** an invalid inline document or `config`, **When** the page is rendered, **Then** the render fails and names the page and the path of the first problem.
4. **Given** two inline graphs with the same id in one render, **When** the page is rendered, **Then** it fails and names the page.
5. **Given** an inline graph whose id is also a registered graph, **When** the page is rendered, **Then** it fails and names the page and the id.
6. **Given** two pages rendered one after the other, each with an inline graph of the same id, **When** the pages are rendered, **Then** a duplicate is detected only within one render, never across renders.
7. **Given** an inline graph with a `config` that lists an index, **When** a component loads it, **Then** that index is created before the nodes and no other; **and** without a `config`, no index is created.
8. **Given** text in a document that contains `</script>`, `<!--` or `&`, **When** the page is rendered and loaded, **Then** the document read back in the browser equals the document written.
9. **Given** an inline graph, **When** a visitor loads the page again, **Then** the graph is replayed from the page, because an inline graph has no revision and no stored copy.
10. **Given** two pages that each carry an inline graph with the same id but different content, **When** the visitor navigates from one to the other by the router and back, **Then** the components of each page query that page's content, and the document holds one inline-graph element for the id at a time.
11. **Given** a page with two inline graphs of different ids, **When** components ask for both, **Then** each is an independent client and a fault in one does not affect the other.

---

### User Story 3 - A graph's lifetime follows the components that use it (Priority: P1)

A visit-lifetime graph is created once and survives every navigation. A page-lifetime graph is created when the first component that uses it appears and ends shortly after the last such component is removed, so that consecutive pages that use the same graph keep it. Nothing counts or creates a graph on the server.

**Why this priority**: without it, a router-based site leaks workers and data from page to page, loses a shared graph between pages, or shows one page another's data.

**Independent Test**: in the conformance site, navigate between pages by link, by script and by history, under both profiles and both outputs, and check for leftover clients, subscriptions and data.

**Acceptance Scenarios**:

1. **Given** two components on one page that ask for the same registered page-lifetime graph, **When** the page loads, **Then** they share one client.
2. **Given** a page with a page-lifetime graph, **When** the visitor navigates to a page that does not use it, **Then** the client is destroyed within one task after the last holder is removed.
3. **Given** two consecutive pages that use the same registered page-lifetime graph, **When** the visitor navigates from one to the other, **Then** the second page uses the client the first created, though the router removed the first page's holders before the second page's holders appeared.
4. **Given** a page-lifetime graph, **When** the visitor closes the tab, reloads, or follows a link that loads another document, **Then** the page's client does not outlive the document.
5. **Given** a registered page-lifetime graph with a descriptor, **When** page A is left and page B asks for a different registered page-lifetime graph, **Then** the first client is destroyed and the second opens its own stored copy without waiting on the first's store.
6. **Given** a visit-lifetime graph under `client-routing`, **When** the visitor navigates by link, by script and by history, **Then** the same client, worker and generation persist.
7. **Given** subscriptions a component creates, **When** the component is removed, **Then** they are dropped, and created again on the next arrival.
8. **Given** server rendering or prerendering of pages that use graphs, **When** the pages are rendered, **Then** no client is created, no worker is started and no holder is counted on the server.
9. **Given** a component whose graph id changes, **When** the id changes, **Then** the component releases the old graph and acquires the new one.

---

### User Story 4 - The profile, base path and engine location are supplied once (Priority: P2)

The site author places a provider in the root layout and passes the catalog, the engine's URL and, optionally, the navigation profile. The adapter builds every location from the base path and passes the profile to the core, with `client-routing` as the default.

**Why this priority**: the P1 slices work under either profile; the provider is what makes the base path and profile available without per-page code.

**Independent Test**: build the conformance site for each profile with and without a base path, and check which profile the core receives and where the descriptor is requested.

**Acceptance Scenarios**:

1. **Given** no navigation setting, **When** the site runs, **Then** the `client-routing` profile is used.
2. **Given** `multi-page`, **When** the site runs with `data-sveltekit-reload` on the body, **Then** the core receives that profile and the site works.
3. **Given** a base path, **When** the site runs, **Then** every descriptor location a component requests includes it, in the browser and in the server render.
4. **Given** a call that asks for a profile override, **When** it runs, **Then** the override decides the core's profile and changes nothing else.
5. **Given** a call that asks for a descriptor override, **When** it runs, **Then** that location is requested instead of the registered graph's and nothing else changes.
6. **Given** the engine location passed to the provider, **When** a client is made, **Then** that location is passed to the core unchanged.
7. **Given** a provider, **When** the root layout renders, **Then** it creates no client and starts no worker.

---

### User Story 5 - Visit-lifetime graphs outside a component (Priority: P2)

Code that lives across pages asks for a visit-lifetime graph directly. Asking for a page-lifetime graph or an inline graph this way is an error, because nothing would end the client.

**Why this priority**: the shared graph is the other half of the lifetimes, and its misuse must fail loudly.

**Independent Test**: call the direct lookup for a visit-lifetime graph, a page-lifetime graph and an inline graph, and check the three outcomes.

**Acceptance Scenarios**:

1. **Given** a visit-lifetime registered graph, **When** the direct lookup asks for it after the provider has mounted, **Then** it returns the client for the visit, and asking again returns the same client.
2. **Given** a page-lifetime registered graph or an inline graph, **When** the direct lookup asks for it, **Then** it fails with a message that names the graph and says to ask from a component.
3. **Given** an id that no registered or inline graph has, **When** it is asked for, **Then** it fails with a message that names the id and lists the registered ids.

---

### User Story 6 - The adapter is checked against the shared conformance scenarios (Priority: P2)

A conformance site (a SvelteKit app) exercises every way a graph is used: a shared registered graph, an inline page graph, a registered page-lifetime graph, a page with two graphs and a page for the direct lookup. It is built once per profile and once per output (static files, and a Node server), and the core's conformance runner drives it in Chromium, Firefox and WebKit. The adapter's own behaviors have their own tests.

**Why this priority**: the project's rule is that every adapter passes the same check, and the adapter's own behaviors need their own proof.

**Independent Test**: run the conformance command and the adapter tests; both must pass in all three browsers for both profiles and both outputs.

**Acceptance Scenarios**:

1. **Given** the conformance site built for `multi-page` and for `client-routing`, as static files and as a Node server, **When** the core's conformance scenarios run in Chromium, Firefox and WebKit, **Then** every scenario that applies passes in each.
2. **Given** the adapter's tests, **When** they run, **Then** they check: destruction of a page-lifetime client on departure, the store being usable by the next page, consecutive pages keeping a shared page graph, rejection of page-lifetime and inline ids by the direct lookup, each build failure and the determinism check, and that the revision in a data file's name equals the descriptor's.
3. **Given** a change that breaks any of the above, **When** the checks run, **Then** the failing check names the scenario and the browser.

---

### User Story 7 - A packed package installs and works in a clean project (Priority: P3)

The adapter, the core and the engine package are packed as they would be published, installed into a clean SvelteKit 3 project outside the repository, and a page is built and run with each output.

**Why this priority**: a workspace link can hide missing files and wrong dependency declarations, and SPIKE-007 found that a symlinked core behaves differently from an installed one in development.

**Independent Test**: run the package test and check that the clean project builds with each output and a page queries a registered graph.

**Acceptance Scenarios**:

1. **Given** the packed adapter, core and engine, **When** they are installed into a clean SvelteKit 3 project, **Then** the install resolves, with the engine, the core, SvelteKit and Svelte as peer dependencies and no reference to the repository's layout.
2. **Given** that project with a registered graph and a page that queries it, **When** it is built with each output and a page is loaded in a browser, **Then** the query returns a result.
3. **Given** the engine's binary and the worker script, **When** the project is built, **Then** both are placed with no workaround in the project.
4. **Given** the packed adapter's Svelte source, **When** the site is built, **Then** the site's own build compiles it, including its rune module, with no site configuration for it.

---

### User Story 8 - Open items are checked and the decision is amended (Priority: P2)

The items ADR-007 left for implementation are tested, and the ADR is amended with the answers, as the earlier adapters' ADRs were.

**Why this priority**: two of them (the inline element's behavior on hydration and the compiled package's `$app/paths` import) could change the design if the answer is unfavorable.

**Independent Test**: read ADR-007 §6 after implementation; each listed item has a dated entry that states what was found.

**Acceptance Scenarios**:

1. **Given** the endpoint under the Node output, **When** it is built and requested, **Then** the answer is recorded.
2. **Given** a source that throws, **When** the site is built, **Then** the build fails and the answer is recorded.
3. **Given** the development server, **When** a source is edited, **Then** whether the descriptor's revision and the data file follow, and what a request for the old revision returns, is recorded.
4. **Given** a page rendered on demand, **When** a holder component hydrates, **Then** the answer is recorded.
5. **Given** the helpers' `$app/paths` import, **When** the packed adapter is compiled by a site's build, **Then** it either works and is recorded, or the ADR is amended with the working form.
6. **Given** an inline graph and `data-sveltekit-reload` on the body, **When** a page loads, **Then** the answer is recorded.
7. **Given** the inline element written on the server, **When** the page hydrates, **Then** whether the client leaves it alone is recorded, with the size effect of the document appearing twice in the page.
8. **Given** RFC-001 §7.5, **When** the feature is complete, **Then** the ADR states what is settled (static and Node output) and what stays open (edge and serverless).

---

### Edge Cases

- A component asks for a graph during server rendering; it receives nothing and renders its placeholder, and no instance is created on the server.
- A page is left while a query is in flight or while its graph is loading; results for a departed page are ignored and the client is destroyed after its last holder is removed.
- A source reads site content and the development server is running; whether the revision follows edits is answered by User Story 8.
- The route file is missing; the client's descriptor request fails and the core reports `failed`, and the page's own placeholder or failure message shows.
- A request carries a path whose base cannot be derived (no `/relate/` segment); the route answers not found.
- The module state of the adapter is touched only after mount, so concurrent server renders cannot share a client or a count.
- Two inline graphs with the same id appear on one page in different layouts; the render fails and names the page.
- An inline graph is large; it is delivered as asked, and its size cost (the document appears in the page twice) is measured, not capped, in this feature (see Assumptions).
- The core reports `loading`, `recovering` or `failed`; the adapter passes the status through, and the page's own placeholder or failure message shows.

## Requirements *(mandatory)*

### Functional Requirements

**Package and configuration**

- **FR-001**: The package MUST be a workspace package `@relate/sveltekit` with a main entry and a server entry, and MUST declare SvelteKit 3, Svelte 5, the core package and the engine package as peer dependencies with no other runtime dependency.
- **FR-002**: The main entry MUST be shipped as Svelte source (`.svelte` and `.svelte.ts` files) with `svelte` and `default` export conditions, so the site's build compiles it; the server entry MUST be plain TypeScript with no dependency on the browser, on a Svelte file or on any SvelteKit virtual module.
- **FR-003**: The package MUST NOT import the engine's binary, and MUST NOT require a Vite plugin or any change to the site's build configuration beyond the site's own route file, layout load and provider.

**Build time: registered graphs**

- **FR-004**: A registered graph MUST be declared with an id following ADR-003's id rule, a source function that returns an ADR-002 document or a promise of one, optional indexes, and a lifetime of `page` or `visit`, with `page` the default.
- **FR-005**: The server entry MUST provide a route builder that returns the two exports a prerendered route file needs, and that publishes for every registered graph a descriptor (ADR-003) and a data file whose name contains the document's revision, whose descriptor revision equals it, whose data location points at the data file and whose counts are the document's node and link counts.
- **FR-006**: The route MUST publish its files in a static output and in a Node output, MUST answer an unlisted id or file as not found, and in development MUST evaluate a source on each request and answer a revision that is not current as not found.
- **FR-007**: The revision MUST be the first 12 hexadecimal digits of the SHA-256 of the document's canonical form, MUST NOT depend on the order of object keys or items in the source, and MUST equal the revision the other adapters produce for the same document (it uses the core's build code, not a copy).
- **FR-008**: The route builder MUST validate each document with the core's validator and MUST fail the build with the graph's name and the path of the first problem.
- **FR-009**: At build time the route builder MUST evaluate every source twice, independently, and MUST fail the build, naming the graph, when the two canonical texts differ.
- **FR-010**: The descriptor's data location MUST include the site's base path, which the route builder derives from the request as everything in the request's path before `/relate/`; the builder MUST use no SvelteKit virtual module.
- **FR-011**: The server entry MUST provide a catalog of the registered graphs as plain data (ids, lifetimes, indexes, and no locations) that a server-only layout load can return to the provider.
- **FR-012**: The route builder MUST fail, naming the problem, for an id that breaks ADR-003's id rule and for duplicate ids.

**Rendering: inline graphs and the provider**

- **FR-013**: The main entry MUST provide a component that takes an id, an ADR-002 document, an optional `config` holding a list of indexes and a page name for messages, validates the document with the core's inline check, and writes it into the page as a `<script type="application/json" data-relate-graph="<id>">` element with the document escaped, with no descriptor, no revision, no stored copy and no extra request.
- **FR-014**: That component MUST fail the render, naming the page, for an invalid document or `config`, for an id used twice in one render, and for an id that is also registered. The record of ids used in a render MUST be made per render and MUST NOT be module state.
- **FR-015**: A page MUST be able to carry several inline graphs with different ids, and the document MUST be able to be built from the page's own data.
- **FR-016**: The main entry MUST provide a provider component that receives the catalog, the engine's location and the navigation profile (`client-routing` by default, or `multi-page`), makes them available to the helpers through context, and creates no client and starts no worker.

**Client helpers**

- **FR-017**: The main entry MUST provide a helper that returns a reactive object whose `client` is the core's client, and `null` on the server and until the component has mounted, and a helper that subscribes to a query and returns reactive `status` (`idle` until mounted, then the core's status), `rows`, `error` and `generation`. On the server and in the first browser render both MUST return the same empty values.
- **FR-018**: A graph id MUST be looked up first among the current document's inline graphs and then among the catalog, and an unknown id MUST fail with a message that names it and lists the registered ids.
- **FR-019**: A visit-lifetime graph MUST be created once per id, held in module state, and MUST NOT be destroyed by navigation.
- **FR-020**: A registered page-lifetime graph MUST be created by its first holder, shared by every holder, use the stored copy whenever it has a descriptor, and be destroyed one task after the last holder is removed, so that a graph used by two consecutive pages is kept although the router removes the old page's holders before the new page's holders appear.
- **FR-021**: An inline graph MUST be keyed by its id and by the page element it was read from, so that a later page's graph with the same id is a new client, and the earlier client MUST be destroyed by the same rule as FR-020. When the document holds several elements for one id, the lookup MUST use the only one, else the first whose parent element is visible.
- **FR-022**: A holder MUST acquire its graph in an `$effect` (which runs only in the browser, after mount), release it in that effect's cleanup, and acquire again when the id it reads changes, and MUST NOT acquire, count or create anything on the server. The adapter's module state MUST be touched only after mount.
- **FR-023**: The main entry MUST provide a direct lookup that accepts only visit-lifetime registered graphs and MUST fail, with a message that names the graph, for an inline graph or a page-lifetime graph, and fail, naming the registered ids, for an unknown id.
- **FR-024**: Descriptor locations MUST be built with `resolve()` from SvelteKit's paths module so they include the base path in the browser and in the server render.
- **FR-025**: The helpers and the direct lookup MUST accept options that override the profile and the descriptor location, documented as testing aids; each override MUST change only the profile, or the descriptor location, passed to the core.
- **FR-026**: No client MUST start before a component asks for one, a component's first render MUST NOT depend on a client, and a page that uses no helper MUST pay nothing for the adapter.
- **FR-027**: The adapter MUST NOT decide fault handling, status, recovery or data loading; it MUST pass the core's client, status and events through unaltered.

**Checks and packaging**

- **FR-028**: The repository MUST contain an unpublished conformance site (a SvelteKit app) built once per profile and once per output (static files and a Node server) that exercises a shared registered graph, an inline page graph, a registered page-lifetime graph, a page with two graphs and a page for the direct lookup, and reproduces the markup the core's conformance runner reads. For `multi-page` every navigation MUST load a document (`data-sveltekit-reload` on the body).
- **FR-029**: The core's conformance runner MUST pass against each build, for both profiles and both outputs, in Chromium, Firefox and WebKit, with the runner's parameters for data requests and the descriptor override used as the other adapters use them.
- **FR-030**: The adapter's own tests MUST cover destruction of a page-lifetime client on departure, the store being usable by the next page, consecutive pages keeping a shared page graph, rejection by the direct lookup, each build failure in FR-008, FR-009 and FR-012, the render failures of FR-014, and that the revision in a data file's name equals the descriptor's.
- **FR-031**: A package test MUST pack the adapter, the core and the engine, install them into a clean SvelteKit 3 project outside the repository, build it with the static output and with the Node output, and run a page that queries a registered graph.
- **FR-032**: Implementation MUST test each open item in ADR-007 §4 and amend ADR-007 with a dated entry stating what was found.
- **FR-033**: The core and the other adapters MUST change in no way.
- **FR-034**: Every behavior stated here with MUST MUST have an automated test tagged with its requirement or scenario, and the repository's trace check MUST report any untagged requirement.

### Key Entities

- **Registered graph**: an id, a source, optional indexes and a lifetime, delivered as a revision-named data file and a descriptor.
- **Inline graph**: an id, a document and an optional `config` (a list of indexes) carried in one page, with no descriptor or revision.
- **Lifetime**: `page` (ends shortly after the last holder is removed) or `visit` (shared and retained across navigations).
- **Holder**: a component that uses a graph and has not been removed from the page.
- **Catalog**: plain data describing the registered graphs (ids, lifetimes, indexes), returned by a server-only layout load and passed to the provider.
- **Conformance site**: the unpublished SvelteKit app that every adapter check runs against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A site author can add a registered graph and a component that queries it, to a clean SvelteKit 3 site, by writing one declaration module, a route file of four lines, a layout load of three lines, one provider and the component's own code, with no endpoint, hashing or lifecycle code.
- **SC-002**: Building the conformance site twice from the same sources produces identical revisions, changing one node's property produces a different revision, and the other adapters produce the same revision for the same document, in every run of the test.
- **SC-003**: After navigating among all conformance pages under `client-routing`, no page-lifetime client, subscription or scoped data from a departed page remains, and no page shows another page's inline graph, in every run in all three browsers.
- **SC-004**: Under `client-routing`, a visit-lifetime graph keeps the same worker and generation across every navigation in the conformance site, and two consecutive pages that use one page-lifetime graph keep one client, in all three browsers.
- **SC-005**: The core's conformance scenarios pass for both profiles, as static files and as a Node server, in all three browsers, and the adapter's own tests pass, on every release candidate.
- **SC-006**: Every invalid-input case in this specification (invalid document, duplicate or malformed id, id both registered and inline, source that is not deterministic) fails the build or render with a message that names the page or graph and the first problem.
- **SC-007**: A clean project outside the repository installs the packed adapter, core and engine, builds with each output, and a loaded page returns a query result.
- **SC-008**: Every conformance page renders its placeholder in the server's markup with no hydration warning in the browser, its text and links work, and its placeholder shows, while the instance is loading, recovering or failed.
- **SC-009**: The other adapters' tests pass unchanged, and ADR-007 §6 has a dated entry for every item in §4 that implementation checked.

## Assumptions

- **Environment**: SvelteKit 3, Svelte 5, Vite 8, the static and Node adapters, prerendered routes, and the same desktop Chromium, Firefox and WebKit browsers as the core's tests. SvelteKit 2, Svelte 4, hash routing, other adapters, edge and serverless runtimes and mobile browsers are not covered and are labeled unmeasured.
- **Governing decisions**: ADR-007 (this adapter), ADR-001 to ADR-006 and the project constitution. Where this specification differs from an ADR, the ADR wins until it is amended.
- **Core**: the adapter uses the core's public interface and build subpath as they are; no core change is part of this feature (FR-033).
- **Evidence**: SPIKE-007 found, in single runs, that the worker and binary are placed with no configuration, that a module-state client survives the router, that a prerendered route publishes the two files, that `onMount` and `$effect` are browser-only while `onDestroy` is not, and that a package of Svelte source compiles in a site's build, a rune module in TypeScript included. This feature depends on those findings and re-checks them through the package test.
- **Not measured**: the cost of evaluating every source twice at build time; the size above which an inline graph should be registered instead; the extra copies of the binary in a build's output (two or three, 6.25 MB each); serverless size limits; the edge runtime. The conformance site records load figures a later decision can use.
- **Graph contents**: the adapter does not decide what a graph contains. The conformance site uses small hand-written graphs, and RFC-003 and RFC-002's decisions will govern real ones.
- **Workspace sites**: a site that installs the core by a workspace link needs the development server's file-serving allow list to include the repository root; an installed package does not (SPIKE-007).
- **Out of scope**: SvelteKit 2 and Svelte 4, edge and serverless adapters, hash routing, running the engine on the server, a default content extractor or site-graph schema (RFC-003), the navigation element (RFC-004), dashboards that fetch their data at load, main-thread instances, and changes to the core.
- **Names**: the package is `@relate/sveltekit`, in the `@relate` namespace beside `@relate/web`, `@relate/astro`, `@relate/nextjs` and `@relate/observable`. The engine package is `@relate/relate-wasm`.
