---
id: ADR-009
title: Application Graphs in the Core as a Named Durable Store with Schema Versions
status: accepted
rfcs: [RFC-006, RFC-001]
created: 2026-11-08
---

# ADR-009: Application Graphs in the Core as a Named Durable Store with Schema Versions

## 1. Context

The core package hosts the embedded database in a dedicated worker and offers one kind of durable storage: a copy of a site's graph in the browser's origin-private file storage. That copy is a cache. It is named after the graph descriptor's `id`, it is wiped and refilled when the descriptor's `revision` changes, it exists only when the graph has a descriptor, and under client-side routing it is off unless the site asks for it. A site that ships a new seed file would erase an application's records if it used this store for them.

An application graph, the database behind an application whose data the visitor writes, needs the opposite lifecycle: the seed applies once, a release carries stored data forward, and losing the store loses the visitor's work. The engine's browser store (`opfs://<name>`) already supports it. A browser spike (SPIKE-008) measured the following on Chromium, Firefox and WebKit:

- No acknowledged write was lost in 24 runs that terminated the worker or closed the tab mid-write, and ids were gap-free after recovery.
- A second holder is refused within 1 to 3 ms with `storage locked: opfs://<name>`. The store is free about 0.1 to 0.5 s after an idle holder closes, and about 3 s after a busy Chromium worker is terminated.
- A store keeps 65 files at every size tried (up to two million nodes, 424 MB). Opening takes 0.3 to 0.4 s at 100,000 nodes.
- A name is one segment of 1 to 64 characters from `[A-Za-z0-9_-]`; two names on one origin are independent.
- A bulk statement of the form `MATCH (n:L) SET …` over 300,000 nodes, terminated part-way, left 50,000 updated; the same statement with a `WHERE` clause left none, and a series of range statements is resumable.
- `persist()` was refused in Chromium and WebKit and waited on a prompt in Firefox.
- The engine's JavaScript surface has no call to trigger a checkpoint, report size or export a snapshot. The graph data format (ADR-002) cannot carry integers beyond 2^53, whole-number floats, dates, durations, points or empty lists, and requires a string `id` on every node.

What is missing is a contract in the core: a store that is not a cache, a version, a policy for each way a store can be unavailable, and a safe path out. RFC-006 describes the need. This ADR settles its open questions on the tab policy (7.1), the migration mechanism (7.2), one instance or two (7.3), unavailable storage (7.4), the export format (7.6), requesting persistence (7.7) and store names (7.9). It leaves open the engine requests (7.5, 7.12), reporting a damaged store (7.8), quota (7.10) and privacy on shared devices (7.11). The first consumer is the react-admin starter (ADR-008).

## 2. Decision

### 2.1 Application mode

`createClient` accepts an `application` option in place of a graph source: `{ name, version, seed, indexes, migrations, onUnavailable, onError, whenLocked }`.

- `name` is the application's name. The core validates it against `[A-Za-z0-9_-]{1,60}` and throws at creation if it fails. The store is named `app-<name>`, which keeps application stores apart from the cache stores (`rel-<id>`). Two applications on one origin that choose the same name share data; the name is the application's to choose.
- `version` is a positive integer, the schema version the code expects.
- `seed` is a graph data document, or a descriptor, loaded once (ADR-002, ADR-003). Indexes come from the descriptor, or from an `indexes` option when the seed is a plain document (ADR-003). The engine's store keeps its indexes, so they are created on first run only. A migration that needs a new index creates it with an ordinary statement in its list.
- `migrations` is described in 2.3.
- `onUnavailable` is `"memory"` (default) or `"fail"`; `onError` is `"fail"` (default) or `"memory"`; `whenLocked` is `"wait"` (default) or `"memory"`.

Application mode is independent of the navigation profile. The instance's lifetime still follows the profile (ADR-001): one for the visit under client-side routing, one per page under multi-page navigation, reopening the same store each time.

### 2.2 Lifecycle

The store records its state in one node, labelled `_RelateApplication`, with `format` (1), `version` and `state` (`seeding`, `ready` or `importing`). The label belongs to the core and is documented as reserved. The core does not intercept application statements, so it cannot prevent one from deleting the marker; a seed that contains the label is rejected at load. The marker is an ordinary node: queries return it, and the documentation says so. Export, import and the migration range helper skip nodes with this label.

