# Feature Specification: Next.js Adapter for Embedding the Graph Database in Next.js Sites

**Feature Branch**: `003-next-adapter`

**Created**: 2026-11-05

**Status**: Implemented (ADR-005)

**Input**: User description: "The relate-web Next.js adapter (`@relate/web-next`): a workspace package in `packages/next` that implements accepted ADR-005 (and builds on ADR-001 to ADR-004 and the SPIKE-006 findings) so a Next.js 16 app-router site can embed the browser graph database through the shared core package. It supplies registered graphs from a route handler, inline page graphs from a server component, React bindings whose lifetimes follow components, a shared build-time code subpath in the core, a conformance site, and a package test."

## Overview

The shared core package (`@relate/web-core`, specification `specs/001-core-package/spec.md`) runs the embedded graph database in a page and knows nothing about any framework. The Astro adapter (`specs/002-astro-adapter/spec.md`) showed what an adapter supplies: graph data and descriptors at build time, a way for a page to ask for a graph, and lifetimes that follow the page. Next.js needs the same things in a different shape, because it has no route injection and no virtual modules, it renders components on the server and again in the browser, and its router keeps layouts mounted while pages change.

Three kinds of people depend on it:

- **Site authors** build a Next site (app router) and want a graph in it with little code: one for every page, for a few, or for one.
- **Adapter authors** of later frameworks read this adapter and the Astro adapter together to see what is framework-specific and what the core should hold.
- **Visitors** read the pages and never see the adapter, but they feel a graph that reloads on every click, shows the previous page's data, or breaks a link.

The adapter implements ADR-005 and builds on ADR-001 (hosting and navigation profiles), ADR-002 (graph data format), ADR-003 (graph descriptor) and ADR-004 (the Astro adapter). Terms used below: a *registered graph* is declared in one module and delivered as files; an *inline graph* is a small document written into a page; a *holder* is a component that is using a graph and has not been removed from the page; the *profile* is the core's choice between keeping one client for the whole visit (`client-routing`) or one per page (`multi-page`).

## Clarifications

### Session 2026-11-05

- Q: What does this feature change in code that other packages own? → A: Only the revision, canonical text, document preparation and descriptor construction code, which moves from the Astro adapter into the core as a build subpath that the Astro adapter then imports; the Astro adapter's behavior is unchanged (ADR-005 §2.2; ADR-004 §6).
- Q: Which open questions does implementation settle, and where are the answers recorded? → A: The ones in ADR-005 §6; each answer is recorded as a dated amendment to ADR-005.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A site registers a graph and a component queries it (Priority: P1)

A site author declares a graph and its source in one module and adds a three-line route file. At build time the adapter validates the graph and publishes it with a descriptor. A component asks for the graph, subscribes to a query, and shows results when the graph is ready. The page renders on the server and in the browser without the instance, and shows a placeholder until the result arrives.

**Why this priority**: it is the smallest slice that proves the adapter's whole build-to-browser path, and every later behavior depends on it.

**Independent Test**: build the conformance site, open a page whose component asks for a registered graph, and check the server-rendered placeholder, the absence of a hydration warning, then the result.

**Acceptance Scenarios**:

1. **Given** a registered graph whose source returns a valid document, **When** the site is built, **Then** a data file named by the document's revision and a descriptor naming that revision and the document's node and link counts are published, and the descriptor's data location points at the data file.
2. **Given** a component that asks for the registered graph and subscribes to a query, **When** the page is rendered on the server and then in the browser, **Then** both renders produce the same markup, no hydration warning is reported, and the result appears when the graph is ready.
3. **Given** a source that returns an invalid document, **When** the site is built, **Then** the build fails and names the path of the first problem.
4. **Given** the same source content in two builds, **When** both are built, **Then** both produce the same revision, whatever the order of keys or array items in the source.
5. **Given** a source that returns different content on each call, **When** the site is built, **Then** the build fails with a message that names the graph and says its source is not deterministic.
6. **Given** a site with a non-root base path, **When** it is built as a static export and when it is built for the Node server, **Then** the descriptor and data locations used by the page include the base path and the graph loads.
7. **Given** a graph with an index named in its declaration, **When** a component loads it, **Then** that index is created and no other.
8. **Given** a request for a graph name that is not declared, **When** it is made to the route, **Then** it is answered as not found, in the Node server and in development.
9. **Given** the engine's binary and the core's worker script, **When** the site is built with either bundler, **Then** both are placed and found with no configuration or copying by the site.

