# Feature Specification: Application Graphs in the Core Package

**Feature Branch**: `spec/006-application-graphs` (spec directory `006-application-graphs`)

**Created**: 2026-11-09

**Status**: Implemented

**Input**: User description: "Application graphs in the core package (`@relate/web`, `packages/web`): implement accepted ADR-009 (and build on ADR-001 to ADR-003 and the SPIKE-008 findings; parent RFC-006) so a page can open one named, durable, versioned graph in the visitor's browser through `createClient`: seeded once, carried forward by migrations, honest about whether it is stored, and exportable. It is checked in Chromium, Firefox and WebKit, and the open items in ADR-009 §4 are tested and the ADR amended with what is found."

## Overview

The shared core package (`@relate/web`, specification `specs/001-core-package/spec.md`) runs the embedded graph database in a page. Everything it has hosted so far is data a site ships and can throw away: a stored copy of a site's graph is a cache, named after the graph's descriptor, wiped when the descriptor's revision changes. A web application whose data the visitor writes needs the opposite: the browser's copy is the only copy, the shipped seed applies once, a new release of the application migrates the stored data and never replaces it, and losing the data loses the visitor's work. ADR-009 decides the core's contract for this, and this feature implements it. It is the first change to the core since the adapters began; the adapters (`specs/002-astro-adapter` to `specs/005-sveltekit-adapter`) are unchanged.

Three kinds of people depend on it:

- **Application authors** (and the starters that follow, such as the react-admin provider of ADR-008) want a graph that is there when the visitor returns, with a seed, a schema version and a way to change the schema.
- **Adapter authors** later wrap this in framework helpers and need one dependable contract.
- **Visitors** type records into an application and never see the package, but they feel a reload that empties the application, a second tab that overwrites their work, or a release that loses their data.

The feature implements ADR-009 and builds on ADR-001 (hosting, profiles, bounded retry), ADR-002 (the graph data format), ADR-003 (the graph descriptor) and the measurements in SPIKE-008. Terms used below: an *application graph* is a graph the visitor writes, kept in one named store in the browser; a *store* is the browser's per-site private file storage holding one graph; the *marker* is one reserved node inside the store that records the store's format, schema version and state; a *seed* is the graph data a new store starts from; a *migration* is an ordered list of statements that takes stored data from one schema version to the next; a *holder* is a tab that has the store open (the store serves one holder at a time).

## Clarifications

### Session 2026-11-09

- Q: What does this feature change in code that other packages own? → A: Only `packages/web`, the core. The adapters, the content-graph cache, and the engine are unchanged.
- Q: Which open items does implementation settle, and where are the answers recorded? → A: The ones in ADR-009 §4; each answer is recorded as a dated amendment to ADR-009.
- Q: Are the statements a migration or seed runs subject to the visitor-statement timeout? → A: No. They are the application author's, not the visitor's; they are written to survive interruption (bounded, rerunnable steps).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A page opens a durable graph that is seeded once (Priority: P1)

An application author creates a client with a name, a schema version and a seed. On the first visit the store is empty, so the seed is loaded. On every later visit the stored data is there, nothing is replayed, and the seed is never applied over what the visitor wrote.

**Why this priority**: it is the smallest slice that delivers the feature's promise, and everything else builds on it.

**Independent Test**: create an application client in a test page, write a record, reload the page, and read the record back without the seed having been loaded a second time.

**Acceptance Scenarios**:

1. **Given** an empty browser and an application client with a seed, **When** the page loads, **Then** the status moves from `loading` to `ready` and the seed's nodes can be queried.
2. **Given** a ready store with a record the visitor added, **When** the page reloads, **Then** the record is present, the seed is not loaded again, and a changed seed in the new page's code has no effect on the stored data.
3. **Given** a name outside `[A-Za-z0-9_-]{1,60}`, **When** the client is created, **Then** creation throws a message that names the rule.
4. **Given** two application clients with different names on one origin, **When** each writes, **Then** neither sees the other's data.
5. **Given** a seed that contains a node with the marker's label, **When** the client is created, **Then** loading is rejected and names the label.
6. **Given** a seed given as a descriptor, or as a plain document with an `indexes` option, **When** the first run completes, **Then** the named indexes exist, and they exist on later runs with no re-creation.
7. **Given** a ready application graph, **When** a query runs, **Then** the result is the engine's JSON envelope, unaltered, and the marker node is an ordinary node that queries return.

