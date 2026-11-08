---
id: ADR-009
title: Application Graphs in the Core as a Named Durable Store with Schema Versions
status: proposed
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

What is missing is a contract in the core: a store that is not a cache, a version, a policy for each way a store can be unavailable, and a safe path out. RFC-006 describes the need; this ADR decides the core's behaviour. The first consumer is the react-admin starter (ADR-008).

## 2. Decision

### 2.1 Application mode

`createClient` accepts an `application` option in place of a graph source: `{ name, version, seed, migrations, onUnavailable, whenLocked }`.

- `name` is the application's name. The core validates it against `[A-Za-z0-9_-]{1,60}` and throws at creation if it fails. The store is named `app-<name>`, which keeps application stores apart from the cache stores (`rel-<id>`). Two applications on one origin that choose the same name share data; the name is the application's to choose.
- `version` is a positive integer, the schema version the code expects.
- `seed` is a graph data document, or a descriptor, loaded once (ADR-002, ADR-003). Indexes come from the descriptor or from the option, as for any graph.
- `migrations` is described in 2.3.
- `onUnavailable` is `"memory"` (default) or `"fail"`; `whenLocked` is `"wait"` (default) or `"memory"`.

Application mode is independent of the navigation profile. The instance's lifetime still follows the profile (ADR-001): one for the visit under client-side routing, one per page under multi-page navigation, reopening the same store each time.

### 2.2 Lifecycle

The store records its state in one node, labelled `_RelateApplication`, with `format` (1) and `version`. The label is reserved; a seed or an application that creates it is an error.

1. **Open** with the bounded retry of ADR-001 (100 ms rising to 500 ms, up to 5 s).
2. **No marker, store empty**: first run. Load the seed (a loader scope is not used), create the indexes, then create the marker with `version` last. A store that has data but no marker holds an interrupted first run and no visitor data, since the application is not ready until the marker exists; the core resets it and seeds again.
3. **Marker equal to `version`**: ready; no replay, no seed.
4. **Marker below `version`**: run the migrations in order (2.3), then ready.
5. **Marker above `version`** (an older code version running against newer data): the client fails with the diagnostic `store-newer` and does not touch the store.
6. **Reset** happens only through an explicit call, `client.resetApplication()`, which resets the store and seeds again. The core never resets a store that has a marker.

A replaced worker (ADR-001) reopens the same store through step 1 and continues.

### 2.3 Migrations

`migrations` maps a target version to an ordered list of Cypher statements: the entry for `3` takes a store at version 2 to version 3. For each version from the stored one to `version`, the core runs the statements in order and then sets the marker's `version` to that target, as the final statement. If a statement fails, the client fails with a diagnostic naming the version and statement, and the store stays at the last completed version; a retry resumes from there.

The core cannot make a migration atomic. A statement over many nodes can be partly applied if interrupted, so the rule for authors, stated in the package's documentation and enforced by tests of the package's own helpers, is: bounded steps, each with a `WHERE` that makes it safe to run again, and the version written last. The package ships one helper, `inRanges(label, property, from, to, step, statement)`, that expands a statement template over id ranges for this purpose.

### 2.4 What the page can learn

The client has a `storage` property and an event for changes to it: `{ kind: "durable" | "memory" | "waiting", reason?: "unavailable" | "locked" | "error", persisted: boolean | null }`.

- **Unavailable** (no store support, an open error other than a lock): with `onUnavailable: "memory"` the instance runs in memory, `storage.kind` is `"memory"` and the reason is given; with `"fail"` the client fails.
- **Locked after the bounded retry**: with `whenLocked: "wait"` the client stays `loading`, `storage.kind` is `"waiting"` with reason `locked`, and it retries every second until the holder lets go; queries wait with it. With `"memory"` it runs in memory with reason `locked`.
- `persisted` follows `navigator.storage.persisted()`. The core never calls `persist()`. `client.requestPersistence()` calls it, returns a promise, and never delays startup; the application calls it from a user action.
- `client.storageEstimate()` returns the browser's usage and quota.

A client in memory never writes to the store, and never turns into a durable one without a new client.