---

### User Story 2 - A page carries its own small graph (Priority: P1)

An author writes a small graph beside a page's prose, or builds it from the page's own content, using a server component. The graph travels in the page, with no extra request, no descriptor, and no stored copy. A component asks for it by name and queries it.

**Why this priority**: per-page graphs are as central to the project as the shared one, and this path needs no declaration module at all.

**Independent Test**: build a page that holds an inline graph, load it, and query it; then build a page with an invalid inline graph and check the render fails.

**Acceptance Scenarios**:

1. **Given** a page with an inline graph, **When** the page loads and a component asks for that graph, **Then** the graph is loaded from the page's own content and the query result arrives.
2. **Given** an inline graph built from a content entry in the page's own source, **When** pages for several entries are built, **Then** each page carries only its own graph and no declaration is needed.
3. **Given** an invalid inline document, **When** the page is rendered, **Then** the render fails, names the page and the path of the first problem.
4. **Given** two inline graphs with the same name in one render, **When** the page is rendered, **Then** it fails and names the page.
5. **Given** an inline graph whose name is also a registered graph, **When** the page is rendered, **Then** it fails and names the page and the name.
6. **Given** an inline graph, **When** a visitor loads the page again, **Then** the graph is replayed from the page, because an inline graph has no revision and no stored copy.
7. **Given** an inline graph with a `config` that lists an index, **When** a component loads it, **Then** that index is created before the nodes and no other index is created; **and** without a `config`, no index is created.
8. **Given** a page with two inline graphs of different names, **When** components ask for both, **Then** each is an independent client and a fault in one does not affect the other.
9. **Given** two pages that each carry an inline graph with the same name but different content, **When** the visitor navigates from one to the other by the router, **Then** the second page's components query the second page's content and never the first's.

---

### User Story 3 - A graph's lifetime follows the components that use it (Priority: P1)

A page-lifetime graph is created when the first component that uses it appears and ends shortly after the last such component is removed. A visit-lifetime graph is created once and survives every navigation. React's development-time double mounting does not create or destroy a graph more than needed.

**Why this priority**: without it, a router-based site leaks workers and data from page to page or shows one page another's data, which is the failure the core's profiles exist to prevent.

**Independent Test**: in the conformance site, navigate between pages by link, by history and by script, with strict mode on and off, and check for leftover clients, subscriptions and data.

**Acceptance Scenarios**:

1. **Given** two components on one page that ask for the same registered page-lifetime graph, **When** the page loads, **Then** they share one client.
2. **Given** a page with a page-lifetime graph, **When** the visitor navigates to a page that does not use it, **Then** the client is destroyed within one task after the last holder is removed.
3. **Given** a page with a page-lifetime graph, **When** the visitor closes the tab, reloads, or follows a link to another document, **Then** the page's client does not outlive the document.
4. **Given** strict mode in development, **When** a component that holds a page-lifetime graph mounts, **Then** exactly one client is created and none is destroyed while the component remains mounted.
5. **Given** a registered page-lifetime graph with a descriptor, **When** page A is left and page B asks for the same graph, **Then** page B restores from the stored copy when the revision matches, without waiting on a second client for the same store.
6. **Given** a registered page-lifetime graph and a different registered page-lifetime graph used by the next page, **When** the visitor navigates, **Then** the first client is destroyed and the second opens its own store.
7. **Given** a visit-lifetime graph under `client-routing`, **When** the visitor navigates between pages by link, history and script, **Then** the same client, worker and generation persist.
8. **Given** subscriptions and page-scoped data a component creates, **When** the component is removed, **Then** they are dropped, and created again on the next arrival.
9. **Given** a page whose earlier page the router keeps mounted but hidden (if the router does so), **When** a component asks for an inline graph, **Then** it receives the visible page's graph, not the hidden page's.

---

### User Story 4 - The profile, base path and engine location are supplied once (Priority: P2)

The site author wraps the Next configuration once and places a provider in the root layout. The adapter passes the navigation profile and the base path to the client code, with `client-routing` as the default.

**Why this priority**: the P1 slices work under either profile; the wrapper is what makes the base path and profile available without per-page code.

