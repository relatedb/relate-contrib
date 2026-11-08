---
id: RFC-006
title: Application Graphs
status: draft
created: 2026-11-08
adrs: []
---

# RFC-006: Application Graphs

## 1. Summary

An application graph is the database behind a web application whose data the visitor creates and changes: records in an admin tool, notes in an editor, the state of a game. It lives in the visitor's browser, one graph shared by all the pages of a site, and it has to be there when the visitor comes back. The embedded database RelateDB (relate) can already write to durable browser storage, committing each change before acknowledging it. The core package that hosts the database in a worker does not yet offer an application graph, because everything it hosts so far is data that ships with the site and can be thrown away and rebuilt.

The organizing claim is that an application graph follows different rules from a content graph (the read-only graph a site ships and replaces at each release). The browser's copy is the only copy; the shipped seed applies once; a new release of the application migrates the stored data and never replaces it; and because losing the data loses a visitor's work, loss must be rare, visible and recoverable. This RFC states what an application graph has to do and which directions are worth measuring. No approach is chosen.

## 2. Problem / Motivation

The hosting model treats stored data as a cache.

- **The store is wiped on a new revision.** The core package keeps an optional copy of a site's graph in the browser's origin-private file storage, so repeat visits restore in about 0.35 s for 5,000 pages instead of replaying the data in about 1.4 s (RFC-001 and its hosting decision). A site ships its graph with a small descriptor file that carries a revision identifier; when the revision differs from the one kept beside the stored copy, the worker wipes the store and replays. For a content graph that is correct. For an application that ships a new seed file, it would erase every visitor's records.
- **It is off by default, and it needs a descriptor.** Under client-side routing the store is used only when the site asks for it. The store takes its name and its staleness test from the descriptor, so a graph shipped as a plain data document has no store at all.
- **Page graphs stay in memory.** The page-graph model states that nothing outlives the page, and saving a visitor's work beyond the page view is outside it.

Applications need the opposite. An administrative tool, a notes editor and a task tracker lose their purpose when a reload empties them, and the example applications that RFC-005 plans for a hackathon include the first two. Games vary: a save slot or a persistent world needs a durable graph, a short session does not.

The engine supports more than the core exposes. Its browser store commits each acknowledged write to a log before returning. In a browser spike (SPIKE-008), no acknowledged write was lost in 24 runs that terminated the worker or closed the tab in the middle of a write, in Chromium, Firefox and WebKit, and stores of up to two million nodes (424 MB) reopened in about 6 s with no limit reached. The store opens only in a dedicated worker and serves one holder at a time. What an application needs on top of that is a contract, and four properties of the browser make the contract more than a flag:

- **Another tab can hold the store.** A second tab finds it locked. A worker terminated while running a query kept the store locked for about 2.3 s in earlier measurements; the spike saw about 3 s in Chromium and under 0.5 s in Firefox and WebKit. A cache can fall back to memory; an application that does the same silently writes data the visitor believes is saved.
- **Storage can be absent or lost.** Some contexts offer no store (the WebKit default test profile, for example), a browser can evict a site's storage under pressure unless the site has been granted persistence, and a visitor can clear site data.
- **Applications change.** A release adds a property, renames a label or splits a relationship type. Stored data from the previous release has to be carried forward, and a statement that rewrites many nodes can be applied in part if the worker is terminated part-way: the engine commits large statements of the form "match every node with a label and set a property" in batches, and in the spike a terminated statement over 300,000 nodes left 50,000 of them updated.
- **A copy of the data has to leave the browser.** The graph data format has no `null`, nested values or dates beyond strings, requires every node to have a string `id`, and infers integer or float from the written number. A graph written by Cypher statements can contain values that format cannot carry: integers beyond 2^53, whole-number floats, dates and durations (which load back as strings), points, and empty lists. A backup in that format loses information, and the browser build offers no way to export the engine's own snapshot.