### 2.5 Export and import

`client.exportApplication({ allowLoss })` reads all nodes and relationships and returns `{ envelope, losses }`. The envelope is `{ format: "relate-application-export", version: 1, application: { name, version }, document }`, where `document` is an ADR-002 graph data document. `losses` lists what the format cannot carry, by kind and count: integers beyond 2^53, whole-number floats, dates and durations, points, empty lists, and nodes without a string `id`. Without `allowLoss: true` the call rejects when `losses` is not empty.

`client.importApplication(envelope)` rejects an envelope whose application name differs or whose version is above the code's, and otherwise resets the store, loads the document, writes the marker with the envelope's version and then runs any migrations to the current version. It is explicit and is never invoked by the core.

### 2.6 Content graphs and application graphs together

A page that needs both uses two clients, each with its own instance and store: the content graph as before (a cache store keyed by the descriptor) and the application graph in application mode. Statements do not span the two. One instance holding both in separate namespaces is not decided here.

### 2.7 Checks

The package's tests, in all three browsers, cover: a worker terminated and a tab closed mid-write leave every acknowledged write and no gaps; a second tab waits and then proceeds after the first closes; a client in `memory` does not write to the store; the first-run marker is written last, and an interrupted first run seeds again; a marker above the code's version fails with `store-newer` and leaves the data; a migration whose statement is interrupted resumes at the last completed version and ends with the same data as an uninterrupted one; `resetApplication` is the only path that discards data; names outside the rule throw; the export reports each kind of loss and rejects without `allowLoss`; and import then export of a graph the format can carry is identical. Test names carry the identifiers of the requirements they cover.

## 3. Alternatives Considered

- **A "persist" flag on the existing cache.** Rejected: the cache's staleness test wipes the store on a new revision and its name comes from a descriptor, so the flag would pair a destructive lifecycle with a durable one and make the destructive one the default.
- **One instance with the content graph in a namespace.** Not chosen yet: the namespace support was not tested in the browser build, and two instances are available now with no engine dependency. It stays a candidate if applications need statements across both graphs.
- **Run in memory by default when the store is locked.** Rejected: a second tab would write data the visitor believes is saved and then lose it. Waiting is the default; falling back is an explicit choice.
- **Keep the schema version outside the graph** (in another browser store). Rejected: a store restored, reset or copied would disagree with its marker; a marker in the graph travels with its data.
- **Declarative schema migration.** Rejected: the engine has no schema model for labels and properties to diff against; a migration is a list of statements.
- **Export through the engine's snapshot.** Not possible: the browser build cannot produce one. It is raised as a request in 4.

## 4. Consequences

- A page that needs the content and application graphs together holds two instances, with two copies of the engine in memory and no statement across them.
- Several tabs of one application do not work at once: later tabs wait. An elected owner serving the others is a candidate for a later decision if applications need it.
- Migration safety is by convention and tests. The core can supply `inRanges`, not atomicity.
- Export refuses by default when the format would lose data, and an application with such values has no complete backup until a richer format or an engine snapshot export exists. This is a request to raise with the engine's maintainers, along with a call that triggers a checkpoint and reports store size; neither exists in the browser build, and the long-run stalls in SPIKE-008 (up to 421 ms) are unexplained.
- Not measured: durability across power loss or an operating-system crash; Firefox and WebKit beyond 100,000 nodes; what a write does when the quota is exceeded; the time to migrate a large store.
- To confirm at implementation and amend this ADR with the results: whether the envelope's node values carry property types, which export needs to detect losses (otherwise the exporter reads each property by a typed query); the reopen sequence after a replaced worker in Chromium, where a busy terminated worker holds the store for about 3 s; and what the 5 s retry should be in application mode.
- Follow-up work: adapters' helpers for application graphs; ADR-008's starter (which waits on this decision); a decision on one instance with namespaces; a decision on several tabs.

## 5. Related

- RFCs: RFC-006, RFC-001
- ADR-001 (hosting, the cache store, profiles, retry), ADR-002 (the graph data format), ADR-003 (the descriptor), ADR-008 (the first consumer)
- SPIKE-008 (the measurements)
