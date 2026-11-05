# Feature Specification: Astro Adapter for Embedding the Graph Database in Astro Sites

**Feature Branch**: `002-astro-adapter`

**Created**: 2026-11-04

**Status**: Implemented (ADR-004)

**Input**: User description: "The related-web Astro adapter (`@relate/web-astro`, a working name): a workspace package in `packages/astro` that implements accepted ADR-004 (and builds on ADR-001, ADR-002, ADR-003) so an Astro 7 static site can embed the browser graph database through the shared core package. It provides an integration that serves registered graphs, a component that puts a small graph into a page, a client module tied to the page's arrival and departure, a warning when the navigation setting disagrees with the router, a conformance site run in three browsers with adapter tests, and a package test in a clean project. Out of scope: output other than static, Astro versions other than 7, components for UI frameworks, a default content extractor or site-graph schema (RFC-003), the navigation element (RFC-004), dashboards that fetch data at load, main-thread instances, and changes to the core." (Condensed; the full request is in the conversation that created this specification.)

## Overview

The shared core package (`@relate/web-core`, specification `specs/001-core-package/spec.md`) runs the embedded graph database in a page. It deliberately knows nothing about any site generator, so each generator needs a thin adapter that supplies the graph data at build time, chooses the navigation profile, and ties each page's graph work to that page's arrival and departure. This feature is that adapter for Astro, a site generator that builds pages from content at build time and optionally swaps pages in the browser with a client-side router.

Three kinds of people depend on it:

- **Site authors** build an Astro site and want a graph in it with little code: a graph for every page, for a few, or for one.
- **Adapter authors** of later frameworks read this adapter as the reference for what an adapter does and does not decide.
- **Visitors** read the pages and never see the adapter, but they feel a graph that reloads on every click, leaks data between pages, or breaks a link.

The adapter implements ADR-004 and builds on ADR-001 (hosting and navigation profiles), ADR-002 (graph data format) and ADR-003 (graph descriptor). Terms used below: a *registered graph* is declared in the integration's options and delivered as a file; an *inline graph* is written into one page by a component; a *page* graph lifetime means the graph's client lives and ends with the page that asks for it; a *visit* lifetime means the client is shared by every page and kept across navigations under client-side routing; a *descriptor* is the small document beside registered graph data that names the graph, its revision and its indexes (ADR-003); a *profile* is one of the core's two navigation behaviors, `client-routing` and `multi-page`.

## Clarifications

### Session 2026-11-04

- Q: Can an inline page graph name indexes to create? → A: Yes. The component takes an optional `config` value that holds a list of indexes, and later per-graph settings go in the same place.
- Q: Under `multi-page`, does repeated direct lookup of one visit-lifetime graph on a page return the same client? → A: Yes, one client per page and name, as for the page entry.
- Q: Which pages does a page's setup run on, given that Astro runs a bundled script once per document? → A: The setup runs on the first page and on later page loads where an optional selector matches (default: every page) (ADR-004 amendment).
- Q: What does the development server do when a registered source throws or returns an invalid document? → A: It keeps serving, prints the error with the path of the first problem, and answers that graph's requests with an error status until the source is fixed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A site registers a graph and a page queries it (Priority: P1)

A site author names a graph and its source in the Astro configuration. At build time the adapter validates it and publishes it with a descriptor. A page asks for the graph, registers a query, and shows results when the graph is ready. The page renders at once with a placeholder.

**Why this priority**: it is the smallest slice that proves the adapter's whole build-to-browser path, and every later behavior depends on it.

**Independent Test**: build the conformance site in either profile, open a page that asks for a registered graph, and check the placeholder, then the result.

**Acceptance Scenarios**:

1. **Given** a registered graph whose source returns a valid document, **When** the site is built, **Then** a data file named by the document's revision and a descriptor naming that revision and the document's node and link counts are published, and the descriptor points at the data file.
2. **Given** a registered graph whose source is a JSON file, **When** the site is built, **Then** it is published the same way as one from a source module.
3. **Given** a page that asks for the registered graph and registers a query, **When** the page loads, **Then** its first render completes without the instance, the placeholder shows, and the result appears when the graph is ready.
4. **Given** a source that returns an invalid document, **When** the site is built, **Then** the build fails and names the path of the first problem.
5. **Given** the same source content in two builds, **When** both are built, **Then** both produce the same revision, whatever the order of keys or array items in the source.
6. **Given** a site with a non-root base path, **When** it is built, **Then** the descriptor and data locations used by the page include the base path and the graph loads.
7. **Given** a graph with an index named in its configuration, **When** the page loads it, **Then** that index is created and no other.