Sites that hold visitor data typically keep it in one graph shared by all their pages; a graph per page is the exception. That shape makes the long-lived, site-wide application graph the case to design for.

## 3. Goals

- A visitor's data survives reload, return visits and replacement of a failed worker. A change the page was told succeeded is not lost.
- The seed ships once. It populates an empty graph on first run and is never reapplied over stored data.
- A new release of an application carries stored data forward through a versioned schema, and a store from an older release is migrated, not wiped.
- The page can find out whether its data is durable, whether it is stored in memory only (and why), whether the browser may evict it, and how much space it has used, so it can say so to the visitor.
- A visitor can take a copy of the data out and bring it back, including the values the engine stores.
- The behaviour when a second tab opens the same application is defined, and does not corrupt or silently diverge from the stored data.
- The same machinery serves the site-wide graph and, where wanted, a page graph; the shared case is the default.
- Failure is contained as for every instance: a damaged store can be reset only by an explicit, confirmed action.
- Durability is checkable: after a worker is terminated in the middle of a write, every change the page was told succeeded is present on restart.
- Restoring an application graph takes no longer than restoring a content graph of the same size.

## 4. Non-Goals

- Sharing data between visitors or devices, synchronization, or collaborative editing. These need a server or a replication scheme and are taken up separately.
- Server-side persistence and hosting shapes for multi-user applications.
- Changes to the engine's storage format or to the data format of shipped graphs. Needs found here, such as a way to trigger a checkpoint from the page, are recorded and raised with the engine's maintainers.
- Encryption of stored data.
- A schema language or object mapper for applications.
- Preventing the browser from evicting a site's storage. The RFC makes eviction visible and offers a way to ask for persistence; the browser decides.

## 5. Proposed Approach (high-level)

### 5.1 Two kinds of graph with separate rules

Working assumption:

| | Content graph | Application graph |
|---|---|---|
| Source of truth | the site's build output | the visitor's browser |
| Written by | the site's build | the visitor, through the application |
| New release | replaces the stored copy | migrates the stored data |
| Seed | the whole graph, every revision | once, on first run |
| Loss | harmless: restore from the site | visitor's work is gone |
| Store | a cache, optional | required, durable |

The existing hosting model, with its site-graph cache, stays as it is for content graphs. An application graph is a second mode of the same instance, with the same worker, status and fault handling.

### 5.2 Lifecycle

