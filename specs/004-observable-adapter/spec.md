# Feature Specification: Observable Framework Adapter for Embedding the Graph Database

**Feature Branch**: `004-observable-adapter`

**Created**: 2026-11-08

**Status**: Draft (ADR-006)

**Input**: User description: "The Observable Framework adapter (`@relate/observable`): a workspace package in `packages/observable` that implements accepted ADR-006 (and builds on ADR-001 to ADR-005 and the SPIKE-001 findings) so an Observable Framework 1.x site can embed the browser graph database through the shared core package `@relate/web`. It supplies loaders that place the engine and the worker and publish graph data, a browser call that ties a client to a notebook cell, the result shaping and tagged template carried over from SPIKE-001, a conformance site, adapter tests, and a package test."

## Overview

The shared core package (`@relate/web`, specification `specs/001-core-package/spec.md`) runs the embedded graph database in a page and knows nothing about any framework. The Astro and Next adapters (`specs/002-astro-adapter/spec.md`, `specs/003-next-adapter/spec.md`) added build-time publishing of graphs, a way for a page to ask for one, and lifetimes that follow the page or its components. Observable Framework, a generator of static sites from markdown pages made of reactive notebook cells, needs the same things in a different shape: it has no plugin or route-injection interface, it places neither the engine's binary nor the core's worker script, every page load is a new document, and the unit of lifetime is a cell that re-runs when a value it reads changes.

Three kinds of people depend on it:

- **Site authors** build a Framework site and want to query a graph from cells, feeding the rows to Framework's charts, inputs and tables, with a few small files and no infrastructure code.
- **Adapter authors** of later frameworks read this adapter with the Astro and Next adapters to see what is framework-specific, and what the core or a shared results layer should hold.
- **Visitors** read the pages and never see the adapter, but they feel a page that waits on a graph that never loads, leaves a worker behind each time a control moves, or shows no result when a query fails.

The adapter implements ADR-006 and builds on ADR-001 (hosting and navigation profiles), ADR-002 (graph data format), ADR-003 (graph descriptor), ADR-004 and ADR-005 (the other adapters) and SPIKE-001. Terms used below: a *loader* is a script in a site's data folder whose output Framework publishes as a file under a content-hashed name; a *file attachment* is the value a cell obtains for such a file, from which it reads the file's published location or its contents; a *cell* is one block of notebook code; *invalidation* is the signal a cell receives when it is about to run again or its page is torn down; the *profile* is the core's choice between one client for the whole visit and one per page (here only the per-page profile applies, since every navigation loads a new document).

## Clarifications

### Session 2026-11-08

- Q: What does this feature change in code that other packages own? → A: Nothing in the core or in the other adapters (ADR-006 names no core change). The adapter's loaders use the core's existing build subpath, validator and worker entry.
- Q: Which open items does implementation settle, and where are the answers recorded? → A: The ones in ADR-006 §4 (loader cache after an engine upgrade, preview-server behavior when a source changes, headless browsers running cells, installing as a published package); each answer is recorded as a dated amendment to ADR-006.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A site places the engine and queries a graph held in a cell (Priority: P1)

A site author adds two small loaders, one for the engine's binary and one for the worker, and in a page writes one call that opens a graph from a document the cell holds. A second cell queries it and shows the rows in a table. The page's text and its other cells work while the graph loads.

**Why this priority**: it is the smallest slice that proves the adapter's whole path, from build to a result in a browser, and every later behavior depends on the engine and the worker being found.

**Independent Test**: build a page that opens a graph from an object held in a cell, load it in a browser, and check that a query returns the expected rows and that the engine and worker were requested from the site's own published files.

**Acceptance Scenarios**:

1. **Given** the two loaders and a page that opens a graph from a document held in a cell, **When** the site is built, **Then** the engine's binary and the worker script are published under content-hashed names and the page loads them from there, with no copying step in the site's scripts.
2. **Given** the same site in the preview server, **When** the page is loaded, **Then** the same call works with no build.
3. **Given** a page that opens the graph, **When** it loads, **Then** the call returns before the graph is ready, the page's other cells render, and `ready` resolves when the instance is ready.
4. **Given** a document that is not valid for the data format, **When** the cell opens it, **Then** the client reports `failed` with the core's diagnostic naming the first problem, and `ready` rejects with it.
5. **Given** a graph that never loads (an unreachable worker location), **When** the cell opens it, **Then** `ready` rejects after the core's three attempts and the page's other cells are unaffected.
6. **Given** an engine upgrade in the site's dependencies, **When** the site is built, **Then** the worker bundle and the binary come from the same installed version (the bundle is made at the site's build from the installed engine).

---

### User Story 2 - A site publishes a graph from a source and a page restores it by revision (Priority: P1)

A site author writes a graph source (a module returning a data document) and two loaders over it, one for the document and one for its descriptor. At build time the adapter validates the document and publishes both. A page opens the graph by passing the two file attachments, and a later visit to any page that opens the same graph restores a stored copy while the revision is unchanged.

**Why this priority**: shared and larger graphs need a cacheable file and a restore path, and this is the only way the adapter delivers them.

**Independent Test**: build the conformance site, open a page that opens a descriptor-and-data graph, check the descriptor and the published data file, and load a second page that opens the same graph to see the stored copy used.

**Acceptance Scenarios**:

1. **Given** a source that returns a valid document, **When** the site is built, **Then** the document is published in canonical text and the descriptor is published with a revision derived from that text, the document's node and link counts, and the declared indexes.
2. **Given** the same source content in two builds, **When** both are built, **Then** both produce the same revision, whatever the order of keys or items in the source, and the revision equals the one the other adapters produce for the same document.
3. **Given** a source that returns an invalid document, **When** the site is built, **Then** the build fails and names the path of the first problem.
4. **Given** a loader that throws, **When** the site is built, **Then** the build fails and the message names the loader's graph.
5. **Given** a source that returns different content on each evaluation, **When** the site is built twice and the page loads, **Then** the mismatch between descriptor and document is reported by the core as a `mismatch` at load, and the package's checks catch it before release.
6. **Given** the two attachments, **When** the cell opens the graph, **Then** the descriptor's data location is set to the data attachment's published location, whatever the content hash in its name, and the graph loads.
7. **Given** a graph with an index named in its declaration, **When** it loads, **Then** that index is created and no other.
8. **Given** a descriptor graph opened on one page and on the next page the visitor loads, **When** the second page opens it with an unchanged revision, **Then** it restores from the stored copy without fetching the data file.

---

### User Story 3 - A client's lifetime follows its cell (Priority: P1)

A client belongs to the cell that opened it. When the cell runs again, or the page is torn down, the client is destroyed. A page may open several independent graphs.

**Why this priority**: without it, every re-run of an opening cell, which a control the cell reads causes, leaves a worker and an instance behind.

**Independent Test**: open a graph in a cell that depends on an input, move the input several times, and count live workers; then close the page.

**Acceptance Scenarios**:

1. **Given** a cell that opened a client, **When** the cell runs again, **Then** the earlier client is destroyed and the new one starts.
2. **Given** an opened client, **When** the page is torn down by closing, reloading or following a link, **Then** the client does not outlive the document (its destruction runs on the page's hide event).
3. **Given** a cell that opens a client and does not read inputs, **When** an input that other cells read changes, **Then** the client, its worker and its generation persist and only the querying cells re-run.
4. **Given** two opens on one page with different graphs, **When** both are used, **Then** each is an independent client with its own worker and a fault in one does not affect the other.
5. **Given** a page that opens a graph and a link to another page that does not, **When** the visitor follows the link, **Then** nothing from the first page remains.
6. **Given** the engine's binary location and the worker location resolved for one page, **When** the page opens several graphs, **Then** each location is resolved once for the page.

---

### User Story 4 - Query results feed Framework's components (Priority: P1)

A cell writes a query as a tagged template with values interpolated. The result is an array of rows that charts, inputs, tables and the data-processing libraries accept directly, with the columns in the order written. A graph result can be turned into nodes and links for a force layout.

**Why this priority**: the project's reason for the Framework integration is showing the database beside its charts and inputs; the engine's raw result needs reshaping before they accept it.

**Independent Test**: run queries through the tagged template against the real engine in Node, and in a browser feed the rows to a chart, an input and a table in the conformance site.

**Acceptance Scenarios**:

1. **Given** a query returning columns in an order, **When** it runs, **Then** each row's keys are in that order, whatever order the engine's rows use.
2. **Given** values interpolated into the template, **When** the query runs, **Then** each value is passed as a bound parameter and none is spliced into the statement text; a hostile string matches nothing and changes no statement.
3. **Given** a result containing nodes, relationships or paths, **When** it is shown in a table, **Then** each entity cell reads as text (a node as its labels and a name or title, a relationship as its type) and its fields are reachable by name from an accessor.
4. **Given** a result, **When** a cell reads its columns, column types, statistics or elapsed time, **Then** they are attached to the row array, and the full normalized result with the engine's original tagged entities is available without being enumerated.
5. **Given** a statement the engine rejects, **When** it runs through the tagged template, **Then** the promise rejects with the engine's message; and through `query` the normalized result carries the error and an empty row array.
6. **Given** a result with no nodes or relationships, **When** it is turned into a graph, **Then** the graph is empty; **and** a relationship whose endpoint is not in the result is left out.
7. **Given** an empty result, **When** it is read, **Then** it is an empty array that still carries its columns.
8. **Given** the engine's current build, **When** the normalization runs on a scalar, an entity, a path, an empty result and an error, **Then** each matches the shapes the tests record from the engine (the spike's findings re-checked).

---

### User Story 5 - The adapter is checked against the shared conformance scenarios (Priority: P2)

A conformance site (a Framework project) exercises every way a graph is opened: a descriptor-and-data graph, a page's own document, a page with two graphs, and the pages the scenarios navigate between. It is built once, served as static files, and the core's conformance runner drives it under the per-page profile in Chromium, Firefox and WebKit. The adapter's own behaviors have their own tests.

**Why this priority**: the project's rule is that every adapter passes the same check; it follows the stories it tests.

**Independent Test**: run the conformance command and the adapter tests; both must pass in all three browsers.

**Acceptance Scenarios**:

1. **Given** the conformance site built once and served statically, **When** the core's conformance scenarios for the per-page profile run in Chromium, Firefox and WebKit, **Then** every scenario passes in each.
2. **Given** the adapter's tests, **When** they run, **Then** they check: the loaders' output against the core's build code (revision and canonical text), the build failure for an invalid document, destruction on invalidation and on the page's hide event, and the results layer against the real engine in Node.
3. **Given** the conformance site's package manifest, **When** it installs the adapter and the core, **Then** they are copies inside the project, because Framework's bundler fails on a symlink whose target is outside the project.
4. **Given** a change that breaks any of the above, **When** the checks run, **Then** the failing check names the scenario and the browser.

---

### User Story 6 - A packed package installs and works in a clean project (Priority: P2)

The adapter, the core and the engine package are packed as they would be published, installed into a clean Framework project outside the repository, and a page is built and run.

**Why this priority**: a workspace link hides missing files and wrong dependency declarations, and Framework's bundler has already failed on a symlinked package outside the project.

**Independent Test**: run the package test and check that the clean project builds and a loaded page returns a query result.

**Acceptance Scenarios**:

1. **Given** the packed adapter, core and engine, **When** they are installed into a clean Framework 1.x project, **Then** the install resolves, with the engine and the core as peer dependencies and no reference to the repository's layout.
2. **Given** that project with the loaders and a page that queries a graph, **When** it is built and the page is loaded in a browser, **Then** the query returns a result.
3. **Given** the built output, **When** it is inspected, **Then** the binary and the worker are published once each under hashed names, and the page requests no other location for them.

---

### User Story 7 - Open items are checked and the decision is amended (Priority: P2)