---

### User Story 2 - A page carries its own small graph (Priority: P1)

An author writes a small graph beside a page's prose, or builds it from the page's own content, using a component. The graph travels in the page itself, with no extra request, no descriptor, and no stored copy. The page asks for it by name and queries it.

**Why this priority**: per-page graphs are as central to the project as the shared one, and this path needs no site configuration at all.

**Independent Test**: build a page that holds an inline graph, load it, and query it; then build a page with an invalid inline graph and check the build fails.

**Acceptance Scenarios**:

1. **Given** a page with an inline graph, **When** the page loads and asks for that graph, **Then** the graph is loaded from the page's own content and the query result arrives.
2. **Given** an inline graph built from a content entry in the page's own source, **When** pages for several entries are built, **Then** each page carries only its own graph and no entry is needed in the integration's configuration.
3. **Given** an invalid inline document, **When** the site is built, **Then** the build fails, names the page and the path of the first problem.
4. **Given** two inline graphs with the same name on one page, **When** the site is built, **Then** the build fails and names the page.
5. **Given** an inline graph whose name is also a registered graph, **When** the site is built, **Then** the build fails and names the page and the name.
6. **Given** an inline graph, **When** a visitor loads the page again, **Then** the graph is replayed from the page, because an inline graph has no revision and no stored copy.
7. **Given** an inline graph with a `config` that lists an index, **When** the page loads it, **Then** that index is created before the nodes and no other index is created; **and** without a `config`, no index is created.
8. **Given** a page with two inline graphs of different names, **When** the page loads and asks for both, **Then** each is an independent client and a fault in one does not affect the other.

---

### User Story 3 - A page's graph work follows its arrival and departure (Priority: P1)

A page's setup code runs when the page first loads and again each time the router brings the page in. Subscriptions and page-scoped data it creates are removed when the page is left, whether the visitor navigates by the router or leaves the document. A graph used by one page ends with that page.

**Why this priority**: without it, a router-based site leaks subscriptions, data and workers from page to page, which is the failure the core's profiles exist to prevent.

**Independent Test**: in the conformance site built for `client-routing`, navigate between pages by link, by history and by script, and check for leftover clients, subscriptions and data.

**Acceptance Scenarios**:

1. **Given** a page that registers setup code, **When** the page first loads, **Then** the setup runs once; **and When** the router brings in another page that also registers setup, **Then** that page's setup runs once, after the previous page's cleanup.
2. **Given** a page with a page-lifetime graph, **When** the visitor leaves the page by the router, **Then** that page's client is destroyed before the next page's setup runs.
3. **Given** a page with a page-lifetime graph, **When** the visitor closes the tab, reloads, or follows a link to another document, **Then** the page's client is destroyed on departure.
4. **Given** setup code that asks twice for the same graph name on one page, **When** it runs, **Then** both asks return the same client.
5. **Given** a registered page-lifetime graph with a descriptor, **When** page A is left and page B asks for the same graph, **Then** page B's client does not wait on page A's client for the stored copy and restores from the store when the revision matches.
6. **Given** a visit-lifetime graph under `client-routing`, **When** the visitor navigates between pages, **Then** the same client, worker and generation persist.
7. **Given** setup code that creates page-scoped data or subscriptions, **When** the page is left, **Then** they are dropped, and they are created again on the next arrival.
8. **Given** setup code registered with a selector by a script that only some pages include, **When** the visitor arrives at a page where the selector does not match, **Then** that setup does not run; **and** where it matches, it runs once.
9. **Given** a page with the router, **When** it first loads, **Then** its setup runs once, not again for the router's first page-load event; **and** without the router it still runs once.

---

### User Story 4 - The profile is chosen explicitly and checked (Priority: P2)

The site author states in the configuration whether the site uses client-side routing. The adapter passes that profile to the core. If the statement disagrees with the router's presence, the author is warned during development.

**Why this priority**: a wrong profile silently loses the retained graph or retains one that should not be. It follows the P1 slices because they work under either profile.

**Independent Test**: build a site configured for `client-routing` without the router and the reverse, run the development server, and check the warning; check the default.

**Acceptance Scenarios**:

1. **Given** no navigation setting, **When** the site runs, **Then** the `multi-page` profile is used and the site works with or without the router.
2. **Given** `client-routing` and a layout with the router, **When** the site runs, **Then** no warning appears and visit-lifetime graphs are retained across navigations.
3. **Given** `client-routing` and a layout without the router, **When** the development server runs, **Then** a warning names the disagreement.
4. **Given** `multi-page` and a layout with the router, **When** the development server runs, **Then** a warning names the disagreement and the site still works.
5. **Given** a call that asks for a profile override, **When** it runs, **Then** the override decides the core's profile and does not add or remove the router.
6. **Given** a production build, **When** it runs, **Then** no warning code runs.

