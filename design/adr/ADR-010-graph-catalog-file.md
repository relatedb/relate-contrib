---
id: ADR-010
title: A Catalog File Beside the Stores, Ordered by a Web Lock
status: accepted
rfcs: [RFC-007]
created: 2026-11-10
---

# ADR-010: A Catalog File Beside the Stores, Ordered by a Web Lock

## 1. Context

The core package (`@relate/web`, which hosts the embedded database in a dedicated worker) persists two kinds of graph in the browser's origin-private file storage, and each keeps its own record of what it holds.

- A **content cache** (store `rel-<id>`) has a stored copy of its descriptor in a file at `relate-web/<id>.json`, outside the engine's directory. It is removed before a reset and written after a complete load, so a present file describes a complete store (ADR-003).
- An **application graph** (store `app-<name>`) has a node labelled `_RelateApplication` inside the graph, holding format, schema version and state (`seeding`, `ready`, `importing`) (ADR-009).

Neither can be listed through the core, and each has a cost. The marker is data: a query counts it, a visualisation draws it, and a statement can delete it. The two records are written separately from the data, and an application import that resets the store and then writes a new marker leaves, after a crash between the two, an empty unmarked store that opens as a first run and seeds again.

Browser measurements (three spikes, in Chromium, Firefox and WebKit unless noted) bear on where a replacement record can live:

- A small file beside the engine's directory can be read and replaced from every tab while another tab holds a store. Writers from several tabs lost no update when each took an exclusive Web Lock; without the lock most updates were lost, and WebKit's atomic-swap replace exposed an empty file in about a third of reads. With an exclusive lock for writers and a shared lock for readers, no read tore, went missing or failed with any replace method. A lock held by a terminated worker or closed tab was granted to a waiting tab within 8 ms. A swap write interrupted at a random point left a whole file in all 60 runs; that does not establish crash-atomicity.
- Clearing an origin's file storage (measured in Chromium) removed every store and the catalog file together. A reopened store was empty, indistinguishable from a first visit, and the browser gives no change event. A store held at the time failed its next write.
- The engine's public interface has no call for listing stores or reading a store's size or metadata. The origin-private directory shows each store as a directory of 65 files, whose sizes sum to the store's size and whose newest modification time is readable without opening the store, also while another tab holds it. Listing cost about 5 ms per store in Chromium and 20 to 25 ms in Firefox and WebKit.

The core is unpublished (version 0.0.0), so no deployed store carries a marker or a stored copy.

RFC-007 sets out the problem and the candidate homes for a catalog. The decision is a catalog file, with rules for how it is written, read and reconciled. An engine-held record, which would be atomic with the data, stays open until the engine offers one.

## 2. Decision

### 2.1 One catalog file

The origin has one catalog, a JSON file at `relate-web/catalog.json` in the origin-private root, beside the engine's `relate/` directory. It records every graph the core persists on that origin, applications and caches alike.

```json
{
  "format": 1,
  "graphs": {
    "app-orders": { "kind": "application", "name": "orders", "state": "ready", "version": 3, "seeded": true, "updatedAt": "2026-11-10T09:12:00Z" },
    "rel-docs-site": { "kind": "cache", "name": "docs-site", "state": "ready", "revision": "9f2c41e", "updatedAt": "2026-11-10T09:12:05Z" }
  }
}
```

- The key is the store's name as the engine knows it, so an entry and its store correspond one to one and a cache and an application cannot collide.
- `kind` is `application` or `cache`. `name` is the application name or the descriptor `id`.
- `state` is one of: `ready`; for an application, `seeding`, `migrating`, `importing`, `resetting`, `removing`; for a cache, `loading`, `removing`. An in-progress state names an operation that was started and has not been confirmed finished.
- `version` is the application's schema version as of the last completed migration or seed; for a `migrating` entry, `target` is the version being migrated to. `seeded` is true when the seed or import that last filled the store held at least one node, false when it held none. `revision` is a cache's descriptor revision.
- `updatedAt` is the time of the last state change. The file does not record when a graph was last opened: a write on every page load would add a lock and a replace to each navigation. The directory's modification time (2.5) says when a store last changed.
- `format` is the catalog's own version, `1`. It replaces the marker's `format` of ADR-009, which is no longer stored. A core that reads a larger `format` leaves the catalog and every store alone and reports `store-newer` for every application, as ADR-009 does for a store of a newer format.

