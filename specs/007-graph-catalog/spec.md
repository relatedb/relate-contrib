# Feature Specification: The Graph Catalog in the Core Package

**Feature Branch**: `spec/007-graph-catalog` (spec directory `007-graph-catalog`)

**Created**: 2026-11-10

**Status**: Implemented

**Input**: User description: "Graph catalog in the core package (`@relate/web`, `packages/web`): implement accepted ADR-010 (parent RFC-007; builds on ADR-001, ADR-003, ADR-009 and SPIKE-009 to SPIKE-011) so the core records every persisted graph in one catalog file, ordered by a Web Lock, instead of a marker node inside application graphs and a stored-copy file beside content caches. A page can list what the origin has stored, remove a graph, and recover from a damaged catalog. It is checked in Chromium, Firefox and WebKit, and ADR-009 and ADR-003 are amended with what changed."

## Overview

The shared core package (`@relate/web`, specification `specs/001-core-package/spec.md`) keeps two kinds of graph in the browser's per-site private file storage, and each carries its own record of what it holds. A *content cache* (a copy of a graph a site ships) has a small file at `relate-web/<id>.json` that describes the revision it holds. An *application graph* (a graph the visitor writes, `specs/006-application-graphs`) has one reserved node, labelled `_RelateApplication`, inside the graph, recording the store's format, schema version and state. Neither can be listed. The reserved node is data: a query counts it, a visualisation draws it, a statement can delete it. And an application import that resets the store and then writes a new marker leaves, after a crash between the two, an empty unmarked store that seeds again.

ADR-010 replaces both records with one *catalog*: a single JSON file, `relate-web/catalog.json`, with one entry per graph, read and written under a Web Lock so several tabs cannot lose each other's updates. Each lifecycle operation writes its intent before the data changes and its outcome after, so a crash leaves an entry that names what was interrupted. This feature implements it. The graph itself then holds nothing but the author's data.

Three kinds of people depend on it:

- **Application authors** (and the starters that follow, such as the react-admin provider of ADR-008) want a graph with no bookkeeping node in it, and an honest failure when a store has lost its data.
- **Site authors** want to see what their origin has stored and clear it: a listing, a removal, and a way out of a damaged catalog.
- **Visitors** never see the package, but they feel a store that silently reseeds over their work, or a tab that overwrites another tab's state.

The feature implements ADR-010 and builds on ADR-001 (hosting, retry), ADR-003 (the descriptor, whose stored copy the entry replaces), ADR-009 (application graphs, whose marker the entry replaces) and the measurements in SPIKE-009 to SPIKE-011. Terms: a *store* is the browser's private file storage holding one graph (`app-<name>` for an application, `rel-<id>` for a cache); an *entry* is one graph's record in the catalog, with a *state* (`ready`, or an in-progress state that names an interrupted operation); a *holder* is a tab with the store open (a store serves one holder at a time).

## Clarifications

### Session 2026-11-10

- Q: What does this feature change in code that other packages own? → A: Only `packages/web`, the core. The adapters, the conformance site and the engine are unchanged. The content cache's stored-copy file is replaced by an entry, which supersedes `specs/006-application-graphs` FR-027's statement that the cache changes in no way.
- Q: What happens to stores written by the earlier form (marker node, stored-copy file)? → A: Nothing is adopted; the core is unpublished (0.0.0). A store with the old node and no entry fails `store-unmarked` with a message naming the node; a cache whose entry is missing is rebuilt.
- Q: Which documents does implementation amend? → A: ADR-009 (the marker replaced, `store-lost` added to the failure reasons) and ADR-003 (the stored copy replaced), each as a dated entry, and the package README.
- Q: Is the catalog's interface a visitor-facing page? → A: No. The core supplies data and calls; a page builds its own surface (RFC-007 non-goal).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A graph's bookkeeping lives outside its data (Priority: P1)

An application author opens an application graph as before. On the first visit the seed loads; on later visits the stored data is there. Nothing about the graph's state is stored as a node: a count of all nodes returns exactly the seed's and the visitor's records, and a statement that deletes every node cannot remove the core's record of the store.

**Why this priority**: it is the point of the feature, and the smallest slice that proves the catalog can stand in for the marker.

**Independent Test**: open an application client, count all nodes, write a record, reload, count again; read the catalog file and see the entry.

**Acceptance Scenarios**:

