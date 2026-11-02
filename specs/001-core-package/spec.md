# Feature Specification: Core Package for Embedding the Graph Database in Web Pages

**Feature Branch**: `001-core-package`

**Created**: 2026-11-02

**Status**: Draft

**Input**: User description: "The graph-web core package (`graph-web-core`, a working name): the shared, framework-agnostic, independently publishable package that every framework adapter will build on to embed the CypherLite browser database in a web page. It implements the accepted ADR-001 (dedicated-worker hosting with two navigation profiles, `client-routing` and `multi-page`) and ADR-002 (node-link JSON graph data format), and follows the constitution. Capabilities: (1) a client that owns a dedicated worker holding the database instance and exposes a generation counter, a status (loading, ready, recovering), queries with an optional timeout, subscriptions that re-run after every instance replacement, and a listener called when a new instance is ready; (2) fault handling; (3) a validator and a loader for the node-link JSON graph data format; (4) the two navigation profiles; (5) query results pass through as the engine's JSON envelope unaltered; (6) a small shared example site and a conformance check that every future adapter must pass; (7) automated tests for every specified behavior. Out of scope: any framework adapter, the site-graph schema and embeddings, the navigation element, reshaping query results, server and build-time hosting, and page-graph authoring (RFC-002)." (Condensed here; the full request is in the conversation that created this specification.)

## Overview