The items ADR-006 left for implementation are tested, and the ADR is amended with the answers, as ADR-004 and ADR-005 were.

**Why this priority**: two of them (the loader cache after an engine upgrade, and whether headless browsers run cells) could change the design or the checks if the answer is unfavorable.

**Independent Test**: read ADR-006 §6 after implementation; each listed item has a dated entry that states what was found.

**Acceptance Scenarios**:

1. **Given** the question whether Framework reruns a loader after the installed engine changes, **When** it is tested, **Then** the answer is recorded and, if it does not, the adapter's documentation says how to refresh or the ADR is amended with a working form.
2. **Given** the preview server, **When** a graph source is edited, **Then** whether the descriptor's revision and the document follow is recorded and any limit is documented.
3. **Given** headless Playwright browsers, **When** the conformance site's cells are run, **Then** whether they run is recorded, with a working form if they do not.
4. **Given** a published package rather than a workspace copy, **When** it is installed and built, **Then** the result is recorded (User Story 6) and the failure the spike saw with a symlink is shown not to recur.
5. **Given** RFC-001 §7.7 (bundler handling of the binary), **When** the feature is complete, **Then** the ADR states what is settled for this framework (loaders place the binary and the worker) and what stays open.

---

### Edge Cases

- A cell opens a graph whose source file is missing; the build fails when the loader runs, and the message names the file.
- A page imports the adapter and opens nothing; no worker starts and the page pays nothing for the engine beyond the module's own load.
- The engine's binary or the worker is not published (a site forgot a loader); `ready` rejects and the diagnostic names which location failed.
- Two graphs on one page share an id; each open is independent, and the stored copy of a descriptor graph is shared by id, so the second open waits on the store through the core's bounded retry.
- A descriptor graph's data attachment is opened on a page while the document is edited in the preview server; the revision mismatch is reported by the core and the page shows the failure.
- A query is in flight when a cell re-runs; the earlier client is destroyed and its result is ignored.
- The core reports `loading`, `recovering` or `failed`; the adapter passes the status through, and the page's own placeholder or message shows.
- A value interpolated into the tagged template is an array or object; it is passed as a bound parameter value as given.
- A result column holds a very large number of rows; the adapter passes them as the engine returns them and adds no cap.

## Requirements *(mandatory)*

### Functional Requirements

**Package**

- **FR-001**: The package MUST be a workspace package `@relate/observable` with a browser entry, a loader entry and a results entry, and MUST declare Observable Framework (version 1), the core package and the engine package as peer dependencies, with `esbuild` as its only runtime dependency.
- **FR-002**: The package MUST ship no user-interface component and MUST NOT import the engine's binary, so server and loader code that imports the loader entry needs no binary.

**Build time: engine and worker**

- **FR-003**: The loader entry MUST provide a helper that writes the bytes of the installed engine's binary to standard output, so a data loader that calls it publishes the binary under a content-hashed name.
- **FR-004**: The loader entry MUST provide a helper that bundles the core's worker entry and the installed engine's script glue into one self-contained ES module and writes it to standard output, made when the site builds from the engine installed in the site, so the glue and the binary always come from the same package version.
- **FR-005**: The published worker script MUST be served with a JavaScript content type, and neither helper MUST need a copying step in the site's scripts, in either the production build or the preview server.

**Build time: graphs**