---

### User Story 5 - Visit-lifetime graphs outside a page's setup (Priority: P2)

Code that lives across pages, such as a persistent element, asks for a visit-lifetime graph directly. Asking for a page-lifetime graph this way is an error, because nothing would end the client.

**Why this priority**: the shared graph is the other half of ADR-004's lifetimes, and its misuse must fail loudly. It follows the P1 slices.

**Independent Test**: call the direct lookup for a visit-lifetime graph, a page-lifetime graph and an inline graph, and check the three outcomes.

**Acceptance Scenarios**:

1. **Given** a visit-lifetime registered graph, **When** the direct lookup asks for it, **Then** it returns the core's client for the visit; **and** under `multi-page`, asking again on the same page returns that same client.
2. **Given** a page-lifetime registered graph or an inline graph, **When** the direct lookup asks for it, **Then** it fails with a message that names the graph and says to ask from page setup.
3. **Given** a graph name that no registered graph or inline graph has, **When** it is asked for, **Then** it fails with a message that names the graph and lists the registered names.

---

### User Story 6 - The adapter is checked against the shared conformance scenarios (Priority: P2)

A conformance site exercises every way a graph is used: a shared registered graph, an inline page graph, a registered page-lifetime graph, and a page with two graphs. It is built once per profile and run with the core's conformance runner in Chromium, Firefox and WebKit. The adapter's own tests cover the behaviors the core's scenarios do not. A failure blocks the adapter's release.

**Why this priority**: the project's rule is that every adapter passes the same check, and the adapter's own behaviors need their own proof. It follows the P1 slices it tests.

**Independent Test**: run the conformance command and the adapter tests; both must pass in all three browsers for both profiles.

**Acceptance Scenarios**:

1. **Given** the conformance site built for `multi-page` and for `client-routing`, **When** the core's conformance scenarios run in Chromium, Firefox and WebKit, **Then** every scenario passes in each.
2. **Given** the router's real view-transition path, **When** the conformance site navigates under `client-routing` in a browser that renders the page, **Then** the same client and generation persist for a visit-lifetime graph.
3. **Given** the adapter's tests, **When** they run, **Then** they check: destruction of a page-lifetime client on departure, the store being free for the next page, rejection of page-lifetime and inline names by the direct lookup, the build failure for an invalid document, the build failure for a duplicate name, and the build failure for a name that is both registered and inline.
4. **Given** a change that breaks any of the above, **When** the checks run, **Then** the failing check names the scenario and the browser.

---

### User Story 7 - A published package installs and works in a clean project (Priority: P3)

The adapter and the core are packed as they would be published, installed into a clean Astro project outside the repository, and a page is built and run.

**Why this priority**: a workspace link can hide missing files and wrong dependency declarations, and an earlier spike hit exactly that with a linked package. It follows the behavior it packages.

**Independent Test**: run the package test and check that the clean project builds and a page queries a registered graph.

**Acceptance Scenarios**:

1. **Given** the packed adapter and core, **When** they are installed into a clean Astro 7 project, **Then** the install resolves, using the engine as a peer dependency, with no reference to the repository's layout.
2. **Given** that project with a registered graph and a page that queries it, **When** it is built and a page is loaded in a browser, **Then** the query returns a result.
3. **Given** the engine's binary, **When** the project is built, **Then** the binary is placed and referenced by the bundler with no workaround in the project.

---

### Edge Cases

- A page asks for a graph before the router's first page-load event or after the page is already left; the ask and its results follow the page's lifetime, and results for a departed page are ignored.
- A registered source reads content collections and the build runs in the development server; the revision follows edits to the inputs.
- The development server serves a registered graph while its source throws or returns an invalid document; the server keeps running and prints the error, the graph's requests return an error status so the core reports `failed`, and fixing the source restores the graph on the next edit.
- Two registered graphs share the same name, or a name that does not satisfy ADR-003's id rule; the integration fails at configuration time.
- A registered graph is requested from a site with `output: "server"`; the integration reports that only static output is supported.
- Two pages ask for the same registered page-lifetime graph one after the other under `client-routing`; the second page's client opens the store only after the first is destroyed.
- The router is absent and the setup code's cleanup is never reached by a router event; the page-hide event destroys the clients.
- An inline graph is large; it is delivered as asked, and its size cost is measured, not capped, in this feature (see Assumptions).
- The core reports `loading`, `recovering` or `failed`; the adapter passes the status through, and the page's own placeholder or failure message shows.

