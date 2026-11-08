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

- **The store is wiped on a new revision.** The origin-private store (the browser's per-origin private file storage) holds a copy of the site's graph so repeat visits restore in about 0.35 s for 5,000 pages instead of replaying the data in about 1.4 s. When the descriptor's revision differs from the stored copy, the worker resets the store and replays. For a content graph that is correct. For an application that ships a new seed file, it would erase every visitor's records.
- **It is off by default.** Under client-side routing the store is used only when the site asks for it, and a graph without a descriptor never has one.
- **Page graphs stay in memory.** The page-graph model states that nothing outlives the page, and saving a visitor's work beyond the page view is outside it.

Applications need the opposite. The first batch of community starters is meant to include an administrative tool, a document editor and games; each is useless if a reload empties it. The starters were first drafted with seed data that reset on reload because the only available behaviour was that of a cache.

The engine supports more than the core exposes. Its browser store commits each acknowledged write to a log before returning, so an edit survives a reload or a terminated worker. It opens only in a dedicated worker, serves one holder at a time, and writes snapshots as JSON because the browser build has no Parquet codec. What an application needs on top of that is a contract, and four properties of the browser make the contract more than a flag:

- **Another tab can hold the store.** A second tab finds it locked. A worker terminated while running a query kept the store locked for about 2.3 s in earlier measurements. A cache can fall back to memory; an application that does the same silently writes data the visitor believes is saved.
- **Storage can be absent or lost.** Some contexts offer no store (the WebKit default test profile, for example), a browser can evict a site's storage under pressure unless the site has been granted persistence, and a visitor can clear site data.
- **Applications change.** A release adds a property, renames a label or splits a relationship type. Stored data from the previous release has to be carried forward.
- **A copy of the data has to leave the browser.** The graph data format has no `null`, nested values or dates beyond strings, and it infers integer or float from the written number. A graph written by Cypher statements can contain values that format cannot carry. A backup in that format may therefore lose information.

The assumption that most sites have one shared graph and fewer have per-page graphs makes this the common case, not an edge: the long-lived, site-wide graph is where visitor data lives.

## 3. Goals

- A visitor's data survives reload, return visits and replacement of a failed worker. A change the page was told succeeded is not lost.
- The seed ships once. It populates an empty graph on first run and is never reapplied over stored data.
- A new release of an application carries stored data forward through a versioned schema, and a store from an older release is migrated, not wiped.
- The page can find out whether its data is durable, whether it is stored in memory only (and why), whether the browser may evict it, and how much space it has used, so it can say so to the visitor.
- A visitor can take a copy of the data out and bring it back, including the values the engine stores.
- The behaviour when a second tab opens the same application is defined, and does not corrupt or silently diverge from the stored data.
- The same machinery serves the site-wide graph and, where wanted, a page graph; the shared case is the default.
- Failure is contained as for every instance: a damaged store can be reset only by an explicit, confirmed action.

## 4. Non-Goals

- Sharing data between visitors or devices, synchronization, or collaborative editing. These need a server or a replication scheme and are taken up separately.
- Server-side persistence and hosting shapes for multi-user applications.
- Changes to the engine's storage format or to the data format of shipped graphs. Needs found here, such as a way to trigger a checkpoint from the page, are recorded and raised with the engine's maintainers.
- Encryption of stored data.
- A schema language or object mapper for applications.

## 5. Proposed Approach (high-level)

### 5.1 Two kinds of graph with separate rules

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

An application graph moves through: first run (seed an empty store and record that seeding happened and with which schema version); ordinary runs (restore, with no replay); a release (compare the stored schema version with the application's and run the ordered migrations against the stored data); a worker replacement (reopen the same store); and an explicit reset (confirmed, with an export offered first).

### 5.3 Saying what is true about the data

The page gets a durable-or-not state in addition to the instance's loading, ready, recovering and failed states: durable, in memory only (with the reason: no store available, locked by another tab, unsupported browser profile), and whether the browser has granted persistent storage. A visitor-facing control exports and imports a copy. Because the browser may evict storage, an application can ask for persistence; whether the core asks on its own or leaves that to the application is open.

### 5.4 More than one tab

The store serves one holder at a time. Candidates: the first tab owns the store and later tabs work from a read-only view; later tabs wait and retry with a visible message; later tabs run in memory with a warning that their changes are not saved; one tab is elected to own the store and serves the others by messages. A shared worker is excluded, since it cannot open the store.

### 5.5 Migration

Candidates: a numbered series of migration statements kept with the application and run in order against stored data; rebuilding from an export (export, reset, transform, import), which is slower and heavier but needs no migration code; and none, where an incompatible release asks the visitor to reset. The first is the usual shape; the second is a fallback, and the third is a policy choice an application may make explicitly.

### 5.6 Relationship to content and page graphs

A site may need both: a read-only content graph that is replaced at each release (the site graph) and a durable application graph. Candidates: two instances, each with its own store, or one instance holding both with the content graph in a marked namespace so a release can replace only that part. A page graph is an application graph with a smaller scope, or stays ephemeral where nothing should outlive the page.

## 6. Alternatives Considered

- **Persistence as an option on the existing cache.** Rejected: the cache is wiped on a new revision and is seeded every time, so an option would join two lifecycles under one flag and make the destructive one the default.
- **Replaying a log of the visitor's statements.** Rejected: replay time grows with the history, and replay is sound only for statements that give the same result when repeated, which an arbitrary application statement does not.
- **Saving the graph as a JSON document in a general-purpose browser store and loading it into memory.** Rejected: it rewrites the whole graph or maintains a second change log to avoid that, and duplicates the commit guarantee the engine already provides.
- **Leaving persistence to each application.** Rejected: each would repeat the lock, fallback, migration and eviction handling, and none of them could tell a visitor consistently whether their data is saved.

## 7. Open Questions

7.1. What is the multi-tab policy: owner and read-only views, wait and retry, in-memory with a warning, or an elected owner?

7.2. What is the migration mechanism, and who writes migrations: the application, a helper in the core, or both? How is a failed migration undone?

7.3. Does an application with both a content graph and an application graph use one instance with a marked namespace, or two instances? What does the engine's namespace support allow in the browser build?

7.4. What does the core promise when storage is unavailable: memory with a signal, a refusal to start, or a choice made by the application?

7.5. How large does a store grow, how long does recovery take after many writes, and who triggers a checkpoint, given that the browser build has no background timer? This needs measurement and may need an engine request.

7.6. What format carries an export: the graph data format (with the loss described above), the engine's own snapshot, or both? How is fidelity checked on a round trip?

7.7. Does the core request persistent storage on its own, or leave that to the application? When does it ask?

7.8. How is a damaged or unreadable store reported to the visitor, and what can be recovered from it?

7.9. How does this relate to the visitor-work and recovery candidates in the page-graph RFC? For application graphs, "lose the work" is no longer one of them.

## 8. ADRs

_(none yet)_