- **FR-006**: The loader entry MUST provide a helper that takes a graph id (ADR-003's id rule) and a source (a module whose default export is a function returning an ADR-002 document or a promise of one), validates the document with the core's validator, and writes its canonical text to standard output.
- **FR-007**: The loader entry MUST provide a helper that takes a graph id, a source and optional indexes, and writes the ADR-003 descriptor with a revision of the first 12 hexadecimal digits of the SHA-256 of the canonical text, the document's node and link counts, the indexes, and a data location holding the data file's logical name.
- **FR-008**: The revision MUST NOT depend on the order of object keys or items in the source, and MUST equal the revision the other adapters produce for the same document (it uses the core's build code, not a copy).
- **FR-009**: An invalid document, an id that breaks ADR-003's id rule, or a source that throws MUST fail the build, naming the graph and the path of the first problem.
- **FR-010**: A document and a descriptor written from the same source in separate loader runs that disagree MUST be reported at load by the core's agreement check, and the adapter's tests MUST build twice and compare.

**Browser entry**

- **FR-011**: The browser entry MUST provide a call that takes the engine and worker file attachments, a graph input, and the cell's invalidation, and returns immediately an object with the core's client, a promise that resolves when the instance is ready and rejects when the client reaches `failed`, a tagged template, a query function and a function that turns a result into nodes and links.
- **FR-012**: The graph input MUST be either a descriptor attachment and a data attachment, or a document (a file attachment, or an object the cell holds) with optional indexes. The call MUST take attachments and not locations, and MUST resolve each attachment's published location once per page.
- **FR-013**: For a descriptor input, the call MUST read the descriptor and set its data location to the data attachment's published location before the core sees it, and the graph MUST be eligible for the stored copy the per-page profile allows. A document input has no revision and no stored copy.
- **FR-014**: The call MUST create the core's client with the per-page profile, the engine's published location and a worker constructed from the published worker location as a module, and MUST decide no fault handling, status, recovery or data loading of its own (the core's client, status and events pass through unaltered).
- **FR-015**: The client MUST be destroyed when the cell's invalidation resolves and on the page's hide event, and no worker MUST start before a cell opens a graph.
- **FR-016**: A page MUST be able to open any number of graphs, each an independent client with its own worker.
- **FR-017**: The package MUST NOT provide a navigation option, a visit-lifetime client or a main-thread instance.

**Results**

- **FR-018**: The results entry MUST provide `normalize`, which takes the engine's result envelope and returns columns, column types, rows keyed in column order that keep the engine's tagged entities, table rows in which entities are flattened (a node as its identity, labels and properties; a relationship as its identity, type, start, end and properties; a path as an array) with a non-enumerable text form, statistics, the error or none, and the elapsed time.
- **FR-019**: The results entry MUST provide `toGraph`, which collects every node and relationship in a normalized result into `{ nodes, links }` for a force layout, drops a relationship whose endpoint is not in the result, and returns an empty graph for a result with no entities.
- **FR-020**: The results entry MUST provide a tagged template over a query function: each interpolation becomes a bound parameter and is never spliced into the statement text; the call resolves to an array of flattened rows with the columns, column types, statistics and elapsed time attached and the normalized result on a non-enumerable property; and it rejects with the engine's message when the engine returns an error.
- **FR-021**: The query function returned by the browser call MUST go through the core client's `query`, so a statement has the core's timeout and recovery.

**Checks and packaging**

- **FR-022**: The repository MUST contain an unpublished conformance site (a Framework project) that reproduces the markup the core's conformance runner reads from cells, with pages for a descriptor-and-data graph, a page's own document, two graphs on one page and the pages the scenarios navigate between, built once and served as static files.
- **FR-023**: The core's conformance runner MUST pass against that site under the per-page profile in Chromium, Firefox and WebKit; the scenarios that need a retained instance belong to the other profile and MUST NOT be run.
- **FR-024**: The conformance site MUST install the adapter and the core as copies inside the project, not as symlinks to targets outside it.
- **FR-025**: The adapter's own tests MUST cover the loaders' output against the core's build code (revision, canonical text), the build failure for an invalid document and for a throwing source, destruction on invalidation and on the page's hide event, and the results layer, including the tagged template and parameter binding, against the real engine in Node.
- **FR-026**: A package test MUST pack the adapter, the core and the engine, install them into a clean Framework 1.x project outside the repository, build it and run a page that queries a graph.
- **FR-027**: Implementation MUST test each open item in ADR-006 §4 and amend ADR-006 with a dated entry stating what was found.
- **FR-028**: The core and the other adapters MUST change in no way.
- **FR-029**: Every behavior stated here with MUST MUST have an automated test tagged with its requirement or scenario, and the repository's trace check MUST report any untagged requirement.

### Key Entities

- **Loader**: a script in a site's data folder that calls one adapter helper; its output is published by Framework as a file.
- **Graph source**: a module returning an ADR-002 document, shared by the document loader and the descriptor loader of one graph.
- **Descriptor graph**: a descriptor attachment and a data attachment, delivered with a revision and eligible for a stored copy.
- **Document graph**: a document the cell holds or a data attachment alone, with no revision and no stored copy.
- **Opened graph**: the object a cell holds after opening: a core client, a readiness promise and the result tools.
- **Normalized result**: the engine's result envelope reshaped for Framework's components, with the original entities kept.
- **Conformance site**: the unpublished Framework project that every check of the adapter runs against.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A site author can add a graph and a cell that queries it, to a clean Framework 1.x site, by writing two loaders for the engine and the worker, one source module, one or two loaders for the graph and the cells' own code, with no copying step, bundler setting or lifecycle code.
- **SC-002**: Building the conformance site twice from the same sources produces identical revisions, changing one node's property produces a different revision, and the other adapters produce the same revision for the same document, in every run of the test.
- **SC-003**: After a cell that opened a graph runs again 20 times, exactly one worker for that graph is live, and after the page is torn down none is, in every run in all three browsers.
- **SC-004**: The core's conformance scenarios for the per-page profile pass in all three browsers, and the adapter's own tests pass, on every release candidate.
- **SC-005**: Every invalid-input case in this specification (invalid document, malformed id, throwing source, missing worker location) fails the build or the cell's readiness with a message that names the graph or location and the first problem.
- **SC-006**: A clean project outside the repository installs the packed adapter, core and engine, builds, and a loaded page returns a query result.
- **SC-007**: A query written with interpolated values returns rows that a chart, an input and a table in the conformance site display correctly, and a hostile interpolated string changes no statement text, in every run.
- **SC-008**: A page's own text and non-graph cells render and work while the instance is loading, recovering or failed.
- **SC-009**: ADR-006 has a dated entry for every item in its §4 that implementation checked, and the other adapters' tests pass unchanged.

## Assumptions

- **Environment**: Observable Framework 1.x (the spikes ran 1.13.4), the production build served as static files and the preview server, on a current Node, and the same desktop Chromium, Firefox and WebKit browsers as the core's tests. Other major Framework versions and mobile browsers are not covered and are labeled unmeasured.
- **Governing decisions**: ADR-006 (this adapter), ADR-001 to ADR-005 and the project constitution. Where this specification differs from an ADR, the ADR wins until it is amended.
- **Core**: the adapter uses the core's public interface and build subpath as they are, including the option that replaces the worker's construction.
- **Engine shapes**: the normalization is re-checked against the engine built from the pinned checkout (`relatedb/relate`, `@relate/relate-wasm`); the spike's observation that rows arrive in alphabetical key order is expected to hold and is kept harmless if it does not.
- **Not measured**: the cold-network cost of the engine and the worker bundle; the cost per additional instance on one page; the size above which a document graph should be a descriptor graph. The conformance site records load figures that a later decision can use.
- **Graph contents**: the adapter does not decide what a graph contains. The conformance site uses small hand-written graphs, and RFC-003 and RFC-002's decisions will govern real ones.
- **Evidence**: SPIKE-001 (the engine in Framework, result shapes, the symlink failure) and a scratch Framework build on 2026-11-08 (a worker module is not emitted by default; a binary loader is published under a hashed name; a loader with a JavaScript output name is served as a script; a loader that exits with an error stops the build). This feature depends on those findings and re-checks them through the package test.
- **Out of scope**: any client-routing profile (Framework has none), a main-thread instance, user-interface components, a generator that writes the loaders, a site-wide graph or navigation element (RFC-003, RFC-004), a default content extractor, dashboards that fetch their data at load, Framework versions other than 1.x, and changes to the core other than anything ADR-006 names.
- **Names**: the package is `@relate/observable`, in the `@relate` namespace beside `@relate/web`, `@relate/astro` and `@relate/nextjs`. The engine package is `@relate/relate-wasm`.