## Requirements *(mandatory)*

### Functional Requirements

**Package and integration**

- **FR-001**: The package MUST be a workspace package `@relate/web-astro` that exposes an Astro integration, a component for inline graphs and a client module for pages and islands, and MUST declare Astro 7, the core package and the engine package as peer dependencies and no other runtime dependency.
- **FR-002**: The integration MUST accept a `graphs` option that maps a graph name (following ADR-003's id rule) to a source, optional indexes and a lifetime of `page` or `visit`, with `page` the default.
- **FR-003**: A source MUST be a module that returns an ADR-002 document, or a promise of one, or a JSON file that holds one. A module source MUST be able to read the site's content.
- **FR-004**: The integration MUST accept a `navigation` option of `multi-page` or `client-routing`, with `multi-page` the default, and MUST pass it to the core as the profile.
- **FR-005**: The integration MUST fail at configuration time, naming the problem, for a graph name that breaks ADR-003's id rule, for duplicate names, and for an output setting other than static.

**Build time: registered graphs**

- **FR-006**: For each registered graph the integration MUST publish a data file whose name contains the document's revision and a descriptor (ADR-003) whose revision equals it, whose data location points at the data file and whose counts are the document's node and link counts.
- **FR-007**: The revision MUST be the first 12 hexadecimal digits of the SHA-256 of the document's canonical form, and the canonical form MUST NOT depend on the order of object keys or on the order of the document's source as long as the content is equal.
- **FR-008**: The integration MUST evaluate each source once per build and use that one result for both the data file and the descriptor.
- **FR-009**: The integration MUST validate each document with the core's validator and MUST fail the build with the path of the first problem.
- **FR-010**: The published locations MUST include the site's configured base path.
- **FR-011**: In the development server, the integration MUST evaluate a source again when its inputs change, and the descriptor's revision MUST follow the new content. If a source throws or returns an invalid document, the server MUST keep running, print the error with the path of the first problem, and answer that graph's requests with an error status until the source is fixed.
- **FR-012**: The integration MUST give the client module the registered names, their descriptor locations, their lifetimes, their indexes, the profile and the engine binary's location, without the page author writing any of them.

**Build time: inline graphs**

- **FR-013**: The component MUST accept a graph name and an ADR-002 document, validate the document at build time, and write it into the page so the client module can find it, with no descriptor, no revision, no stored copy and no extra request. It MUST accept an optional `config` value holding a list of indexes, passed to the core as the caller's indexes, and MUST validate it at build time like the document; `config` is the one place for any later per-graph setting.
- **FR-014**: The component MUST fail the build, naming the page, for an invalid document or `config`, for a duplicate name on a page, and for a name that is also registered.
- **FR-015**: A page MUST be able to carry several inline graphs with different names, and the document MUST be able to be built from the page's own content in the page's source.

**Client module**

- **FR-016**: The client module MUST provide a page entry that runs the page's setup code once on the first page (when the DOM is ready, with or without the router, and not twice when the router fires its first page-load event) and on every later page the router brings in where an optional selector matches (default: every page), and runs the cleanup that setup returns before the router swaps the page and when the page is hidden.
- **FR-017**: The page entry MUST give the setup code a lookup that returns the core's client for a graph name, looking first at the current page's inline graphs and then at the registered ones.
- **FR-018**: For a page-lifetime graph the lookup MUST create a new core client for the page and destroy it when the page is left; for a registered one with a descriptor it MUST ask for the stored copy to be used, whatever the profile.
- **FR-019**: The departing page's clients MUST be destroyed before the next page's setup runs.
- **FR-020**: Asking twice for the same name on one page MUST return the same client.
- **FR-021**: For a visit-lifetime graph the lookup MUST return the core's client for the visit under `client-routing`, and one client for the page under `multi-page` (repeated lookups of a name on one page return that client), so the adapter starts at most one worker per graph name per page.
- **FR-022**: The client module MUST provide a direct lookup that accepts only visit-lifetime registered graphs and MUST fail, with a message that names the graph, for an inline graph or a page-lifetime graph, and fail, naming the registered names, for an unknown graph.
- **FR-023**: Both lookups MUST accept options that override the profile and the descriptor location, documented as testing aids; each override MUST change only the profile, or the descriptor location, passed to the core.
- **FR-024**: The client module MUST NOT start any client before a page asks for one, and the adapter MUST NOT make a page's first render depend on a client; a page that does not use the module MUST pay nothing for it.
- **FR-025**: The adapter MUST NOT decide fault handling, status, recovery or data loading; it MUST pass the core's client, status and events through unaltered.

**Profile check**

- **FR-026**: In the development server the client module MUST warn when the configured navigation setting disagrees with the presence of the router, and MUST NOT run any check in a production build.

**Checks and packaging**

- **FR-027**: The repository MUST contain an unpublished conformance site, built once per profile, with the router in the layout only for `client-routing`, that exercises a shared registered graph, an inline page graph, a registered page-lifetime graph, and a page with two graphs.
- **FR-028**: The core's conformance runner MUST pass against both builds in Chromium, Firefox and WebKit, with variant `a` served through the integration and variants `b`, `mismatch` and `broken` served from static files through the descriptor override, and a failure MUST block the adapter's release.
- **FR-029**: The adapter's own tests MUST cover destruction of a page-lifetime client on departure, the store being free for the next page, rejection by the direct lookup, each build failure in FR-005, FR-009 and FR-014, and the development server's handling of a failing source (FR-011).
- **FR-030**: A package test MUST pack the adapter and the core, install them into a clean Astro 7 project outside the repository, build it and run a page that queries a registered graph.
- **FR-031**: Every behavior stated here with MUST MUST have an automated test tagged with its requirement or scenario, and the repository's trace check MUST report any untagged requirement.

### Key Entities

- **Registered graph**: a name, a source, optional indexes and a lifetime, delivered as a revision-named data file and a descriptor.
- **Inline graph**: a name, a document and an optional `config` (a list of indexes) carried in one page, with no descriptor or revision.
- **Lifetime**: `page` (ends with the page that asks) or `visit` (shared and, under client-side routing, retained).
- **Page entry**: the client module's registration of a page's setup code and its cleanup.
- **Conformance site**: the unpublished Astro site that every adapter check runs against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A site author can add a registered graph and a page that queries it, to a clean Astro 7 site, by writing one configuration entry, one source and the page's own setup code, with no endpoint, hashing or lifecycle code.
- **SC-002**: Building the conformance site twice from the same sources produces identical revisions, and changing one node's property produces a different revision, in every run of the test.
- **SC-003**: After navigating among all conformance pages under `client-routing`, no page-lifetime client, subscription or scoped data from a departed page remains, in every run in all three browsers.
- **SC-004**: Under `client-routing`, a visit-lifetime graph keeps the same worker and generation across every navigation in the conformance site, including the router's view-transition path, in all three browsers.
- **SC-005**: The core's conformance scenarios pass for both profiles in all three browsers, and the adapter's own tests pass, on every release candidate.
- **SC-006**: Every invalid-input case in this specification (invalid document, duplicate name, name both registered and inline, unsupported output setting, malformed name) fails the build with a message that names the page or graph and the first problem.
- **SC-007**: A clean project outside the repository installs the packed adapter and core, builds, and a loaded page returns a query result.
- **SC-008**: The page's text and links work, and its placeholder shows, while the instance is loading, recovering or failed, on every conformance page.

## Assumptions

- **Environment**: Astro 7, static output, and the same desktop Chromium, Firefox and WebKit browsers as the core's tests. Other Astro versions, server output and mobile browsers are not covered and are labeled unmeasured.
- **Governing decisions**: ADR-004 (this adapter), ADR-001, ADR-002, ADR-003 and the project constitution (version 1.1.3). Where this specification differs from an ADR, the ADR wins until it is amended.
- **Core**: the adapter uses the core's public interface as it is. The one exception is additive, optional parameters of the core's conformance runner so a hashed, name-bound adapter can pass the same scenarios (ADR-004, consequences); the runner's default behavior does not change. Moving the page lifetime into the core is follow-up work named in ADR-004. If a need appears that the core cannot meet, the plan stops and proposes an RFC or ADR (constitution principle I).
- **Not measured**: the size above which an inline graph should be registered instead is not measured here; the conformance site records the load figures that a later decision can use. Dev-server behavior under file watching, and non-root base paths in production, are checked by the tests in this feature and are not otherwise verified.
- **Graph contents**: the adapter does not decide what a graph contains. The conformance site uses small hand-written graphs, and RFC-003 and RFC-002's decisions will govern real ones.
- **Out of scope**: output other than static, Astro versions other than 7, components for UI frameworks, a default content extractor or site-graph schema (RFC-003), the navigation element (RFC-004), dashboards that fetch their data at load, main-thread instances, and changes to the core other than the runner's additive parameters.
- **Names**: `@relate/web-astro` is a working name that follows `@relate/web-core`; the engine's package name is its current one.