1. **Open** with the bounded retry of ADR-001 (100 ms rising to 500 ms, up to 5 s).
2. **No marker, store empty**: first run. Create the marker with `state: "seeding"`, load the seed as ordinary nodes (not as the page-scoped data of ADR-001, which is dropped on departure), create the indexes, then set `state: "ready"` as the last statement.
   **Marker with `state: "seeding"`**: an interrupted first run. No visitor data can exist, since the application was never ready; the core resets the store and seeds again.
   **Marker with `state: "importing"`**: an interrupted import (2.5). The client fails with `import-interrupted` and leaves the store as it is.
   **Data but no marker**: the client fails with `store-unmarked` and leaves the store as it is. This is also the state after an application statement deleted the marker. Only `resetApplication()` clears it.
3. **Marker `ready` and equal to `version`**: ready; no replay, no seed.
4. **Marker `ready` and below `version`**: run the migrations in order (2.3), then ready.
5. **Marker above `version`**, or a marker `format` above the one the code knows (an older code version running against newer data): the client fails with the diagnostic `store-newer` and does not touch the store.
6. **Reset** happens only through an explicit call, `client.resetApplication()`, which resets the store and seeds again, and through the `seeding` recovery above. The core never resets a store with a `ready` marker or one it cannot classify.

A replaced worker (ADR-001) reopens the same store through step 1 and continues. Under multi-page navigation the departing page closes the store from `pagehide` so the next page does not find it locked; a busy Chromium worker can still hold it for about 3 s, which the next page's retry absorbs.

### 2.3 Migrations

`migrations` maps a target version to an ordered list of Cypher statements: the entry for `3` takes a store at version 2 to version 3. For each version from the stored one to `version`, the core runs the statements in order and then sets the marker's `version` to that target, as the final statement. If a statement fails, the client fails with a diagnostic naming the version and statement, and the store stays at the last completed version; a retry resumes from there.

The core cannot make a migration atomic. A statement over many nodes can be partly applied if interrupted, so the rule for authors, stated in the package's documentation and enforced by tests of the package's own helpers, is: bounded steps, each with a `WHERE` that makes it safe to run again, and the version written last. The package ships one helper that runs a statement over successive bounded ranges of a numeric property of one label, each range filtered so that running it again is harmless. The statement template's placeholder syntax, whether bounds are inclusive, and how string ids are ranged (ADR-002 ids are strings, so a numeric property is the first supported key) are settled at implementation.

### 2.4 What the page can learn

The client has a `storage` property and an event for changes to it: `{ kind: "durable" | "memory" | "waiting", reason?: "unavailable" | "locked" | "error", persisted: boolean | null }`.