**Independent Test**: build the conformance site for each profile with and without a base path, and check which profile the core receives and where the descriptor is requested.

**Acceptance Scenarios**:

1. **Given** no navigation setting, **When** the site runs, **Then** the `client-routing` profile is used.
2. **Given** `multi-page`, **When** the site runs, **Then** the core receives that profile and the site works.
3. **Given** a base path, **When** the site runs, **Then** the descriptor location a component requests includes it.
4. **Given** a call that asks for a profile override, **When** it runs, **Then** the override decides the core's profile and changes nothing else.
5. **Given** a call that asks for a descriptor override, **When** it runs, **Then** that location is requested instead of the registered graph's and nothing else changes.
6. **Given** the engine location passed to the provider, **When** a client is made, **Then** that location is passed to the core unchanged.

---

### User Story 5 - Visit-lifetime graphs outside a component (Priority: P2)

Code that lives across pages asks for a visit-lifetime graph directly. Asking for a page-lifetime graph or an inline graph this way is an error, because nothing would end the client.

**Why this priority**: the shared graph is the other half of the lifetimes, and its misuse must fail loudly. It follows the P1 slices.

**Independent Test**: call the direct lookup for a visit-lifetime graph, a page-lifetime graph and an inline graph, and check the three outcomes.

**Acceptance Scenarios**:

1. **Given** a visit-lifetime registered graph, **When** the direct lookup asks for it after the provider has mounted, **Then** it returns the client for the visit, and asking again returns the same client.
2. **Given** a page-lifetime registered graph or an inline graph, **When** the direct lookup asks for it, **Then** it fails with a message that names the graph and says to ask from a component.
3. **Given** a graph name that no registered or inline graph has, **When** it is asked for, **Then** it fails with a message that names the graph and lists the registered names.

---

### User Story 6 - Both adapters produce the same revisions from shared code (Priority: P2)

The revision, canonical text, document preparation and descriptor construction code lives in the core as a build subpath that needs no browser, no Node-only module and no framework. The Astro adapter imports it from there and behaves exactly as before.

**Why this priority**: two copies of the code that decides whether a stored graph is reused would drift, and the Next adapter needs the code now.

**Independent Test**: run the Astro adapter's existing tests, which pin revisions, and the core's new tests for the subpath.

**Acceptance Scenarios**:

1. **Given** the core's build subpath, **When** it is imported in a browser bundle, a Node process and a framework's server code, **Then** it loads without error and pulls in no other package.
2. **Given** a document, **When** the Astro adapter and the Next adapter each build its descriptor, **Then** both produce the same revision and the same descriptor fields.
3. **Given** the Astro adapter after the move, **When** its unit, build, browser, conformance and package tests run, **Then** they pass unchanged.

---

### User Story 7 - The adapter is checked against the shared conformance scenarios (Priority: P2)

A conformance site (a Next app) exercises every way a graph is used: a shared registered graph, an inline page graph, a registered page-lifetime graph, and a page with two graphs. It is built once per profile, served by the production server, and also exported and served as static files, and the core's conformance runner drives it in Chromium, Firefox and WebKit.

**Why this priority**: the project's rule is that every adapter passes the same check, and the adapter's own behaviors need their own proof. It follows the P1 slices it tests.

**Independent Test**: run the conformance command and the adapter tests; both must pass in all three browsers for both profiles and both output modes.

**Acceptance Scenarios**:

1. **Given** the conformance site built for `multi-page` and for `client-routing`, in production-server and static-export form, **When** the core's conformance scenarios run in Chromium, Firefox and WebKit, **Then** every scenario passes in each.
2. **Given** the adapter's tests, **When** they run, **Then** they check: destruction of a page-lifetime client on departure including strict mode, the store being usable by the next page, rejection of page-lifetime and inline names by the direct lookup, each build failure and the determinism check.
3. **Given** a change that breaks any of the above, **When** the checks run, **Then** the failing check names the scenario and the browser.

---

### User Story 8 - A published package installs and works in a clean project (Priority: P3)

The adapter, the core and the engine package are packed as they would be published, installed into a clean Next project outside the repository, and a page is built and run under both of Next's bundlers.

**Why this priority**: a workspace link can hide missing files and wrong dependency declarations, and an earlier spike hit exactly that with a linked package.

**Independent Test**: run the package test and check that the clean project builds and a page queries a registered graph, under each bundler.