---

### User Story 2 - A store in an unexpected state is never silently erased (Priority: P1)

A first run can be cut short, an import can be cut short, an application statement can delete the marker, and a newer release can have written data an older page does not understand. In each case the core either recovers safely or stops and says what it found, and it leaves the visitor's data alone.

**Why this priority**: a wrong guess here destroys a visitor's work, which is the one thing the feature exists to prevent.

**Independent Test**: build each store state in a test (an interrupted first run, an interrupted import, a deleted marker, a newer marker) and open it with a client.

**Acceptance Scenarios**:

1. **Given** a store whose first run stopped after the marker was written with state `seeding`, **When** a client opens it, **Then** the store is reset, the seed is loaded again, and the state ends `ready`.
2. **Given** a store whose marker state is `importing`, **When** a client opens it, **Then** the client fails with `import-interrupted` and the store is unchanged.
3. **Given** a store that holds data and no marker, **When** a client opens it (including after an application statement deleted the marker), **Then** the client fails with `store-unmarked` and the data is unchanged.
4. **Given** a marker whose version or format is above what the code knows, **When** a client opens it, **Then** the client fails with `store-newer` and the store is unchanged.
5. **Given** a failed client, **When** the page calls `resetApplication()` and confirms, **Then** the store is reset and seeded again, and no other call discards data.
6. **Given** a ready store, **When** the page reloads, **Then** the core resets nothing.

---

### User Story 3 - A new release carries stored data forward (Priority: P1)

An application author ships a release with a higher schema version and a list of migrations. A visitor who comes back with the older data gets it migrated. If a migration is cut short, the next load resumes from the last completed version and ends with the same data as an uninterrupted run.

**Why this priority**: applications change; without migration the only options are to wipe visitors' data or never change the schema.

**Independent Test**: seed a store at version 1, open it with code at version 3 and two migrations, and compare the result to an interrupted run that is resumed.

**Acceptance Scenarios**:

1. **Given** a store at version 1 and code at version 3 with migrations for 2 and 3, **When** a client opens it, **Then** both run in order, the marker's version ends 3, and the stored data keeps what the visitor wrote.
2. **Given** a migration whose statement fails, **When** a client opens the store, **Then** the client fails with a diagnostic that names the version and the statement, and the store stays at the last completed version.
3. **Given** the worker is terminated part-way through a migration step, **When** the page loads again, **Then** the migration resumes from the last completed version and the final data equals the data of an uninterrupted run.
4. **Given** a step written with the package's range helper over a numeric property, **When** it is interrupted and run again, **Then** it completes with each node updated once and none skipped.
5. **Given** a migration that adds an index, **When** it runs, **Then** the index exists afterwards and on later runs.
6. **Given** a store whose marker is at the code's version, **When** a client opens it, **Then** no migration runs.

---

### User Story 4 - The page learns whether the data is really stored (Priority: P1)

A page tells the visitor whether their data is durable, held only in memory, or waiting for another tab. A second tab of the application waits for the first instead of writing data that would be lost; storage that is missing or broken is reported, never hidden.

**Why this priority**: the visitor's decisions (export now, close the other tab) depend on this being true, and the earlier behaviour (fall back to memory silently) would lose their work.

**Independent Test**: open the same application in two tabs, check the second shows `waiting` and proceeds after the first closes; run a client in a context with no store and check `memory`.

**Acceptance Scenarios**:

1. **Given** an application client whose store opened, **When** the page reads `client.storage`, **Then** it is `durable` and `persisted` is the browser's answer or `null`.
2. **Given** a store held by another tab, **When** a second client opens after the bounded retry, **Then** its status stays `loading`, `storage.kind` is `waiting` with reason `locked`, it retries every second, queries made meanwhile stay pending and do not reject, and when the first tab closes it proceeds and a change event fires.
3. **Given** `whenLocked: "memory"` and a locked store, **When** the retry ends, **Then** the client runs in memory with reason `locked` and writes nothing to the store.
4. **Given** a browser with no store support, **When** a client opens with the default, **Then** it runs in memory with the seed, `storage.kind` is `memory` with reason `unavailable`; with `onUnavailable: "fail"` it fails.
5. **Given** an open error on a store that should exist, **When** a client opens with the default, **Then** it fails with `store-unreadable` and the engine's message and the store is unchanged; with `onError: "memory"` it runs in memory with reason `error`.
6. **Given** any client, **When** it starts, **Then** the core never calls the browser's request for persistent storage; `requestPersistence()` calls it on demand, returns a promise, and never delays startup.
7. **Given** a client, **When** `storageEstimate()` is called, **Then** it returns the browser's usage and quota.
8. **Given** a multi-page site, **When** the visitor leaves a page, **Then** the departing page closes the store on `pagehide` so the next page opens it within the retry.
9. **Given** the page shows its own text and links, **When** the client is `loading`, `waiting` or `failed`, **Then** the text and links remain usable and any graph-driven region shows a placeholder or a message.

---

### User Story 5 - A visitor can take a copy of the data out and bring it back (Priority: P2)

An application offers export and import. Export produces a document in the graph data format inside a small envelope, and says what the format could not carry. Import checks the whole document before it touches the store.

**Why this priority**: it is the visitor's backup and the author's route to a fresh start, but the store works without it.

**Independent Test**: export a graph the format can carry and import it into a reset store, then export again and compare; then export a graph with each kind of loss and check the report.

**Acceptance Scenarios**:

1. **Given** a ready store, **When** `exportApplication({ allowLoss })` runs, **Then** it returns the envelope (format name, version 1, application name and schema version, and an ADR-002 document) and a list of losses by kind and count, and the marker is not in the document.
2. **Given** values the format cannot carry (integers beyond 2^53, whole-number floats, dates, durations, points, empty lists, nodes without a string `id`), **When** export runs, **Then** each kind is reported with its count, and without `allowLoss: true` the call rejects.
3. **Given** a graph the format can carry, **When** it is exported, imported into a reset store and exported again, **Then** the two documents are identical.
4. **Given** an envelope for another application name, or with a version above the code's, **When** import runs, **Then** it rejects and the store is unchanged.
5. **Given** a valid envelope, **When** import runs, **Then** the document is validated first, the marker is set to `importing`, the store is reset and loaded, the marker is set `ready` with the envelope's version, and migrations run to the current version.
6. **Given** the worker is terminated during import, **When** the page loads again, **Then** the client fails with `import-interrupted` (User Story 2) and nothing is reseeded.
7. **Given** import, **When** it is called, **Then** it never exports the current data first; the page does that.

---

### User Story 6 - Durability and the browser limits are measured (Priority: P2)

The behaviours that rest on the browser (no acknowledged write lost when the worker is stopped, one holder at a time, restore time) are tested in Chromium, Firefox and WebKit, and compared with the content-graph store.

**Why this priority**: the claims in ADR-009 come from one spike on one machine, and the constitution requires each to be tested or labelled.

**Independent Test**: run the browser suite and read the recorded restore and recovery figures.

**Acceptance Scenarios**:

1. **Given** a client writing one record at a time, **When** the worker is terminated, and separately the tab is closed, mid-write, **Then** every write the page was told succeeded is present after the reopen with no gaps, in all three browsers.
2. **Given** an application store and a content store of the same size, **When** each is restored, **Then** the application store's restore is no slower than the content store's, and both times are recorded with method and environment.
3. **Given** a page that needs a content graph and an application graph, **When** it creates two clients, **Then** each has its own worker and store, and no statement spans them.
4. **Given** a client in memory, **When** the page writes, **Then** nothing is written to the store.

---

### User Story 7 - Open items are checked and the decision is amended (Priority: P2)

The items ADR-009 left for implementation are tested, and the ADR is amended with the answers, as the earlier ADRs were.

**Why this priority**: typed export detection and index persistence could change the design if the answer is unfavourable.

**Independent Test**: read ADR-009 after implementation; each listed item has a dated entry that states what was found.

**Acceptance Scenarios**:

1. **Given** each loss kind in User Story 5, **When** typed reads detect it (including a property whose type differs across nodes and an integer beyond 2^53), **Then** the answer is recorded, and if a kind cannot be detected the ADR is amended with what is reported instead.
2. **Given** a replaced worker in Chromium, **When** the store is reopened, **Then** the observed reopen sequence and time are recorded.
3. **Given** application mode, **When** a store is locked by a busy holder, **Then** the retry duration that works is recorded and ADR-009 is amended if it differs from 5 s.
4. **Given** a store reopened after the first run, **When** a query uses an index, **Then** whether the index persisted is recorded.
5. **Given** the engine's gaps found on the way (no checkpoint, no size, no snapshot export), **When** the feature is complete, **Then** they are listed for raising upstream and none is patched around.

---

### Edge Cases

- The name is valid but another application on the same origin chose it; the two share data. The core cannot tell them apart; the name is the application's to choose (ADR-009).
- A client is created in application mode and the page has no descriptor and no seed; creation fails naming the missing seed.
- The seed document is invalid under ADR-002; the first run fails with the validator's first problem, and the marker stays `seeding` so the next run recovers.
- A version of 0, a non-integer, or a negative number is passed; creation throws.
- Migrations are given for versions that are not consecutive, or for a version above the code's; creation throws and names the version.
- A migration over a very large store is cut short by closing the tab; the next load resumes (User Story 3); the time to migrate a large store is not measured here.
- A bulk statement of the form "match every node with a label and set a property", with no filter, is interrupted; the engine may leave part of it applied, which is why the range helper and filtered steps are required of migration authors.
- A page leaves while the client is `waiting`; nothing was written, and the next page tries again.
- Two clients with the same application name in one page; the second waits on the first.
- The quota is exceeded by a write; what happens is not measured in this feature and is labelled so.
- Power loss or an operating-system crash is not tested; durability is claimed only for the worker being stopped and the tab being closed.

## Requirements *(mandatory)*

### Functional Requirements

**Application mode**

- **FR-001**: `createClient` MUST accept an `application` option with `name`, `version`, `seed`, `indexes`, `migrations`, `onUnavailable` (`memory` default or `fail`), `onError` (`fail` default or `memory`) and `whenLocked` (`wait` default or `memory`), in place of a graph source, and MUST leave every existing option and behaviour unchanged when it is absent.
- **FR-002**: `name` MUST match `[A-Za-z0-9_-]{1,60}` and the client MUST throw at creation otherwise; the store MUST be named `app-<name>`, apart from the content cache's `rel-<id>` names. `version` MUST be a positive integer, or creation throws.
- **FR-003**: `seed` MUST be an ADR-002 graph data document or an ADR-003 descriptor; indexes MUST come from the descriptor, or from `indexes` for a plain document, MUST be created on first run only (the store keeps them), and a migration MUST be able to add one with an ordinary statement.
- **FR-004**: Application mode MUST be independent of the navigation profile, and the instance's lifetime MUST still follow it (ADR-001).
- **FR-005**: Query results in application mode MUST be the engine's JSON envelope, unaltered.

**Lifecycle and marker**

- **FR-006**: The store MUST record its state in one node labelled `_RelateApplication` with `format` (1), `version` and `state` (`seeding`, `ready` or `importing`). The label is the core's, documented as reserved; a seed that contains it MUST be rejected at load; the marker MUST be an ordinary node that queries return.
- **FR-007**: On an empty store the core MUST write the marker with state `seeding`, load the seed, create the indexes, then set state `ready` as the last statement. A marker in state `seeding` MUST cause a reset and a new seeding. A marker in state `importing` MUST fail the client with `import-interrupted` and leave the store unchanged. A store with data and no marker MUST fail with `store-unmarked` and be left unchanged.
- **FR-008**: A `ready` marker equal to `version` MUST open with no seed and no migration. A marker above `version`, or a `format` above the one the code knows, MUST fail with `store-newer` and leave the store unchanged.
- **FR-009**: The core MUST discard stored data only through `client.resetApplication()` and through the `seeding` recovery; it MUST NOT reset a `ready` store or any store it cannot classify.
- **FR-010**: Opening a store MUST use ADR-001's bounded retry for a locked store, and a replaced worker (ADR-001) MUST reopen the same store through the same steps.