The data of a graph holds nothing but the author's data: the `_RelateApplication` node is no longer written, and neither is the stored-copy file.

### 2.2 Writing: a Web Lock, a swap, and intent first

Every read and write of the catalog goes through the Web Lock named `relate-web:catalog`: exclusive for writing, shared for reading. A write is a read-modify-write inside the exclusive lock: read the current file, apply one change, replace the file. The replace writes the new contents through a writable stream so the file is swapped on close (`createWritable`), and falls back to a synchronous access handle where the stream is absent. Under the lock the choice does not affect readers. The lock is held for the replace only, never for the data operation it brackets.

A graph's lifecycle writes its intent before it changes data and its outcome after, and only the tab that holds the store writes that graph's entry (the engine admits one holder per store); the one exception is removal (2.5), which runs in a tab that does not hold the store. The worker performs lifecycle writes. The page may take the same lock and replace the file for the calls of 2.5, since the file and lock APIs are available there in all three browsers.

| Operation | Entry before the data changes | Entry after |
|---|---|---|
| First run | `seeding` | `ready`, `version` set |
| Migration to version *n* | `migrating`, `target: n` | `ready`, `version: n` after each step's last statement |
| Import | `importing` | `ready`, `version` of the envelope; if that is below the code's, `migrating` follows |
| `resetApplication()` | `resetting` | `ready`, `version` |
| Cache load | `loading` | `ready`, `revision` |
| Removal (2.5) | `removing` | entry deleted |

A migration records `version` after each version's last statement, as ADR-009 does with the marker, so a failed migration resumes from the last completed version. The data operations themselves are unchanged from ADR-009.

### 2.3 Opening an application graph

After the bounded retry for the store (ADR-001), the worker reads the entry for `app-<name>` and classifies it together with two facts read from the store: its node count and index count, as ADR-009 does today.

| Entry | Store | Action |
|---|---|---|
| none | empty | First run: write `seeding`, load the seed, create indexes, write `ready`. |
| none | holds nodes or indexes | Fail `store-unmarked`; the store is not touched. |
| `seeding` | any | Reset and seed again; no visitor data can exist before the first `ready`. |
| `resetting` | any | Continue the reset: reset and seed again. |
| `importing` | any | Fail `import-interrupted`; the store is not touched. |
| `removing` | any | Finish the removal, then treat as a first run. |
| `migrating` | any | Resume the migrations from `version`. |
| `ready`, `version` equal | holds nodes or indexes, or the entry says `seeded: false` | Open. |
| `ready`, `version` below the code's | holds nodes or indexes, or the entry says `seeded: false` | Migrate. |
| `ready`, `version` above the code's | any | Fail `store-newer`; the store is not touched. |
| `ready`, `seeded: true` | empty | Fail `store-lost`; the store is not touched. |

`store-lost` is a new failure reason: the catalog says the store was filled and the store is empty, which a clear that spared the catalog, or a statement that deleted every node, produces. The page can offer `resetApplication()`, as for the other failures that leave the store alone. An application whose seed was empty has `seeded: false`, and an empty `ready` store is a valid state for it: the core opens it, and cannot detect a later loss of the records the visitor added. A full origin clear removes the entry too and so cannot be told from a first visit (the browser gives no signal); the core opens a store with no entry and no data as a first run and applies the seed.

A catalog file that does not parse as JSON, or lacks `format` or `graphs`, fails every application open with `store-unreadable` and a message naming the catalog; caches ignore it and rebuild (2.4). The way out is the catalog reset of 2.5.

### 2.4 Opening a cache