**Acceptance Scenarios**:

1. **Given** the packed adapter, core and engine, **When** they are installed into a clean Next 16 project, **Then** the install resolves, with the engine as a peer dependency and no reference to the repository's layout.
2. **Given** that project with a registered graph and a page that queries it, **When** it is built with each bundler and a page is loaded in a browser, **Then** the query returns a result.
3. **Given** the engine's binary and the worker script, **When** the project is built, **Then** both are placed and referenced by the bundler with no workaround in the project.

---

### User Story 9 - Open questions are checked and the decision is amended (Priority: P2)

The questions ADR-005 left for implementation are tested early, and the ADR is amended with the answers, as ADR-004 was.

**Why this priority**: two of them (a hidden earlier page kept mounted, and the route export form) could change the design if the answer is unfavorable.

**Independent Test**: read ADR-005 §6 after implementation; each listed question has a dated entry that states what was found.

**Acceptance Scenarios**:

1. **Given** the question whether the router keeps an earlier page mounted but hidden, **When** it is tested in a production build, **Then** the answer is recorded, and if it does, the lifetime rules still pass User Story 3 or the ADR is amended with the change.
2. **Given** the question whether a development-server edit to a source changes the published revision-named file, **When** it is tested, **Then** the answer is recorded and any limit is documented.
3. **Given** the destructured route export and the catalog passed as props, **When** each is tried under both bundlers, **Then** each either works and is recorded, or the ADR is amended with the working form.
4. **Given** RFC-001 §7.5, **When** the feature is complete, **Then** the ADR states what is settled (static export and Node) and what stays open (edge and serverless).

---

### Edge Cases

- A component asks for a graph on the server render; it receives nothing and renders its placeholder, and no instance is created on the server.
- A page is left while a query is in flight or while its graph is loading; results for a departed page are ignored and the client is destroyed after its last holder is removed.
- A source reads site content and the development server is running; the question whether the revision follows edits is answered by User Story 9.
- Two registered graphs share a name, or a name that does not satisfy ADR-003's id rule; the declaration fails when the route is built.
- A site's route handlers include one that cannot be statically generated and the site exports; Next refuses the export and the adapter adds no such route.
- The route file is missing; the client's descriptor request fails and the core reports `failed`, and the page's own placeholder or failure message shows.
- The route's static parameters are generated in one build process and the file served in another; the revision check turns any difference into a build failure.
- A page that is statically generated and a page rendered on request both carry an inline graph; both render the same markup on the server and in the browser.
- An inline graph is large; it is delivered as asked, and its size cost is measured, not capped, in this feature (see Assumptions).
- The core reports `loading`, `recovering` or `failed`; the adapter passes the status through, and the page's own placeholder or failure message shows.

## Requirements *(mandatory)*

### Functional Requirements

**Package and configuration**

- **FR-001**: The package MUST be a workspace package `@relate/web-next` with a default entry, a server entry and a client entry, and MUST declare Next 16, React 19, the core package and the engine package as peer dependencies with no other runtime dependency.
- **FR-002**: The default entry MUST provide a wrapper for the Next configuration that makes the base path and the navigation profile available to client code and changes no other configuration. The profile MUST be `client-routing` or `multi-page`, with `client-routing` the default.
- **FR-003**: The server entry MUST NOT depend on the browser, and the package MUST NOT import the engine's binary, so server code that imports it needs no binary.

**Build time: registered graphs**

- **FR-004**: A registered graph MUST be declared with a name following ADR-003's id rule, a source function that returns an ADR-002 document or a promise of one, optional indexes, and a lifetime of `page` or `visit`, with `page` the default.
- **FR-005**: The server entry MUST provide a route builder, used from a route file the site writes, that publishes for every registered graph a descriptor (ADR-003) and a data file whose name contains the document's revision, whose descriptor revision equals it, whose data location points at the data file and whose counts are the document's node and link counts.
- **FR-006**: The route MUST be generated statically, for a static export and for the production server, and MUST answer a request for an undeclared name or file as not found.
- **FR-007**: The revision MUST be the first 12 hexadecimal digits of the SHA-256 of the document's canonical form, MUST NOT depend on the order of object keys or on the order of the source's keys, and MUST equal the revision the Astro adapter produces for the same document.
- **FR-008**: The route builder MUST validate each document with the core's validator and MUST fail the build with the path of the first problem.
- **FR-009**: When a data file is generated, its requested revision MUST equal the revision of the evaluation that produced it, and the build MUST fail, naming the graph, when they differ.
- **FR-010**: The published locations used by the client MUST include the site's base path, for a static export and for the production server.
- **FR-011**: The server entry MUST provide a catalog of the registered graphs as plain data (names, descriptor locations, lifetimes) that a server component can pass to a client component.
- **FR-012**: The declaration MUST fail when the route is built, naming the problem, for a name that breaks ADR-003's id rule and for duplicate names.