**Migrations**

- **FR-011**: `migrations` MUST map a target version to an ordered list of Cypher statements. For each version from the stored one to `version`, the core MUST run that entry's statements in order and set the marker's `version` to that target as the final statement. Non-consecutive versions, or versions above the code's, MUST be rejected at creation.
- **FR-012**: A failing statement MUST fail the client with a diagnostic that names the version and the statement, and the store MUST remain at the last completed version; a later open MUST resume from there.
- **FR-013**: The package MUST provide one helper that runs a statement over successive bounded ranges of a numeric property of one label, each filtered so running it again is harmless, and it MUST skip the marker node. The package documentation MUST state the rule for authors (bounded steps, each safe to run again, version written last).

**Storage status and persistence**

- **FR-014**: The client MUST expose `storage` as `{ kind, reason?, persisted }` (`durable`, `memory` or `waiting`; reason `unavailable`, `locked` or `error`; `persisted` the browser's answer or `null`) and an event for each change.
- **FR-015**: When the store remains locked after the retry, with `whenLocked: "wait"` the client MUST stay `loading` with `storage.kind` `waiting` and reason `locked`, retry every second, keep queries pending, and proceed when the holder lets go; with `"memory"` it MUST run in memory with reason `locked`.
- **FR-016**: When the browser offers no store, `onUnavailable: "memory"` MUST run the instance in memory with the seed and reason `unavailable`, and `"fail"` MUST fail the client. When opening a store that should exist fails for another reason, the client MUST fail with `store-unreadable` and the engine's message and leave the store unchanged, unless `onError: "memory"`, which MUST run in memory with reason `error`.
- **FR-017**: A client in memory MUST NOT write to the store and MUST NOT become durable without a new client.
- **FR-018**: The core MUST NOT call the browser's request for persistent storage. `requestPersistence()` MUST call it on demand, return a promise, and never delay startup. `storageEstimate()` MUST return the browser's usage and quota.
- **FR-019**: A departing page MUST close the store from `pagehide` so the next page of a multi-page site can open it within the retry.
- **FR-020**: While the client is `loading`, `waiting` or `failed`, the core MUST NOT make a page's first render depend on it (the constitution's principle III is unchanged).

**Export and import**

- **FR-021**: `exportApplication({ allowLoss })` MUST return `{ envelope, losses }` where the envelope is `{ format: "relate-application-export", version: 1, application: { name, version }, document }` and `document` is an ADR-002 document, MUST skip the marker node, MUST detect the losses by typed reads and report each by kind and count (integers beyond 2^53, whole-number floats, dates and durations, points, empty lists, nodes without a string `id`), and MUST reject when losses exist and `allowLoss` is not `true`.
- **FR-022**: `importApplication(envelope)` MUST reject an envelope for another name or a version above the code's; otherwise it MUST validate the whole document, set the marker to `importing`, reset the store, load the document, set the marker `ready` with the envelope's version, and run migrations to the current version. It MUST NOT export the current data first, and the core MUST NOT call it on its own.
- **FR-023**: Export followed by import into a reset store followed by export, for a graph the format can carry, MUST produce identical documents.

**Several graphs**

- **FR-024**: A page that needs a content graph and an application graph MUST use two clients, each with its own instance and store; the core MUST NOT support a statement across them.

**Checks and packaging**

- **FR-025**: The core's tests MUST cover, in Chromium, Firefox and WebKit: worker termination and tab closure mid-write losing no acknowledged write and leaving no gap; a second tab waiting and then proceeding; memory mode never writing to the store; first-run recovery, `store-unmarked`, `store-newer`, `import-interrupted` and `store-unreadable`; an interrupted migration resuming and matching an uninterrupted run; `resetApplication` as the only discard path; invalid names throwing; export reporting each loss kind and rejecting without `allowLoss`; import then export identical; export skipping the marker; the departing page releasing the store; and the restore time of an application store against a content store of the same size.
- **FR-026**: Implementation MUST check each item in ADR-009 §4 listed for confirmation and amend ADR-009 with a dated entry stating what was found.
- **FR-027**: The adapters, the content-graph cache, the conformance site and the engine MUST change in no way; existing core tests MUST pass unchanged.
- **FR-028**: The package's documentation (`packages/web/README.md`) MUST describe application mode, the failure names, the storage status, export and import, and the rule for migrations.
- **FR-029**: Every behaviour stated here with MUST MUST have an automated test tagged with its requirement or scenario, and the repository's trace check MUST report any untagged requirement.