A cache's entry takes the place of the stored-copy file. After opening the store the worker reads the entry for `rel-<id>`:

- Entry `ready` with the same `revision`, and the store's node count equal to the descriptor's `data.nodes`: restore, as in ADR-003.
- Any other case, including no entry, `loading`, `removing` (the removal is finished first), a different revision, a count mismatch and `ready` over an empty store: write `loading`, reset the store if it is not empty, fetch and load the data, create the indexes, and write `ready` with the revision last.

A cache is always rebuildable, so none of these cases fails the page. The descriptor stays as ADR-003 defines it. Its stored copy does not: ADR-003's rules for writing, removing and reading that file are replaced by the entry and the order above. An old `relate-web/<id>.json` file left by an earlier build is removed when the cache is next opened.

### 2.5 Listing, reconciliation and removal

The core exports a catalog interface with three calls, named at implementation.

- **List.** Returns the entries and, from the origin's `relate/` directory, the stores present. Each item says its kind, name, state, version or revision, whether its store exists, and, when asked for, the store's size and last-modified time (the sum and newest of its slot files). A directory with no entry is reported as `unregistered`; an entry with no directory as `missing`. Listing sizes costs a file read per slot file, so it is opt-in. Listing does not open any store and works while another tab holds one.
- **Remove.** Takes a store name, whether it has an entry or not. It writes `removing` (intent first), removes the directory `relate/<store>` and then the entry. If the engine's files are held by another tab the directory removal fails and the call rejects with `locked`. The entry is restored to its previous state only if it still says `removing` with the `updatedAt` this call wrote, checked and written inside one exclusive lock; otherwise the holder's newer entry stands. A tab that opens a store and finds `removing` holds the store before it finishes the removal, so it cannot delete a store another tab is using. Removing an application graph discards the visitor's data, so the call must say it is removing an application graph, and the result reports what was discarded.
- **Reset the catalog.** Deletes `catalog.json`. Afterwards a store holding data and no entry fails `store-unmarked`; the application then imports an export or calls `resetApplication()`. It is the recovery for a catalog that does not parse, and discards no store.

The core removes a graph by itself only in two cases: a cache it finds stale (as today), and a leftover stored-copy file. It never removes an application graph, and it applies no age or count limit to caches. A page that wants "clear everything this site stored" calls remove for each listed graph.

Removal of a directory relies on the engine's browser layout (`relate/<store>`), which is the engine's internal detail. The core uses nothing inside the directory.

### 2.6 What the page sees

The catalog interface gives the page the list above and the storage facts the client already exposes (persistence, usage, quota). It emits no change event of its own: a tab learns of another tab's change by listing again. The core supplies data and calls and no visitor-facing interface.

### 2.7 Existing stores

No deployed store exists. A store with an `_RelateApplication` node and no entry is treated as data without an entry and fails `store-unmarked`, with a message that names the node. A cache whose stored-copy file is present and whose entry is not is rebuilt. Neither form is adopted.

## 3. Alternatives Considered