A candidate lifecycle: an application graph moves through: first run (seed an empty store and record that seeding happened and with which schema version); ordinary runs (restore, with no replay); a release (compare the stored schema version with the application's and run the ordered migrations against the stored data); a worker replacement (reopen the same store); and an explicit reset (confirmed, with an export offered first).

### 5.3 Saying what is true about the data

The page gets a durable-or-not state in addition to the instance's loading, ready, recovering and failed states: durable, in memory only (with the reason: no store available, locked by another tab, unsupported browser profile), and whether the browser has granted persistent storage. A visitor-facing control exports and imports a copy. Because the browser may evict storage, an application can ask for persistence; whether the core asks on its own or leaves that to the application is open.

### 5.4 More than one tab

The store serves one holder at a time, refuses a second holder within milliseconds, and is free again within about half a second of its holder's tab closing. Candidates: the first tab owns the store and later tabs wait and retry with a visible message; later tabs run in memory with a warning that their changes are not saved; one tab is elected to own the store and serves the others by messages. A shared worker is excluded, since it cannot open the store, and so is a read-only view in a second tab, since no tab can open a store another holds.

### 5.5 Migration

Candidates: a numbered series of migration statements kept with the application and run in order against stored data; rebuilding from an export (export, reset, transform, import), which is slower and heavier but needs no migration code; and none, where an incompatible release asks the visitor to reset. The first is the usual shape; the second is a fallback, and the third is a policy choice an application may make explicitly. Whichever shape is chosen, a migration over many nodes has to be safe to interrupt: written in bounded steps, each filtered so that it can run again, with the schema version written last, because an unbounded statement can be applied in part.

### 5.6 Relationship to content and page graphs

A site may need both: a read-only content graph that is replaced at each release (such as the site graph of RFC-003, a graph of a site's pages and links) and a durable application graph. Candidates: two instances, each with its own store, or one instance holding both with the content graph in a marked namespace so a release can replace only that part. A page graph is an application graph with a smaller scope, or stays ephemeral where nothing should outlive the page.

## 6. Alternatives Considered

- **Persistence as an option on the existing cache.** Rejected: the cache is wiped on a new revision and is seeded every time, so an option would join two lifecycles under one flag and make the destructive one the default.
- **Replaying a log of the visitor's statements.** Rejected: replay time grows with the history, and replay is sound only for statements that give the same result when repeated, which an arbitrary application statement does not.
- **Saving the graph as a JSON document in a general-purpose browser store and loading it into memory.** Rejected: it rewrites the whole graph or maintains a second change log to avoid that, and duplicates the commit guarantee the engine already provides.
- **Snapshotting the graph when the page unloads.** Rejected: a reload or a terminated worker does not reliably run unload code, so a change made shortly before one would be lost, which is the failure the engine's per-write commit exists to prevent.
- **Visitor-managed save files only.** Rejected as the sole mechanism: it leaves everything since the last save at risk. It remains the right form for export and import (5.3).
- **Leaving persistence to each application.** Rejected: each would repeat the lock, fallback, migration and eviction handling, and none of them could tell a visitor consistently whether their data is saved.

## 7. Open Questions

7.1. What is the multi-tab policy: the first tab owns the store and later tabs wait and retry, later tabs run in memory with a warning, or an elected owner serves the others? A read-only view in a second tab is not available.

7.2. What is the migration mechanism, and who writes migrations: the application, a helper in the core, or both? Given that an interrupted bulk statement can be partly applied, what rule do migrations follow (bounded, rerunnable steps with the version written last), and does the core enforce it or only document it? How is a failed migration reported?

7.3. Does an application with both a content graph and an application graph use one instance with a marked namespace, or two instances? What does the engine's namespace support allow in the browser build?

7.4. What does the core promise when storage is unavailable: memory with a signal, a refusal to start, or a choice made by the application?

7.5. Who triggers a checkpoint, and can the page learn the size of its store? In the spike no limit appeared up to two million nodes and the file count stayed fixed, but the browser build offers no call to checkpoint or measure, and long runs showed rare write stalls of 35 to 421 ms whose cause is not known. Does the core need an engine request?

7.6. What format carries an export, given the losses described above and that the browser build cannot produce the engine's snapshot? Candidates: the graph data format with a report of what it could not carry, a richer format, or an engine request for snapshot export. How is fidelity checked on a round trip?

7.7. Does the core request persistent storage on its own, or leave that to the application? When does it ask? In the spike a request was refused in Chromium and WebKit and waited on a permission prompt in Firefox, so a request must never block startup.

7.8. How is a damaged or unreadable store reported to the visitor, and what can be recovered from it?

7.9. How is an application graph's store named, given that a name is one segment of 1 to 64 characters from letters, digits, dash and underscore, that two names on one origin are independent, and that the current store takes its name from a descriptor an application graph may not have? What happens when two applications on one origin choose the same name?

7.10. What does the page do as a store nears the browser's quota? The browsers in the spike offered 10 to 20 GB and no limit appeared at 424 MB; what a write does when the quota is exceeded was not tested.

7.11. What does persistence mean for privacy on a shared device: data written to a browser store outlives the visitor's session, so does the application say so, and can a visitor clear it from inside the application?

7.12. Which engine changes does an application graph need, and who raises them: a call to trigger a checkpoint and report the store's size, and export of a snapshot from the browser build?

## 8. ADRs

_(none yet)_