Web pages and sites want to carry a small property-graph database (CypherLite's browser build) and query it. Running that database well in a page is the same problem for every web framework: it must not freeze the page, it must survive a crash or a runaway query, it must be loaded from plain data, and it must live as long as the site allows. This feature is the shared package that solves those problems once, so each framework integration (an *adapter*, built later) only connects the package to its framework.

Three kinds of people depend on it:

- **Adapter authors** build framework integrations on the package and need one dependable behavior to build on.
- **Site authors** use an adapter to put a graph in a site and need it to load, stay available and fail safely.
- **Visitors** read the pages. They never see the package, but they feel a frozen page, a lost graph or a broken link.

The package implements two accepted decisions: ADR-001 (a dedicated background worker per instance, two navigation profiles) and ADR-002 (the node-link JSON graph data format). Terms used below: an *instance* is one running database; a *generation* is a counter that increases each time an instance is replaced; a *store* is the browser's per-site private file storage, which can keep a graph between visits; a *scope* marks data that belongs to one page view so it can be removed when the visitor leaves.

## Clarifications

### Session 2026-11-02

- Q: What should the package do when replacing the database instance keeps failing? → A: Stop after 3 failures in a row and report a new `failed` status; components show a message that includes a diagnostic and suggests reporting it as a GitHub issue, and the page can start a fresh attempt.
- Q: Which browsers must the automated tests run in, and therefore which can the package claim to support? → A: Chromium, Firefox and WebKit (Safari's engine), all required to pass.
- Q: Should the load-time limits fail the automated tests when exceeded, or only be recorded? → A: Every run records its times and a run fails only when a time is more than twice the baseline recorded in the repository for the same environment; the responsiveness and recovery limits are hard gates.
- Q: Can one page create several independent graph clients? → A: Yes, each with its own worker and database; the package supports it without promising cost or limits, which stay unmeasured.
- Q: Should the package let a site observe its inner workings? → A: Yes, a small event stream for status changes, replacements with their reason, and load and restore times, active only while a page listens and never leaving the page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A page queries its graph and stays responsive (Priority: P1)

A site author gives a page a graph and registers queries. The page renders immediately with placeholders, the graph loads in the background, and results arrive when it is ready. The visitor can scroll, click and follow links the whole time.

**Why this priority**: everything else builds on a graph that loads and answers queries without hurting the page. It is the smallest slice that delivers value.

**Independent Test**: load a graph of several thousand nodes into a test page, register a query, and measure the page's responsiveness during the load and the time until the first result.

**Acceptance Scenarios**:

1. **Given** a page with a registered query and a valid graph document, **When** the page loads, **Then** the page's first render completes without waiting for the instance, the status moves from `loading` to `ready`, and the query's result arrives.
2. **Given** a graph of several thousand nodes loading, **When** the visitor scrolls and clicks, **Then** no input is delayed by the load.
3. **Given** a `ready` instance, **When** a query runs, **Then** the result is the engine's JSON result envelope, unaltered.
4. **Given** a registered query, **When** the status is still `loading`, **Then** the component shows its placeholder and no error.
5. **Given** a page that listens for events, **When** the graph loads, **Then** it receives each status change and the load time.

---

### User Story 2 - Graph data is checked and loaded from one standard document (Priority: P1)

An author, or a build step, produces a graph as a node-link JSON document (ADR-002). The package validates it and loads it, or rejects it with a message that points at the first problem. Nothing is partly loaded.

**Why this priority**: every producer (a site's build, a notebook author, a dashboard) feeds the same document, so a wrong document must fail clearly and early.

**Independent Test**: run a corpus of valid and invalid documents through the validator and the loader and check the outcomes and the resulting graphs.

**Acceptance Scenarios**:

1. **Given** a valid document, **When** it is loaded, **Then** every node exists with its labels, its properties and an `id` property, and every link exists as a relationship of the given type from source to target with its properties.
2. **Given** a document with a duplicate node id, a link to a missing node, an unknown key, a nested object as a property value, or an unknown format version, **When** it is validated, **Then** it is rejected with the path of the first problem, for example `nodes[3].properties.id`.
3. **Given** a rejected document, **When** the loader is given it, **Then** no statement runs and the instance stays empty.
4. **Given** a caller that names labels to index, **When** the document loads, **Then** those indexes exist before the nodes are created and no other index is created.
5. **Given** a load with a scope value, **When** it completes, **Then** every created node carries that scope, and a `scope` key in a node's properties is rejected.

---

### User Story 3 - The page recovers when the graph fails (Priority: P1)

A statement crashes the database, a statement runs too long, the background worker dies, or the graph fails to load. The page does not reload and does not lose its text or links. The package replaces the instance, and the queries registered by components run again.

**Why this priority**: a crash in the browser build leaves the instance unusable, and a runaway statement cannot be stopped any other way. Without recovery one bad query ends the graph for the visit.

**Independent Test**: inject each fault (a crashing statement, a runaway statement, a killed worker, a document that cannot load) and watch status, generation and subscriptions.

**Acceptance Scenarios**:

1. **Given** a `ready` instance, **When** a statement crashes the database, **Then** the instance is marked dead at the first crash, the status becomes `recovering`, the worker is replaced, the generation increases, and every subscription runs again against the new instance.
2. **Given** a statement with a timeout, **When** the timeout passes, **Then** the worker is replaced and the call rejects with the reason `timeout`.
3. **Given** a call in flight, **When** the instance is replaced, **Then** the call rejects with the reason `lost`.
4. **Given** a document that crashes the engine every time it loads, **When** three replacements in a row fail to reach `ready`, **Then** the status becomes `failed`, no further replacement is attempted, links and text still work, and components show a message with a diagnostic and a suggestion to report it as a GitHub issue instead of a blank region.
5. **Given** any fault, **When** recovery runs, **Then** the page is not reloaded.
6. **Given** a `failed` status, **When** the page asks for a fresh attempt, **Then** the status returns to `loading`, the failure count starts again from zero, and a new instance is started.
7. **Given** two clients on one page, **When** one client's instance crashes, **Then** only that client recovers or fails, and the other keeps its worker, generation and results.
8. **Given** a page that listens for events, **When** an instance is replaced, **Then** it receives an event with the reason (`trap`, `timeout` or a worker error) and the new generation.

---

### User Story 4 - A site with client-side routing keeps one graph across navigation (Priority: P2)

On a site whose router swaps pages without a full reload, the package keeps one worker and one instance for the whole visit. Components register their queries on arrival and release them when they go. Data that belongs to one page is added on arrival and removed on departure.

**Why this priority**: it is the best experience for sites that can use it, since the graph loads once per visit and every navigation is fast. It follows the P1 slices.

**Independent Test**: in the example site with client-side navigation, move through several pages by link, by browser history and by script, and check that the worker and generation stay the same and that page data does not leak between pages.

**Acceptance Scenarios**:

1. **Given** the `persistent` profile, **When** the visitor navigates between pages by link click, history back and forward, or script, **Then** the same worker and generation persist.
2. **Given** a page that adds scoped data on arrival, **When** the visitor leaves it, **Then** exactly that view's scoped data is removed and other views' data is untouched.
3. **Given** an instance replaced while a page's scoped data is present, **When** the new instance is ready, **Then** the page's data is added again before subscriptions re-run.
4. **Given** a navigation while a query is in flight or while the graph is still loading, **When** the new page arrives, **Then** the new page's queries run once the instance is ready and results for the departed page are ignored.
5. **Given** a full reload or a link that forces one, **When** the page reloads, **Then** a new worker starts, as expected.
6. **Given** the `persistent` profile with a store configured and a matching revision, **When** the visit starts, **Then** the graph is restored from the store instead of replayed.
7. **Given** a configuration that names `multi-page` on a site that has a client-side router, **When** the page starts, **Then** the configured profile is used.

---

### User Story 5 - A multi-page site restores its graph on every page (Priority: P2)

On a site where every navigation loads a new page, each page starts its own worker. To avoid replaying the whole graph on every page, the worker restores it from the store, and falls back to loading the document when the store is empty, locked by another tab, or out of date.

**Why this priority**: many sites cannot adopt a client-side router, and this is the only way the same package serves them. It follows the P1 slices.

**Independent Test**: in the example site as separate pages, visit pages in sequence, change the document's revision, hold the store from a second tab, and leave pages while scoped data exists.

**Acceptance Scenarios**:

1. **Given** the `per-page` profile and a populated store with a matching revision, **When** a page loads, **Then** the graph is restored from the store without replaying the document.
2. **Given** a store whose revision differs from the document's, **When** a page loads, **Then** the store is reset, the document is replayed, and queries return the new data.
3. **Given** a document without a revision, **When** a page loads, **Then** the store is neither read nor written.
4. **Given** a store held by another tab, **When** a page loads, **Then** opening is retried at increasing intervals for no more than five seconds, and then the page continues with an in-memory instance loaded from the document.
5. **Given** scoped data left in the store, **When** a worker starts, **Then** all scoped data is removed before the page's own data is added, and a departing page removes its own view's data when it is hidden.
6. **Given** a worker ended in the middle of a query, **When** the next page opens the store, **Then** the retry covers the short period during which the store stays locked.
7. **Given** two sites on one origin with different site identifiers, **When** both use a store, **Then** each restores only its own graph.

---

### User Story 6 - Statements typed by a visitor can be stopped (Priority: P2)

A page offers a box where the visitor types a statement (a notebook cell, a query console). A statement that never finishes must not trap the visitor: it ends at a timeout or when the visitor presses Stop, and the graph returns.

**Why this priority**: a runaway statement can only be stopped by replacing the instance, so any page with a query box needs this path.

**Independent Test**: run a statement that does not finish, once with a timeout and once with a stop action, and check that the page and the graph recover.

**Acceptance Scenarios**:

1. **Given** a visitor statement with a timeout, **When** it exceeds the timeout, **Then** it fails with the reason `timeout` and the instance is replaced.
2. **Given** a visitor statement in progress, **When** the visitor stops it, **Then** the instance is replaced and the page's registered queries run again.
3. **Given** any statement, visitor-supplied or not, **When** it runs, **Then** it runs in the worker and never on the page's main thread.

---

### User Story 7 - An adapter author checks an adapter against a shared example site (Priority: P3)

A small example site, with pages, links and a shared graph, ships with the package, together with a conformance check. Each adapter author runs the same check against their adapter under both profiles.

**Why this priority**: it keeps every framework integration behaving the same, but nothing else depends on it until the first adapter exists.

**Independent Test**: run the conformance check against the example site, hosted without any framework adapter, under both profiles.

**Acceptance Scenarios**:

1. **Given** the example site, **When** the conformance check runs, **Then** it exercises per-page queries, a shared graph, and failure of the database to load, under both profiles, and reports each result.
2. **Given** an adapter that lets the instance's lifetime or fault handling differ from the package's, **When** the check runs, **Then** the check fails and names the behavior.
3. **Given** the built package installed in a clean project outside this repository, with the engine package installed beside it, **When** a page uses it, **Then** it works with the engine binary's location passed as an option.

---

### Edge Cases

- A store reset cannot complete because another tab holds the store: the page falls back to an in-memory instance.
- A document is empty: it validates and loads an empty graph.
- A scoped document is loaded into an instance that also holds the site graph, and some ids repeat: loading succeeds, lookups by id need a label or a scope to be unambiguous.
- The same page is open in two tabs: each has its own scope, so one tab's departure cannot remove the other's data.
- A crash happens during the initial load: the page recovers the same way as after any crash, and counts toward the three failures in a row.
- A replacement reaches `ready` and then fails again: the count of failures in a row starts again from zero.
- A timeout fires while the instance is being replaced: the call rejects once and the replacement completes.
- The browser lacks workers: the status is `failed` with the reason `unsupported`, no replacement is attempted, links and text keep working, and a fresh attempt fails again at once. Where only the store is missing, the package replays the document.
- Several clients on one page are independent: each has its own worker, generation, status and failure count, and their cost is unmeasured.
- A subscription's component has gone by the time its result arrives: the result is ignored.
- Several documents are loaded into one instance: ids need to be unique only within one document.

## Requirements *(mandatory)*

### Functional Requirements

**Client and hosting**

- **FR-001**: The package MUST host each database instance in a dedicated background worker, driven by a client on the page, so that loading and querying do not block the page.
- **FR-002**: The client MUST expose a generation (an integer that increases each time the instance is replaced) and a status of `loading`, `ready`, `recovering` or `failed`.
- **FR-003**: The client MUST accept a statement, its parameters and an optional timeout, and MUST resolve with the engine's JSON result envelope unaltered, or reject with one of the reasons `trap`, `timeout` or `lost`.
- **FR-004**: The client MUST let a component register a query and a listener; it MUST run the query when the instance is ready and again after every replacement, calling the listener with the status, the generation and the rows.
- **FR-005**: The client MUST let a component register a listener that is called when a new instance is ready, before subscriptions re-run.
- **FR-006**: A component's first render MUST NOT depend on the instance, and the package MUST NOT be needed for navigation links to work.
- **FR-007**: The package MUST accept the location of the engine's binary as an option, and MUST NOT reference a vendored path.

**Fault handling**

- **FR-008**: The worker MUST mark its instance dead at the first crash and answer every later call as a crash.
- **FR-009**: The client MUST terminate and replace the worker on a crash, a timeout or a worker error, increase the generation, and re-run subscriptions, without reloading the page. After three replacements in a row that fail to reach `ready`, it MUST stop replacing and set the status to `failed` (FR-033).
- **FR-010**: Every visitor-supplied statement MUST have a timeout or a stop action, and both MUST end in replacing the instance.
- **FR-011**: The package MUST NOT offer a main-thread instance; every instance, including a small page graph, runs in a worker.
- **FR-012**: When the store reports it is locked, the package MUST retry opening it at intervals that increase from 100 ms to 500 ms, for at most five seconds, then continue with an in-memory instance loaded from the document.

**Graph data**

- **FR-013**: The package MUST provide a validator for the node-link JSON graph data format (ADR-002) that rejects unknown format versions, unknown keys, duplicate node ids, links to missing nodes, disallowed property values and a `properties.id` key, and reports the path of the first problem.
- **FR-014**: The loader MUST validate a document before running any statement, so a rejected document leaves the instance empty.
- **FR-015**: The loader MUST create every node with its labels, its properties and an `id` property, and every link as a relationship of the given type with its properties, through a fixed set of statements that does not depend on which labels or types a document uses.
- **FR-016**: The loader MUST resolve link endpoints without depending on node labels or on an index, so loading cost does not grow with the number of distinct labels.
- **FR-017**: The loader MUST create only the indexes the caller names, before the nodes are created.
- **FR-018**: The loader MUST accept an optional scope value, add it to every node it creates, and reject a `scope` key in node properties when a scope is given.
- **FR-019**: The package MUST load whole numbers as integers and other numbers as floats, and MUST reject `null`, nested objects, arrays of arrays, empty arrays and mixed-kind arrays.

**Profiles**

- **FR-020**: The package MUST support a `persistent` profile (client-side routing) in which one worker and one instance live for the visit, and the client survives route changes.
- **FR-021**: The package MUST support a `per-page` profile (multi-page, no router) in which each page starts its own worker.
- **FR-022**: In the `per-page` profile the worker MUST restore from the store, and MUST replay the document when the store is empty, locked or out of date; staleness MUST be decided by comparing the document's `revision` with the one recorded in the store, and a mismatch MUST reset the store.
- **FR-023**: A document without a `revision` MUST NOT be read from or written to a store.
- **FR-024**: The store's name MUST come from a site identifier in the configuration, so sites on one origin do not share a store.
- **FR-025**: The `persistent` profile MUST support an optional store with the same staleness rule.
- **FR-026**: Page-scoped data MUST be keyed to the page view, added on arrival, removed on departure, and added again after a replacement before subscriptions re-run.
- **FR-027**: A worker MUST remove all scoped data when it starts, and in the `per-page` profile a departing page MUST remove its own view's data when it is hidden.
- **FR-028**: The profile MUST be chosen by configuration (`client-routing` or `multi-page`), and the configured value MUST decide.

**Verification**

- **FR-029**: The package MUST include a small example site with pages, links and a shared graph, and a conformance check that exercises per-page queries, a shared graph, and failure of the database to load, under both profiles.
- **FR-030**: Every behavior this specification states with MUST MUST have an automated test, including the staleness check, the start-up sweep, the bounded retry, and recovery from a crash, a timeout and a worker error. The tests MUST run, and pass, in Chromium, Firefox and WebKit.
- **FR-031**: Load and restore times MUST be recorded on every test run and compared with the figures recorded in ADR-001 and with a baseline recorded in the repository for the same environment. A run MUST fail when a time is more than twice its baseline, and figures from a single run in one environment MUST be labeled as such.
- **FR-032**: The package MUST be independently publishable and MUST NOT depend on this repository's layout; the engine package MUST be a peer dependency.

**Failure reporting**

- **FR-033**: While the status is `failed`, the client MUST NOT replace the instance, MUST expose a diagnostic, and MUST offer an operation that starts a fresh attempt and resets the count of failures in a row.
- **FR-034**: The package MUST supply wording that suggests reporting a `failed` status as a GitHub issue and includes the diagnostic, with the issue link configurable by the site author, and MUST NOT send any report by itself.

**Several clients on one page**

- **FR-035**: A page MAY create several independent clients, each with its own worker, instance, generation, status and failure count; one client's fault MUST NOT affect another, and the package MUST NOT state a limit or a cost per extra client until one has been measured.

**Observation**

- **FR-036**: The client MUST let a page listen for events covering status changes, instance replacements with their reason, and load and restore times; it MUST do no work for events when nothing listens, MUST keep every event inside the page, and MUST be the source of the times that FR-031 records.

### Key Entities

- **Graph data document**: the node-link JSON input of ADR-002, with a `version`, an optional `revision`, `nodes` and `links`.
- **Instance**: one running database holding one graph.
- **Client**: the page-side object that owns the worker and exposes generation, status, queries, subscriptions and the new-instance listener. A page may create more than one.
- **Generation**: an integer that increases each time the instance is replaced.
- **Diagnostic**: what a page needs to describe a failure: the reason of the last failure, the number of failures in a row, and the engine's error text.
- **Event**: a notice a page can listen for: a status change, an instance replacement with its reason, or a load or restore time.
- **Subscription**: a registered query and listener that re-run after every replacement.
- **Scope**: a value that marks data belonging to one page view.
- **Store**: the browser's per-site private file storage that keeps a graph between visits, available to one tab at a time.
- **Revision**: a string in the document that changes whenever its data changes; the staleness check compares it with the store's.
- **Profile**: `persistent` or `per-page`, chosen by the site author.
- **Example site and conformance check**: the shared fixture and the check every adapter must pass.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: While a 20,000-node graph loads, the page's longest unresponsive interval stays under 50 ms (ADR-001 recorded 5 to 9 ms), measured on the reference environment. This limit fails the tests when exceeded.
- **SC-002**: A 5,000-page graph is ready within 2.1 seconds of the page starting, and a 20,000-page graph within 9.5 seconds (1.5 times the figures in ADR-001), measured on the reference environment and reported with the method and the number of runs. These are targets: the tests fail only on a regression of more than twice the recorded baseline (FR-031).
- **SC-003**: A 5,000-page graph is restored from the store and ready within 0.55 seconds (1.5 times the figure in ADR-001), also a target held by the regression rule in FR-031.
- **SC-004**: After each injected fault (crash, timeout, worker error), every registered query delivers fresh results once the replacement completes, within the load or restore time plus one second, and links and text remain usable throughout with no page reload. This outcome fails the tests when not met.
- **SC-005**: Every MUST in ADR-001, ADR-002 and this specification maps to at least one passing automated test, shown in a traceability table.
- **SC-006**: Every invalid document in the test corpus is rejected with the path of its first problem and no partial graph, and every valid one loads exactly the nodes and relationships it describes.
- **SC-007**: When a store is held by another tab, the page continues with an in-memory graph within five seconds plus the replay time.
- **SC-008**: The conformance check passes for the example site under both profiles, and an adapter author can run it without changing the package.
- **SC-009**: Across ten navigations in the `persistent` profile, the worker and the generation are unchanged, and no page's scoped data remains after its departure.
- **SC-010**: A document that crashes the engine on every load ends in the `failed` status after exactly three attempts, with no further replacement and with links and text still usable.
- **SC-011**: The automated suite, including the conformance check under both profiles, passes in Chromium, Firefox and WebKit, and the package's documentation lists exactly those browsers as measured.
- **SC-012**: Every status change, replacement (with its reason) and load or restore time in the test suite is observable through the event stream, and with no listener registered the package does no event work and sends nothing out of the page.

## Assumptions

- **Environment**: current desktop Chromium, Firefox and WebKit (Safari's engine) browsers, in all of which the automated tests run and must pass. A browser needs module workers and, for the store, the file access a worker needs; where the store is unavailable the package falls back to replaying the document, and the tests for that browser check the fallback instead of the store. Mobile and older browsers are not covered and are labeled unmeasured; support is claimed only as far as the tests run.
- **Reference environment**: the load-time thresholds in SC-001 to SC-003 are measured on one recorded environment. The thresholds are 1.5 times the single-run figures in ADR-001 and may be revised once more runs exist.
- **Defaults chosen at planning**: the default statement timeout, the batch size and order of loading, and the shape of the configuration are decided in the plan, not here.
- **Example site**: it is plain pages with a minimal navigation script for the `persistent` profile, so it does not depend on any framework or adapter.
- **Document delivery**: how a document reaches the page (embedded, fetched or generated) is not part of this feature; the client is given the document as data.
- **Engine**: the engine is consumed as `@neo4j-labs/cypherlite-wasm`, from a pinned build vendored into the repository until it is published, and declared by the package as a peer dependency, in a pnpm workspace. The package name `graph-web-core` is a working name.
- **Not verified yet**: dynamic labels and relationship types in the browser build, and the element-id seek, are documented in the engine but not tested in that build; the first tests of this feature settle them.
- **Out of scope**: framework adapters, the site-graph schema and embeddings, the navigation element, reshaping query results, server and build-time hosting, page-graph authoring (RFC-002), and sharing or saving a visitor's work.
- **Governing decisions**: ADR-001 (hosting), ADR-002 (graph data format), and the project constitution (version 1.1.1). ADR-001 lists three statuses; the `failed` status and the three-failure limit are an addition to it, to be recorded as an amendment when the plan is written. The default target of the issue link (this project's tracker or the engine's) is chosen in the plan.