- **One catalog file per graph.** The content cache's stored copy already works this way. Rejected: listing needs a directory read plus a read per file, writers touch separate files so ordering buys little, and a single file under one lock was measured to work across tabs in three browsers with no per-graph protocol.
- **An engine-held record committed with the data** (a per-store metadata slot, or the engine's ontology support). The only candidate that closes the window between a data write and an entry write. Not chosen now: the engine has no such call, and ontology support is behind a feature flag. The entry's `state` and `version` fields are the part that would move if the engine offers a slot.
- **A catalog that is itself an engine store.** Rejected: one holder at a time, so unreadable from every other tab while one tab holds it.
- **IndexedDB.** Rejected: a second storage mechanism and browser capability beside the file storage the stores need, and not atomic with the engine's files.
- **State encoded in the store's directory name.** Rejected: changing state means renaming a directory, which the browser's file interface does not do atomically.
- **Keep the marker node.** Rejected: it stays visible and deletable data, does not enumerate, and leaves the import window.
- **`localStorage` or another synchronous store.** Rejected: unavailable in a worker, where the lifecycle runs.
- **A fingerprint stored with the entry and checked on open** (a generation number or checksum written by the engine). Rejected: the engine exposes no such call, and the node-count check already catches the cases measured.
- **No lock, relying on atomic replace alone.** Rejected: measured to lose updates in every browser and, in WebKit, to expose an empty file.
- **Adopt existing marker and stored-copy stores.** Rejected: nothing is deployed, and adoption code would be dead weight and a path to test.

## 4. Consequences

- A graph's state is no longer committed with its data. A crash between a data change and the following entry write leaves an in-progress entry (`seeding`, `migrating`, `importing`, `resetting`, `loading`), which the next open reads and either repeats or reports. A crash during the entry's own replace leaves the previous entry, which still names the state the operation started from, so the operation is repeated or reported. The intent is written before the data changes, so no data change is ever unannounced. Swap atomicity under a crash was sampled (60 of 60 interrupted writes left a whole file) and not proven, so a truncated file fails as `store-unreadable` rather than being repaired.
- The import window of ADR-009 closes: `importing` is written before the reset, so a crash after the reset fails as `import-interrupted` instead of seeding over an empty store.
- Application statements can no longer delete the marker. For an application with a seed, a statement that deletes every node ends as `store-lost`, which is reported, where a deleted marker over an empty store ended as a silent reseed. An application with an empty seed gets no such report, because an empty store is valid for it.
- A full clear or eviction removes entries and stores together and is not detectable inside the origin. A page that cannot accept that needs a copy outside the origin (an export, a server record). This was measured in Chromium only; Firefox and WebKit were not scripted.
- Steady-state cost is one shared-lock read of one small file when a graph opens. Lifecycle operations cost a few exclusive-lock writes. Listing the stores with sizes grows linearly with the number of stores: about 5 ms each in Chromium and 20 to 25 ms in Firefox and WebKit. A names-only listing was not timed.
- Web Locks and the file storage are both required. Where the browser offers the file storage without Web Locks, the core treats storage as unavailable and applies the `onUnavailable` rule.
- Removal depends on the directory layout `relate/<store>`, and the core has no engine call to delete a store. Raising a store-delete call (and a listing call) with the engine's maintainers is follow-up work.
- An older core version opening a store written under this decision finds no marker and fails `store-unmarked`, so a downgrade is refused without touching data.
- Not verified: power loss and operating-system crashes; the catalog under many tabs writing for long periods; real quota-driven eviction; the clear behaviour of Firefox and WebKit; stores larger than 20,000 nodes in listing size; names-only listing cost.
- Follow-up: amend ADR-009 (its marker in 2.2, and the failure reasons in 2.4 gain `store-lost`) and ADR-003 (its stored copy in 2.4 and 2.5) when this is accepted; a specification and plan implement the catalog in the core and remove the marker and the stored-copy file; the react-admin provider (ADR-008) builds on it. RFC-007 7.3 (two applications that choose the same name share one store; an existing entry cannot tell them apart from one application reopening) remains open.

## 5. Related

- RFCs: RFC-007. Settles its open questions 7.1 (a file, ordered by a Web Lock), 7.2 (intent first, a reported mismatch), 7.4 (sizes read from the directory, opt-in), 7.5 (`store-lost` for an entry that outlives its store; a full clear looks like a first visit), 7.6 (removal by call only) and 7.7 and 7.8 (no adoption of old forms; remove each graph to clear everything). Leaves 7.3 open.
- ADRs: ADR-001 (worker hosting, the store and its retry rule), ADR-003 (the descriptor and its stored copy), ADR-009 (application graphs and the marker)
- Evidence: `design/spikes/SPIKE-009-catalog-file-atomicity/SPIKE.md`, `design/spikes/SPIKE-010-origin-eviction/SPIKE.md`, `design/spikes/SPIKE-011-engine-store-enumeration/SPIKE.md`