**Build time: inline graphs**

- **FR-013**: The server entry MUST provide a server component that takes a graph name, the page's path (for error messages), an ADR-002 document and an optional `config` value holding a list of indexes, validates the document, and writes it into the page so the client code can find it, with no descriptor, no revision, no stored copy and no extra request.
- **FR-014**: The component MUST fail the render, naming the page, for an invalid document or `config`, for a duplicate name in one render, and for a name that is also registered.
- **FR-015**: A page MUST be able to carry several inline graphs with different names, and the document MUST be able to be built from the page's own content.

**Client module**

- **FR-016**: The client entry MUST provide a provider that receives the catalog, the engine location and the profile, makes the catalog available to the hooks, creates no client and starts no worker.
- **FR-017**: The client entry MUST provide a hook that returns the core's client for a graph name, or nothing until the first effect has run, and a hook that subscribes to a query and returns its status, rows and error. On the server and on the first client render both MUST return the same empty values, so the first render's markup equals the server's.
- **FR-018**: A graph name MUST be looked up first among the current document's inline graphs and then among the catalog, and an unknown name MUST fail with a message that names it and lists the registered names.
- **FR-019**: A visit-lifetime graph MUST be created once per name and MUST NOT be destroyed by navigation.
- **FR-020**: A registered page-lifetime graph MUST be created by the first holder, shared by every holder, use the stored copy whenever it has a descriptor, and be destroyed one task after the last holder is removed, so that React's development remount neither destroys it nor creates a second one.
- **FR-021**: An inline graph MUST be keyed by its name and by the page element it was read from, so that a later page's graph with the same name is a new client, and the earlier client MUST be destroyed by the same rule as FR-020. When the document holds several elements for one name, the lookup MUST use the only one, else the first whose parent element is visible, so a hidden earlier page's graph is never chosen.
- **FR-022**: The client entry MUST provide a direct lookup that accepts only visit-lifetime registered graphs and MUST fail, with a message that names the graph, for an inline graph or a page-lifetime graph, and fail, naming the registered names, for an unknown name.
- **FR-023**: Both hooks and the direct lookup MUST accept options that override the profile and the descriptor location, documented as testing aids; each override MUST change only the profile, or the descriptor location, passed to the core.
- **FR-024**: No client MUST start before a component asks for one, a component's first render MUST NOT depend on a client, and a page that uses no hook MUST pay nothing for the adapter.
- **FR-025**: The adapter MUST NOT decide fault handling, status, recovery or data loading; it MUST pass the core's client, status and events through unaltered.

**Shared build code in the core**

- **FR-026**: The core MUST export a build subpath that provides the canonical text, revision, document preparation, descriptor construction, and the inline-document check and JSON escaping for a script element, with revision and preparation asynchronous (Web Crypto), needing no browser, no Node-only module, no framework and no other package.
- **FR-027**: The Astro adapter MUST import that code from the core, its behavior MUST be unchanged, and its tests MUST pass without change to their expectations.
- **FR-028**: The core MUST change in no other way.

**Checks and packaging**

- **FR-029**: The repository MUST contain an unpublished conformance site (a Next app), built once per profile as a production build and also exported, that exercises a shared registered graph, an inline page graph, a registered page-lifetime graph and a page with two graphs, and reproduces the markup the core's conformance runner reads.
- **FR-030**: The core's conformance runner MUST pass against the production-server build and the static export, for both profiles, in Chromium, Firefox and WebKit, with the runner's parameters for data requests and the descriptor override used as the Astro adapter uses them.
- **FR-031**: The adapter's own tests MUST cover destruction of a page-lifetime client on departure including under strict mode, the store being usable by the next page, rejection by the direct lookup, each build failure in FR-008, FR-012 and FR-014, and the determinism check of FR-009.
- **FR-032**: A package test MUST pack the adapter, the core and the engine, install them into a clean Next 16 project outside the repository, build it with Turbopack and with webpack, and run a page that queries a registered graph.
- **FR-033**: Implementation MUST test each open question in ADR-005 §6 and amend ADR-005 with a dated entry stating what was found.
- **FR-034**: Every behavior stated here with MUST MUST have an automated test tagged with its requirement or scenario, and the repository's trace check MUST report any untagged requirement.