### Key Entities

- **Application graph**: a named graph in one store, written by the visitor, seeded once, versioned.
- **Marker**: one node labelled `_RelateApplication` with format, schema version and state; the single record of what the store is.
- **Seed**: the graph data a new store starts from (a document or a descriptor).
- **Migration**: an ordered list of statements that takes stored data to one schema version.
- **Storage status**: `{ kind, reason?, persisted }`, what the page can tell the visitor about their data.
- **Export envelope**: the graph data document inside a small wrapper that names the format, application and version.
- **Loss report**: the list of values the export format could not carry, by kind and count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor's record written in one visit is present in the next visit, in all three browsers, in every run of the test, and the seed is not applied over it.
- **SC-002**: In every interrupted run in the suite (worker stopped or tab closed mid-write, in all three browsers), every write the page was told succeeded is present after reopening, with no gaps. Figures come from the harness's runs on one machine and are labelled as such.
- **SC-003**: Every unexpected store state in User Story 2 either recovers (interrupted first run) or fails with its named reason and leaves the stored data unchanged, in every run.
- **SC-004**: A store migrated by an interrupted and resumed run ends with the same data as an uninterrupted run, in every run of the test.
- **SC-005**: A second tab of the application never writes to the store while another tab holds it, shows `waiting` until the first closes, and then proceeds, in all three browsers.
- **SC-006**: Export reports each loss kind in User Story 5 with its count, rejects without `allowLoss`, and a carriable graph survives export, import and export identically.
- **SC-007**: Restoring an application store takes no longer than restoring a content store of the same size, in the sizes the suite records; the times, method and environment are recorded, and anything not measured is labelled unmeasured.
- **SC-008**: The core's existing tests and every adapter's tests pass unchanged, and ADR-009 has a dated entry for every item in §4 that implementation checked.
- **SC-009**: A page whose client is `loading`, `waiting` or `failed` keeps its text and links usable and shows a placeholder or message in the graph-driven region.

## Assumptions

- **Environment**: desktop Chromium, Firefox and WebKit, the same as the core's tests. Mobile browsers, power loss, and quota exhaustion are not covered and are labelled unmeasured.
- **Governing decisions**: ADR-009 (this feature), ADR-001 to ADR-003 and the project constitution. Where this specification differs from an ADR, the ADR wins until it is amended; ADR-009 is accepted and expected to receive amendments from this work.
- **Engine**: used through its package interface. It has no call for a checkpoint, store size or snapshot export in the browser build; those requests are raised separately (RFC-006 7.5, 7.12) and nothing here patches around them.
- **Evidence**: SPIKE-008 found, in single runs on one machine, that interrupted runs lost no acknowledged write, that a second holder is refused within milliseconds and the store is free within about 0.5 s of an idle holder closing (about 3 s after a busy Chromium worker is stopped), that a store keeps 65 files at every size tried, and that a bulk statement without a filter can be partly applied. This feature depends on those findings and re-checks them through the suite.
- **Timeouts**: seed loading and migration statements are the application author's, not the visitor's, and are not subject to the visitor-statement timeout (constitution principle IV); they are written to survive interruption.
- **Export fidelity**: whether typed reads detect each loss kind is unverified at specification time; User Story 7 settles it.
- **Not measured**: durability across power loss; Firefox and WebKit beyond 100,000 nodes; behaviour when the quota is exceeded; the time to migrate a large store; the cause of the occasional write stalls seen in SPIKE-008.
- **Out of scope**: adapter helpers for application mode, one instance holding a content and an application graph in namespaces, several tabs sharing the store, engine changes, synchronization between devices or visitors, encryption, the react-admin package and starter (ADR-008), and changes to the content-graph cache.
- **Names**: the package is `@relate/web`; the store prefix is `app-`; the internal prefix `rel-` is unchanged for the content cache; the engine package is `@relate/relate-wasm`.