- **Unavailable** (the browser offers no store): with `onUnavailable: "memory"` (default) the instance runs in memory, loading the seed on each start, `storage.kind` is `"memory"` and the reason is `unavailable`; with `"fail"` the client fails.
- **Open error** (an error other than a lock on a store that should exist, possibly a damaged one): the client fails with `store-unreadable` and the engine's message, and leaves the store alone. The page can offer an export attempt and `resetApplication()`. Memory is entered on an error only when the application sets `onError: "memory"`; the default never hides existing data behind a fresh seed.
- **Locked after the bounded retry** (this replaces ADR-001's in-memory fallback for application mode): with `whenLocked: "wait"` the client stays `loading`, `storage.kind` is `"waiting"` with reason `locked`, and it retries every second until the holder lets go; queries made meanwhile stay pending and do not reject. With `"memory"` it runs in memory with reason `locked`.
- `persisted` follows `navigator.storage.persisted()`, and is `null` where the browser offers no such call. The core never calls `persist()`. `client.requestPersistence()` calls it, returns a promise, and never delays startup; the application calls it from a user action.
- `client.storageEstimate()` returns the browser's usage and quota.

A client in memory never writes to the store, and never turns into a durable one without a new client.

### 2.5 Export and import

`client.exportApplication({ allowLoss })` reads all nodes and relationships and returns `{ envelope, losses }`. The envelope is `{ format: "relate-application-export", version: 1, application: { name, version }, document }`, where `document` is an ADR-002 graph data document. Node values in the result envelope carry labels and properties but no property types, and numbers pass through JSON, so the exporter reads each label's properties with typed queries and uses the result's per-column `columnTypes` (INTEGER, FLOAT, date and so on) to detect losses. Integers beyond 2^53 are detected by reading the value as text. The exporter reads in batches, not one envelope per statement, but the returned envelope is held whole in memory, so export has a practical size limit that is measured at implementation. `losses` lists what the format cannot carry, by kind and count: integers beyond 2^53, whole-number floats, dates and durations, points, empty lists, and nodes without a string `id`. Without `allowLoss: true` the call rejects when `losses` is not empty.

`client.importApplication(envelope)` rejects an envelope whose application name differs or whose version is above the code's, and otherwise validates the whole document first, then sets the marker to `state: "importing"`, resets the store, loads the document, writes the marker with the envelope's version and `state: "ready"`, and runs any migrations to the current version. An interruption leaves the `importing` marker, handled in 2.2. The page should export the current data first; `importApplication` does not do so. It is explicit and is never invoked by the core.

### 2.6 Content graphs and application graphs together

A page that needs both uses two clients, each with its own instance and store: the content graph as before (a cache store keyed by the descriptor) and the application graph in application mode. Statements do not span the two. One instance holding both in separate namespaces is not decided here.

### 2.7 Checks

The package's tests, in all three browsers, cover: a worker terminated and a tab closed mid-write leave every acknowledged write and no gaps; a second tab waits and then proceeds after the first closes; a client in `memory` does not write to the store; export skips the marker; the marker's `ready` state is written last, and an interrupted first run seeds again; a store whose marker was deleted by an application statement fails with `store-unmarked` and keeps its data; an interrupted import fails with `import-interrupted`; an open error on an existing store fails with `store-unreadable` and does not enter memory by default; a marker above the code's version fails with `store-newer` and leaves the data; a migration whose statement is interrupted resumes at the last completed version and ends with the same data as an uninterrupted one; `resetApplication` is the only path that discards data; names outside the rule throw; the export reports each kind of loss and rejects without `allowLoss`; import then export of a graph the format can carry is identical; the departing page releases the store so the next page of a multi-page site opens it within the retry; and restoring an application store of a given size takes no longer than restoring a content store of that size (a measurement recorded with the tests). Test names carry the identifiers of the requirements they cover.

## 3. Alternatives Considered

- **A "persist" flag on the existing cache.** Rejected: the cache's staleness test wipes the store on a new revision and its name comes from a descriptor, so the flag would pair a destructive lifecycle with a durable one and make the destructive one the default.
- **One instance with the content graph in a namespace.** Not chosen yet: the namespace support was not tested in the browser build, and two instances are available now with no engine dependency. It stays a candidate if applications need statements across both graphs.
- **Run in memory by default when the store is locked.** Rejected: a second tab would write data the visitor believes is saved and then lose it. Waiting is the default; falling back is an explicit choice.
- **Keep the schema version outside the graph** (in another browser store). Rejected: a store restored, reset or copied would disagree with its marker; a marker in the graph travels with its data.
- **Declarative schema migration.** Rejected: the engine has no schema model for labels and properties to diff against; a migration is a list of statements.
- **Migrate by export, reset, transform and import.** Not chosen as the mechanism: it needs a complete, lossless export, which does not exist (2.5), and it rewrites every record for a small change. It stays available to an application that wants it, through `exportApplication` and `importApplication`.
- **The core calls `persist()` itself.** Rejected: the request waited on a permission prompt in Firefox and was refused in Chromium and WebKit, and a prompt belongs to a user action the application chooses.
- **Down-migrations, or opening a newer store with older code.** Rejected: nothing in the engine can check that older code understands newer data, so an older version fails with `store-newer` and leaves the store as it is.
- **Export through the engine's snapshot.** Not possible: the browser build cannot produce one. It is raised as a request in 4.

## 4. Consequences

- A page that needs the content and application graphs together holds two instances, with two copies of the engine in memory and no statement across them.
- Several tabs of one application do not work at once: later tabs wait. An elected owner serving the others is a candidate for a later decision if applications need it.
- Migration safety is by convention and tests. The core can supply `inRanges`, not atomicity.
- Export refuses by default when the format would lose data, and an application with such values has no complete backup until a richer format or an engine snapshot export exists. This is a request to raise with the engine's maintainers, along with a call that triggers a checkpoint and reports store size; neither exists in the browser build, and the long-run stalls in SPIKE-008 (up to 421 ms) are unexplained.
- Not measured: durability across power loss or an operating-system crash; Firefox and WebKit beyond 100,000 nodes; what a write does when the quota is exceeded; the time to migrate a large store.
- To confirm at implementation and amend this ADR with the results: that typed reads detect each kind of loss in 2.5 (the engine documents `columnTypes` per column; its behaviour for a property that holds mixed types across nodes, and large integers, is not yet checked); the reopen sequence after a replaced worker in Chromium, where a busy terminated worker holds the store for about 3 s; and what the 5 s retry should be in application mode.
- Follow-up work: adapters' helpers for application graphs; ADR-008's starter (which waits on this decision); a decision on one instance with namespaces; a decision on several tabs.

## 5. Related

- RFCs: RFC-006, RFC-001
- ADR-001 (hosting, the cache store, profiles, retry), ADR-002 (the graph data format), ADR-003 (the descriptor), ADR-008 (the first consumer)
- SPIKE-008 (the measurements)

## 6. Amendments

### 2026-11-09, planning the implementation (specs/006-application-graphs)

- **Typed detection reads each value, not each column (amends 2.5).** The engine's `columnTypes` names one type per column from one row. A column holding an integer, a string and a float reported `INTEGER`, so a property whose type differs across nodes cannot be classified from it. Reading `valueType(n[k])` and `toString(n[k])` for each key of each node returns the type of every value and the exact text of an integer: `9007199254740993` read as a number came back as `9007199254740992`, and as text came back exact; `2.0` read as a number came back as `2` and as text as `2.0`; `[]` is `LIST<NOTHING>`, a date is `DATE`, a datetime `ZONED DATETIME`, a duration `DURATION`, a point `POINT`. Every loss kind in 2.5 is detected this way. One run on Node 24.14.1 with `@relate/relate-wasm` 0.16.1 in memory; details in `specs/006-application-graphs/research.md` (P-1). The "to confirm" item in section 4 about typed reads is therefore answered for the listed kinds; lists whose elements are themselves losses, and nested values, remain to be tested at implementation.
- **Range helper syntax (settles 2.3).** A migration step is a Cypher string or a plain-data range step made by `inRanges({ label, property, step, statement })`. The statement carries `$from` (inclusive) and `$to` (exclusive) and the author's own filter that makes a rerun harmless; the property is numeric; the helper reads its minimum and maximum over the label, skips the marker, and walks windows of `step`.
- **Lifecycle failures are not retried.** `store-unmarked`, `store-newer`, `import-interrupted`, `store-unreadable`, a failed migration, and `unavailable` with `onUnavailable: "fail"` fail the client at once, without the core's three-attempt rule of ADR-001, because a repeat cannot change the answer. `retry()` still starts again.

### 2026-11-09, implementation (packages/web, specs/006-application-graphs)

Figures are single runs on one machine (macOS arm64, Playwright's Chromium, Firefox and WebKit, 2026-11-09); the recorded runs are in `packages/web/reports/application-*.json` when the suite is run.

- **The reopen sequence after a replaced worker (answers a section 4 item).** A statement that ran past its timeout with the worker busy made the client replace the worker: `status` went `recovering` at the timeout (300 ms) and `ready` again after 2.58 s in Chromium, 0.43 s in Firefox and 4.67 s in WebKit, with no `waiting` report in any of them (the store opened inside the bounded retry). WebKit's time is close to the 5 s budget, so a slower machine can enter the waiting loop; the loop is what absorbs it.
- **The retry duration in application mode (answers a section 4 item).** The 5 s bounded retry of ADR-001 is kept for the first attempts. After it, a locked store is retried every second. A second tab that found the store held reported `waiting`/`locked` after 5.1 to 5.2 s and was `ready` 1.0 to 1.1 s after the first tab closed (the one-second poll dominates). A tab that closed while its worker was running a long statement released the store in 0.06 to 0.12 s for the next client in all three browsers, so the busy-worker hold of about 3 s seen in SPIKE-008 happens when the worker is terminated from the page, not when the tab closes.
- **Indexes persist.** An index created on first run, and one created by a migration statement, was present and `ONLINE` after the store was reopened, once each, in all three browsers. Whether a query uses the index after a reopen was not shown: the engine's `readCount` for the index stayed 0 after a lookup, so that is unmeasured.
- **Typed reads (the section 4 item, completing the 2026-11-09 planning entry).** The per-value reads gave the expected type and exact text for every kind in all three browsers' engine, including a property that was an integer, a string and a float on three nodes, an integer beyond 2^53, a whole-number float, a date, a duration, a point, an empty list and a numeric `id`. Further, the store cannot hold maps, lists of mixed types or nested lists (the engine refuses them with `InvalidPropertyType`), so those never reach an export and no loss kind is added for them. A list of one kind is carried: a list of floats is a loss only when every element is whole (a list with any fractional element is written back as floats), a list of integers only when an element is beyond 2^53, a list of dates or durations is counted under `date` or `duration` and written as text, and a list of points is left out and counted under `point`. Lists were not named in 2.5; this is the behaviour it needs.
- **Opening errors.** An absent origin-private file system (no `navigator.storage.getDirectory`, or it throws) is `unavailable`. Any other open error is `store-unreadable`: a store whose files were overwritten with junk failed to open with the engine's text `storage error: corrupt OPFS catalog` in Chromium, Firefox and WebKit, so the two are distinguishable by the feature test, not by message. WebKit's default (ephemeral) context has no file system and the client ran in memory with reason `unavailable`.
- **Persistence request.** `persist()` was refused in Chromium and WebKit and stayed pending on a permission prompt in Firefox (not answered here), as SPIKE-008 found; `ready` was not delayed in any of them.
- **A restore does not fetch the seed (amends 2.2).** The first implementation fetched a descriptor's data before opening the store, so a restore downloaded the whole seed it then ignored; restoring took 4 to 13 % longer than a content store of the same size. The seed is now fetched only when the store needs it (first run, `seeding` recovery or reset), and a ready store is classified from its marker alone, without scanning the nodes. Medians of five restores after the first load, application store against content store: Chromium 92.7/92.8 ms (1,000 nodes), 214.2/215.2 (5,000), 664/667 (20,000); Firefox 146/148, 282/285, 731/738; WebKit 142/144, 243/250, 629/647. Restores are now equal within a few per cent in every size.
- **Export order and import's one gap (clarifies 2.5).** The export sorts nodes by `id` and links by source, target, type and properties, so export, import and export give the same document; the engine's element ids differ between a store and its import and would otherwise reorder it. Import runs `reset` and then writes the new marker as two separate steps; a termination between them leaves an empty store with no marker, which opens as a first run and seeds again. The `importing` marker covers every other interruption. Closing the gap needs a reset that keeps a marker (an engine request, below).
- **Review changes (2026-11-09, pull request 1).** The classifier checks the marker's fields before it acts: missing or non-positive-integer `format`, `version` or `state` is `store-unreadable`, and a marker above the code's format or version is `store-newer` in every state, so older code never resets a newer release's `seeding` store. A migration list must have an entry for every version from the stored one to the application's; a missing entry fails with `migration-failed` and the version is not advanced. A migration step that changes the marker (any property, or deletes it) is failed and the marker is put back, which is how the rule that migrations skip the marker is enforced for statements the core cannot parse. A seed given as a URL is passed to the worker unresolved and fetched only when the store needs it, so a restore downloads nothing. A reset asked for by `resetApplication()` stays a reset until the instance is ready, so a retry of a failed reset resets. A page hidden while its client is still starting does not create a worker.
- **Interrupted imports.** In Firefox and WebKit a page left during a 20,000-node import left `importing` and the next open failed `import-interrupted`; `resetApplication()` recovered. In Chromium the import finished before the cut. The interruption is also tested deterministically in Node.

**Engine gaps found, for raising upstream and not worked around (RFC-006 7.5, 7.12):**

1. No call in the browser build to trigger a checkpoint or to report a store's size.
2. No snapshot export in the browser build, so an export reads through Cypher and cannot carry points, dates, durations, whole-number floats, empty lists or integers beyond 2^53 in the graph data format.
3. No reset that keeps a given node (see the import gap above).
4. The occasional write stalls of 35 to 421 ms seen in SPIKE-008 remain unexplained; the durability runs here did not look for them.
5. `readCount` in `SHOW INDEXES` stayed 0 after an indexed lookup, so a page cannot confirm that a query used an index.

### 2026-11-10, the catalog replaces the marker (ADR-010, specs/007-graph-catalog)

ADR-010 records every persisted graph in one catalog file (`relate-web/catalog.json`), and the core now keeps an application's format, version and state there instead of in a node of the graph. What changes in this ADR:

- **2.2, the record (replaced).** The `_RelateApplication` node is no longer written, read, reserved or skipped. The state lives in the application's entry: `kind`, `name`, `state` (`ready`, `seeding`, `migrating`, `importing`, `resetting`, `removing`), `version`, `seeded` and `updatedAt`. The lifecycle table of 2.2 is ADR-010 2.3: the classifier reads the entry and the store's node and index counts, and the counts only when the classification needs them. A seed that contains the old label loads like any label; the range helper no longer skips anything; export and import no longer filter it. A store with that node, no entry and data fails `store-unmarked` with a message naming the node. Nothing of an earlier form is adopted (the package is unpublished).
- **Intent first (clarifies 2.2).** Every operation writes its state to the entry before it changes data, and `ready` after: first run (`seeding`), migration (`migrating` with `target`, `ready` after each version), import (`importing`), `resetApplication()` (`resetting`). A `resetting` entry continues on the next open: the store is reset and seeded again. A `removing` entry is finished by a reset and then a first run. A seed that is invalid is refused before the entry is written, so no `seeding` entry is left behind (the 2026-11-09 text that left the marker `seeding` is superseded).
- **2.4, a new failure reason.** `store-lost`: the entry is `ready` with `seeded: true` and the store is empty (a statement deleted every node, or a clear spared the catalog). Nothing is touched; `resetApplication()` recovers it. An application whose seed had no nodes records `seeded: false` and its empty store opens as valid, so it cannot detect later loss. `store-unmarked` now means data and no entry; `store-unreadable` also covers a catalog that does not parse and a malformed entry; `store-newer` also covers a catalog `format` above the code's. A catalog that is unreadable or newer is never written over, so `resetApplication()` cannot recover from it; the way out of an unreadable catalog is the catalog reset.
- **2.3, migrations.** The version is recorded in the entry: `migrating` (`version` n−1, `target` n) before a version's steps and `ready` at n after them. The migration guard that compared and restored the marker, and the authors' rule to exclude it with `WHERE NOT n:_RelateApplication`, are gone: a step that touches every node is valid. A missing migration still fails before anything is written.
- **2.5, the import gap is closed.** Import writes `importing` before the reset, so a crash between the reset and the load fails `import-interrupted` instead of leaving an empty unmarked store that seeds again. The "one gap" of the 2026-11-09 entry no longer exists.
- **Export.** The envelope's application version is the code's version, since a client that is ready has been carried to it.
- **Measured while implementing (specs/007 research R3).** On a restored store in Chromium, Firefox and WebKit, `MATCH (n) RETURN count(n)` and `SHOW INDEXES` took 0.1 ms or less at both 1,000 and 100,000 nodes, while a first-row probe (`LIMIT 1`) grew from about 1 ms to about 80 ms, so the classifier counts. Single runs on one machine (`packages/web/reports/catalog-probe.json`).
- **Verified.** The unit suites (Node, the real engine, an in-memory catalog) and the three-browser suites for the classification rows, interrupted seeding, migration, import and reset, three tabs writing the catalog, and `store-lost`.

The engine gaps listed in the 2026-11-09 entry stand, with two additions the catalog's work found: the engine has no call to list its stores or to delete one (the core lists and removes by the directory name `relate/<store>`), and no per-store metadata slot committed with the data, which would make an entry atomic with its store (ADR-010 leaves that open).