### Key Entities

- **Registered graph**: a name, a source, optional indexes and a lifetime, delivered as a revision-named data file and a descriptor.
- **Inline graph**: a name, a document and an optional `config` (a list of indexes) carried in one page, with no descriptor or revision.
- **Lifetime**: `page` (ends shortly after the last holder is removed) or `visit` (shared and retained across navigations).
- **Holder**: a component that uses a graph and has not been removed from the page.
- **Catalog**: plain data describing the registered graphs, passed from server code to the provider.
- **Conformance site**: the unpublished Next app that every adapter check runs against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A site author can add a registered graph and a component that queries it, to a clean Next 16 site, by writing one declaration module, a route file of three lines, one provider and the component's own code, with no endpoint, hashing or lifecycle code.
- **SC-002**: Building the conformance site twice from the same sources produces identical revisions, changing one node's property produces a different revision, and the Astro adapter produces the same revision for the same document, in every run of the test.
- **SC-003**: After navigating among all conformance pages under `client-routing`, no page-lifetime client, subscription or scoped data from a departed page remains, and no page shows another page's inline graph, in every run in all three browsers.
- **SC-004**: Under `client-routing`, a visit-lifetime graph keeps the same worker and generation across every navigation in the conformance site, in all three browsers.
- **SC-005**: The core's conformance scenarios pass for both profiles, in production-server and static-export form, in all three browsers, and the adapter's own tests pass, on every release candidate.
- **SC-006**: Every invalid-input case in this specification (invalid document, duplicate name, name both registered and inline, malformed name, non-deterministic source) fails the build or render with a message that names the page or graph and the first problem.
- **SC-007**: A clean project outside the repository installs the packed adapter, core and engine, builds under each of Next's two bundlers, and a loaded page returns a query result.
- **SC-008**: Every conformance page renders the same markup on the server and in the browser with no hydration warning, and its text and links work, and its placeholder shows, while the instance is loading, recovering or failed.
- **SC-009**: The Astro adapter's tests pass unchanged after the shared code moves, and ADR-005 §6 has a dated entry for every question it lists.

## Assumptions

- **Environment**: Next 16, the app router, static export and the Node production server, with Turbopack and webpack, and the same desktop Chromium, Firefox and WebKit browsers as the core's tests. The pages router, other Next versions, edge and serverless runtimes and mobile browsers are not covered and are labeled unmeasured.
- **Governing decisions**: ADR-005 (this adapter), ADR-001 to ADR-004 and the project constitution (version 1.1.3). Where this specification differs from an ADR, the ADR wins until it is amended.
- **Core**: the adapter uses the core's public interface as it is. The one change to the core is the additive build subpath (FR-026); the Astro adapter is changed only to import from it.
- **Not measured**: the size above which an inline graph should be registered instead; serverless size limits; the edge runtime; the native Node package under Next. The conformance site records load figures that a later decision can use.
- **Graph contents**: the adapter does not decide what a graph contains. The conformance site uses small hand-written graphs, and RFC-003 and RFC-002's decisions will govern real ones.
- **Evidence**: SPIKE-006 found that the worker and binary are placed under both bundlers with no configuration, that a module-state client survives the router, and that a statically generated route handler publishes the two files. This feature depends on those findings and re-checks them through the package test.
- **Out of scope**: the pages router, Next versions other than 16, edge and serverless runtimes, running the engine on the server, a default content extractor or site-graph schema (RFC-003), the navigation element (RFC-004), dashboards that fetch their data at load, main-thread instances, and changes to the core other than the build subpath.
- **Names**: the package is `@relate/web-next`, in the `@relate` namespace (ADR-005 §6, 2026-11-05). The core (`@relate/web-core`) and the Astro adapter (`@relate/web-astro`) were renamed into the same namespace after this feature was implemented (they were `related-web-core` and `related-web-astro`). The engine's package name is its current one.