1. **Given** an empty browser and an application client with a seed of 5 nodes, **When** the page loads, **Then** the status reaches `ready`, a count of all nodes is 5, and the catalog holds an entry for `app-<name>` with state `ready`, the code's version and `seeded: true`.
2. **Given** a ready store, **When** the page reloads, **Then** the seed is not loaded again, the visitor's record is present, and the entry is not rewritten.
3. **Given** a seed that contains a node labelled `_RelateApplication`, **When** the client is created, **Then** the label is an ordinary label: it loads and queries return it, and the core never reads it.
4. **Given** a seed with no nodes, **When** the first run completes, **Then** the entry says `seeded: false` and later opens of the empty store succeed.
5. **Given** a store that holds a node labelled `_RelateApplication`, no other record and no entry, **When** a client opens it, **Then** it fails with `store-unmarked` and a message that names the node.
6. **Given** a ready application, **When** a statement deletes every node, **Then** the next open fails with `store-lost`, the store is not touched, and `resetApplication()` recovers it.

---

### User Story 2 - An interrupted operation is recovered or reported (Priority: P1)

A first run, a migration, an import, a reset and a removal can each be cut short. Because the entry records the intent before the data changes, the next open knows which operation was interrupted and either completes it or stops and says so. The import window of ADR-009 (an empty unmarked store that seeds again) no longer exists.

**Why this priority**: a wrong guess destroys a visitor's work, and the catalog exists to make the guess reliable.

**Independent Test**: for each row of the classification, build the entry and store state, open with a client, and compare the outcome to the table in FR-010.

**Acceptance Scenarios**:

1. **Given** an entry `seeding`, **When** a client opens, **Then** the store is reset, the seed loads again and the entry ends `ready`.
2. **Given** an entry `resetting`, **When** a client opens, **Then** the reset continues: the store is reset, seeded, and the entry ends `ready`.
3. **Given** an entry `importing`, **When** a client opens, **Then** it fails with `import-interrupted` and the store is unchanged, including after a crash between the reset and the load of an import.
4. **Given** an entry `migrating` with `version` 1 and `target` 3, **When** a client at version 3 opens, **Then** the migrations run from version 1 and the data equals an uninterrupted run's.
5. **Given** an entry `removing` for an application, **When** a client opens, **Then** the removal is finished and the open is treated as a first run.
6. **Given** an entry with `version` above the code's, or a catalog `format` above the one the code knows, **When** a client opens, **Then** it fails with `store-newer` and nothing is changed.
7. **Given** data and no entry, **When** a client opens, **Then** it fails with `store-unmarked` and leaves the data.
8. **Given** an entry `ready` with `seeded: true` and a store with no nodes and no indexes, **When** a client opens, **Then** it fails with `store-lost`.
9. **Given** an entry `ready` with `seeded: false` and an empty store, **When** a client opens, **Then** it opens (and migrates if the version is below the code's).
10. **Given** an entry `ready` below the code's version, **When** a client opens, **Then** the migrations run; at the code's version, none run.

---

### User Story 3 - Several tabs share the catalog without losing updates (Priority: P1)

Two tabs of one origin may each open a different graph, or finish a migration, at the same time. Every write to the catalog goes through a Web Lock and replaces the file whole, so neither tab's change is lost, and every tab can read the catalog while another tab holds a store.

**Why this priority**: the catalog is shared by every tab of every application on the origin, and a lost update would corrupt the account of what each store is.

**Independent Test**: three tabs each write 100 changes to the catalog at once and the final catalog holds all of them; a tab reads the catalog while another holds a store.

**Acceptance Scenarios**:

1. **Given** three tabs each making 100 entry changes at once, **When** all finish, **Then** every change is present and none is lost.
2. **Given** one tab holding a store, **When** a second tab reads the catalog and changes another graph's entry, **Then** both succeed and the holder's queries continue.
3. **Given** a writer terminated or a tab closed at a random moment in a write, **When** another tab next reads, **Then** it reads a whole catalog, within a few milliseconds of the lock being released.
4. **Given** a reader reading in a loop while a writer replaces the file repeatedly, **When** the run ends, **Then** no read was torn, missing or failed.
5. **Given** a browser that offers the file storage but not Web Locks, **When** a client opens, **Then** storage is treated as unavailable and the `onUnavailable` rule applies.

---

### User Story 4 - Content caches use the catalog (Priority: P1)

A site that ships a graph with a descriptor keeps getting a cache that restores quickly when the revision matches and rebuilds when it does not. The cache's record is an entry in the catalog, not a file per graph.

**Why this priority**: the catalog must be the one mechanism for both kinds (RFC-007), and the cache's stored copy is the other record it replaces.

**Independent Test**: load a descriptor-backed graph, reload and see a restore with no request for the data, change the revision and see a rebuild; check no `relate-web/<id>.json` file remains.

**Acceptance Scenarios**:

1. **Given** an entry `ready` with the descriptor's revision and a store whose node count equals the descriptor's, **When** a client opens, **Then** the store is restored and the data is not fetched.
2. **Given** no entry, an entry `loading`, a different revision, a count mismatch, or an empty store, **When** a client opens, **Then** the entry is written `loading`, the store is reset if not empty, the data is loaded, the indexes are created, and the entry is written `ready` with the revision last.
3. **Given** a leftover `relate-web/<id>.json` from an earlier build, **When** the cache is next opened, **Then** the file is removed and the cache is rebuilt.
4. **Given** a catalog that does not parse, or one whose `loading` write fails, **When** a cache is opened, **Then** the graph loads in memory, the durable store and the file are left as they were, and the page does not fail.
5. **Given** a restore of 5,000 pages, **When** it completes, **Then** its time is within the baseline the core already records, and no request for the data was made.

---

### User Story 5 - A page can list what the origin has stored (Priority: P2)

A site author wants to show what the site has stored, find leftovers, and size them. A listing call returns every entry and every store directory, says which have no counterpart, and optionally reports each store's size and last change, without opening any store, even while another tab holds one.

**Why this priority**: the missing listing is the visible cost of the old records; it is not needed for a graph to work.

**Independent Test**: create an application and a cache, add an unregistered directory and delete another store's directory, then list and compare.

**Acceptance Scenarios**:

1. **Given** an application graph and a cache, **When** the page lists, **Then** each item says its kind, name, state, version or revision and whether its store exists.
2. **Given** a store directory with no entry, **When** the page lists, **Then** it is reported `unregistered`.
3. **Given** an entry whose directory is gone, **When** the page lists, **Then** it is reported `missing`.
4. **Given** a request for sizes, **When** the page lists, **Then** each store reports a size and last-modified time from its files, and a listing without the request reads no store files.
5. **Given** one store held by another tab, **When** the page lists, **Then** the listing succeeds for every store and opens none.

---

### User Story 6 - A page can remove a graph or reset the catalog (Priority: P2)

A visitor asks the application to clear its data, or a site author removes a leftover. The page removes a graph by name; the core removes the directory and the entry, intent first. If the graph is held by another tab, the call is refused and nothing is lost. If the catalog itself is damaged, a reset call deletes it so applications can open again.

**Why this priority**: it completes the listing and gives the page the "clear everything" call RFC-007 asks for, and it is the recovery for a damaged catalog.

**Independent Test**: remove a graph, remove a held graph, remove under a concurrent entry change, corrupt the catalog and reset it.

**Acceptance Scenarios**:

1. **Given** an idle cache, **When** the page removes it, **Then** the directory and the entry are gone.
2. **Given** an application graph, **When** the page removes it without saying it is an application graph, **Then** the call is refused; with it, the data is discarded and the result reports what was discarded.
3. **Given** a store held by another tab, **When** the page removes it, **Then** the call rejects with `locked` and the entry is as the holder left it.
4. **Given** a holder that writes a new entry state while a removal is in progress, **When** the removal fails on the held files, **Then** the holder's newer entry stands and the removal does not overwrite it.
5. **Given** a catalog that does not parse, **When** a client opens an application, **Then** it fails with `store-unreadable` naming the catalog; after the page resets the catalog, a store with data and no entry fails `store-unmarked` and `resetApplication()` or an import recovers it.
6. **Given** any run, **When** the core acts on its own, **Then** it removes only a stale cache and a leftover stored-copy file, never an application graph, and applies no age or count limit.

---

### User Story 7 - Existing checks pass and the decisions are amended (Priority: P2)

The change touches the core's open path for both kinds of graph. The existing core and application suites pass, ADR-009 and ADR-003 record what was replaced, and the README describes the catalog.

**Why this priority**: the lifecycle is the core's most consequential code; a regression there loses data.

**Independent Test**: run the core, application and adapter suites; read the two ADRs and the README.

**Acceptance Scenarios**:

1. **Given** the change, **When** the core's unit and browser suites and the application suites run, **Then** they pass, with only the tests that asserted the marker or the stored-copy file replaced by catalog equivalents.
2. **Given** each adapter, **When** its tests run, **Then** they pass unchanged.
3. **Given** ADR-009 and ADR-003, **When** read, **Then** each has a dated amendment: ADR-009 records the marker replaced and `store-lost` added; ADR-003 records the stored copy replaced by the entry.
4. **Given** the package README, **When** read, **Then** it describes the catalog, the new failure, the listing, removal and reset calls, and what a full clear looks like to the page.

---

### Edge Cases

- A full origin clear removes the entries and the stores together; a cold start then finds no entry and no data and opens a first run, applying the seed. The page cannot tell this from a first visit (SPIKE-010); the README says so.
- An application whose seed is empty cannot detect later loss of the records the visitor added (`seeded: false`); it opens the empty store as valid.
- Two applications on one origin that choose the same name share a store and an entry; the catalog cannot tell them apart (RFC-007 7.3, out of scope).
- A catalog write fails (the file storage errors) mid-lifecycle; the operation stops, the entry still names the earlier state, and the next open recovers or reports.
- A crash during the catalog's own replace leaves the previous catalog, which still names the state the operation started from.
- A removal races an open of the same store from a third tab; the opening tab finds `removing` and holds the store before finishing it.
- The `relate/` directory does not exist yet (nothing stored); listing returns an empty list.
- A store directory holds files from a different engine layout; listing reports the directory's name and the size it can read, and the removal uses only the directory name.
- Power loss or an operating-system crash is not tested; durability and atomicity are claimed only for the worker being stopped and the tab being closed.
- A tab holds a store while a clear removes its files; the holder's next write fails with the engine's error, and the next open classifies the store (SPIKE-010).

## Requirements *(mandatory)*

### Functional Requirements

**The catalog file**

- **FR-001**: The core MUST keep one JSON file, `relate-web/catalog.json`, in the origin-private root beside the engine's `relate/` directory, holding `format` (1) and `graphs`, a map from store name (`app-<name>`, `rel-<id>`) to an entry.
- **FR-002**: An entry MUST carry `kind` (`application` or `cache`), `name`, `state` and `updatedAt`; an application entry MUST carry `version` and `seeded`, and a `migrating` entry `target`; a cache entry MUST carry `revision`. The file MUST NOT record when a graph was last opened.
- **FR-003**: `state` MUST be `ready`, or, for an application, `seeding`, `migrating`, `importing`, `resetting` or `removing`, or, for a cache, `loading` or `removing`.
- **FR-004**: The core MUST NOT write, read, skip or reject the `_RelateApplication` label: export, import and the migration range helper MUST NOT treat it specially, a seed containing it MUST load as any label, and the core MUST NOT write the stored-copy file `relate-web/<id>.json`.

**Writing and ordering**

- **FR-005**: Every read and write of the catalog MUST go through the Web Lock `relate-web:catalog`, exclusive for writing and shared for reading. A write MUST be a read-modify-write inside the exclusive lock that applies one change and replaces the file; the lock MUST be held for the replace only, never for the data operation it brackets.
- **FR-006**: The replace MUST write through a writable stream so the file is swapped on close, and MUST fall back to a synchronous access handle where the stream is absent.
- **FR-007**: A lifecycle operation MUST write its intent to the entry before it changes data and its outcome after, as in ADR-010 §2.2: first run `seeding` then `ready`; migration `migrating` (with `target`) then `ready` after each version's last statement; import `importing` then `ready` with the envelope's version (then `migrating` if below the code's); `resetApplication()` `resetting` then `ready`; cache load `loading` then `ready` with the revision; removal `removing` then the entry deleted. The worker MUST perform lifecycle writes, and only the tab holding a store MUST write that graph's entry, except removal. Messages that use the store (queries, scoped data, export, import) MUST run one at a time in arrival order, so no request runs inside an import.
- **FR-008**: A migration MUST record `version` after each version's last statement so a failed migration resumes from the last completed version.
- **FR-009**: Where the browser offers the file storage without Web Locks, the core MUST treat storage as unavailable and apply the `onUnavailable` rule.

**Opening an application graph**

- **FR-010**: After the bounded retry for the store, the core MUST classify the entry and the store's node and index counts as follows, and MUST leave the store untouched for every failure:

| Entry | Store | Outcome |
|---|---|---|
| none | empty | first run: `seeding`, seed, indexes, `ready` |
| none | has nodes or indexes | `store-unmarked` |
| `seeding` | any | reset and seed again |
| `resetting` | any | reset and seed again |
| `importing` | any | `import-interrupted` |
| `removing` | any | finish the removal, then first run |
| `migrating`, `target` above the code's version | any | `store-newer` |
| `migrating` | any | resume migrations from `version` |
| `ready`, version equal | has nodes or indexes, or `seeded: false` | open |
| `ready`, version below the code's | has nodes or indexes, or `seeded: false` | migrate |
| `ready`, version above the code's | any | `store-newer` |
| `ready`, `seeded: true` | empty | `store-lost` |

- **FR-011**: `store-lost` MUST be a new failure reason, documented with the others, whose recovery is `resetApplication()`. A catalog whose `format` is above the one the code knows MUST fail every application open with `store-newer` and leave everything unchanged.
- **FR-012**: A catalog file that does not parse as JSON, or lacks `format` or `graphs`, MUST fail every application open with `store-unreadable` and a message that names the catalog.
- **FR-013**: A store holding a node labelled `_RelateApplication` and no entry MUST fail with `store-unmarked` and a message that names the node.
- **FR-014**: `resetApplication()` MUST be the only call that discards an application's data besides the `seeding` and `resetting` recoveries and removal; the core MUST NOT reset a `ready` store or one it cannot classify.

**Opening a cache**

- **FR-015**: A cache entry `ready` with the descriptor's revision and a store node count equal to the descriptor's `data.nodes` MUST restore with no fetch of the data. Any other case (no entry, `loading`, `removing`, a different revision, a count mismatch, an empty store) MUST write `loading`, reset the store if not empty, load the data, create the indexes, and write `ready` with the revision last. When the catalog cannot be read, or cannot take the `loading` write, the core MUST leave the durable store and the file as they are and load the graph in memory; it MUST NOT fail the page.
- **FR-016**: A leftover `relate-web/<id>.json` MUST be removed when its cache is next opened.

**Listing, removal and reset**

- **FR-017**: The core MUST export a catalog interface with three calls (names chosen at implementation): list, remove and reset.
- **FR-018**: List MUST return the entries and the stores present in `relate/`, each with kind, name, state, version or revision and whether its store exists; MUST report a directory with no entry as `unregistered` and an entry with no directory as `missing`; MUST, on request only, add a store's size and last-modified time from its files; MUST open no store; and MUST succeed while another tab holds a store.
- **FR-019**: Remove MUST take a store name (with or without an entry), write `removing`, remove the directory `relate/<store>`, then delete the entry. When the files are held it MUST reject with `locked` and MUST restore the entry only if it still says `removing` with the `updatedAt` this call wrote, checked and written inside one exclusive lock. Removing an application graph MUST require the caller to state it is one, and the result MUST report what was discarded.
- **FR-019a**: Removal MUST check the stated kind against the store's name before it reads the catalog, so that removing an application graph's data always takes an explicit `application`; two removals of one store MUST NOT overlap (a lock of its own, never the catalog lock held across a directory operation); and an entry that is present but not valid MUST be deleted with the store after a successful removal, unless it was written again meanwhile.
- **FR-020**: A tab that opens a store and finds `removing` MUST hold the store before finishing the removal.
- **FR-021**: Reset MUST delete `catalog.json` and nothing else.
- **FR-022**: The core MUST remove a graph by itself only for a stale cache and a leftover stored-copy file; it MUST NOT remove an application graph and MUST apply no age or count limit.

**Checks and packaging**

- **FR-023**: The core's tests MUST cover, in Chromium, Firefox and WebKit: two or three tabs writing the catalog losing no update; the catalog readable while another tab holds a store; every row of FR-010; interrupted seeding, migration, import, reset and removal; `store-lost` after the catalog is kept and the store directory removed; an empty-seed application opening; a corrupt catalog failing applications and the reset call recovering; cache restore, rebuild and legacy file removal; list reporting `unregistered` and `missing`; remove rejecting while held and restoring correctly under a concurrent entry change; and the import window no longer seeding over an empty store.
- **FR-024**: The core's existing tests MUST pass, with only the tests that asserted the marker node or the stored-copy file replaced by catalog equivalents; every adapter's tests MUST pass unchanged.
- **FR-025**: ADR-009 MUST receive a dated amendment recording the marker replaced and `store-lost` added, and ADR-003 one recording the stored copy replaced by the entry. `specs/006-application-graphs/spec.md` MUST gain a note that FR-006 to FR-009 and FR-027 are superseded where they name the marker or the cache's stored copy.
- **FR-026**: The package README MUST describe the catalog, the entry states, `store-lost`, the three calls, what a full clear looks like to a page, and the empty-seed limit.
- **FR-027**: Every behaviour stated here with MUST MUST have an automated test tagged with its requirement or scenario, and the repository's trace check MUST report any untagged requirement.

### Key Entities

- **Catalog**: the single file of entries, one per persisted graph, per origin.
- **Entry**: one graph's record: kind, name, state, version or revision, `seeded`, `target`, `updatedAt`.
- **State**: `ready`, or an in-progress state naming the operation that was started and not confirmed finished.
- **Store**: the browser's private file storage holding one graph, named `app-<name>` or `rel-<id>`.
- **Listing item**: an entry, a directory, or both, with `unregistered` or `missing` where one is absent.
- **Catalog lock**: the Web Lock `relate-web:catalog` that orders every catalog read and write.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A count of all nodes in an application graph equals the seed's nodes plus the visitor's records, in all three browsers, in every run; no bookkeeping node exists.
- **SC-002**: Three tabs each making 100 catalog changes at once end with all 300 changes present, in all three browsers, in every run of the test.
- **SC-003**: A reader reading the catalog in a loop while a writer replaces it 300 times sees no torn, missing or failed read, in all three browsers.
- **SC-004**: Every row of the classification in FR-010 yields its stated outcome and leaves the store unchanged for every failure, in every run.
- **SC-005**: An interrupted import never seeds over an empty store: after a crash between the reset and the load, the next open fails with `import-interrupted` and the store is unchanged, in every run.
- **SC-006**: An interrupted and resumed migration ends with the same data as an uninterrupted run, in every run.
- **SC-007**: A listing of the stores without sizes opens no store and succeeds while another tab holds one; with sizes, a listing of 10 stores is recorded with method and environment, and anything not measured is labelled unmeasured.
- **SC-008**: A restore of 5,000 pages completes within the load-time baseline the core already records, with no request for the data, in all three browsers.
- **SC-009**: The core's existing suites pass (apart from the replaced marker and stored-copy tests), every adapter's tests pass unchanged, and ADR-009 and ADR-003 each have a dated amendment.

## Assumptions

- **Environment**: desktop Chromium, Firefox and WebKit, the same as the core's tests (WebKit in a persistent profile, since its default context has no origin-private storage). Mobile browsers, power loss, quota exhaustion and real eviction are not covered and are labelled unmeasured.
- **Governing decisions**: ADR-010 (this feature), ADR-001, ADR-003 and ADR-009 and the project constitution. Where this specification differs from an ADR, the ADR wins until it is amended.
- **Engine**: used through its package interface. It has no call to list or delete stores, or to hold per-store metadata; those requests are raised separately and nothing here patches around them. Removal uses only the directory name `relate/<store>`.
- **Evidence**: SPIKE-009 measured a catalog file read and replaced from every tab beside an open store, lost updates without a lock and none with it, and an interrupted swap leaving a whole file in 60 of 60 runs; SPIKE-010 measured that a clear removes stores and catalog together; SPIKE-011 measured directory listing, sizes and cost (about 5 ms per store in Chromium, 20 to 25 ms in Firefox and WebKit). Single runs on one machine.
- **Not measured**: power loss; the catalog under many tabs writing for long periods; Firefox and WebKit clearing; a names-only listing cost; stores larger than 20,000 nodes in listing size.
- **Unpublished core**: version 0.0.0, so no deployed store carries the old forms and no adoption path is built.
- **Out of scope**: adopting old marker or stored-copy stores, an engine-held metadata record or ontology support, last-opened tracking, a change event for the catalog, a visitor-facing interface, naming collisions between applications (RFC-007 7.3), adapter helpers for the catalog, and engine changes.
- **Names**: the package is `@relate/web`; the catalog file is `relate-web/catalog.json`; the lock is `relate-web:catalog`; the store prefixes `app-` and `rel-` are unchanged.
