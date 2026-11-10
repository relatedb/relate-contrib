---
id: RFC-007
title: The Client-Side Graph Catalog
status: accepted
created: 2026-11-09
adrs: [ADR-010]
---

# RFC-007: The Client-Side Graph Catalog

## 1. Summary

A web origin can persist several graphs in a visitor's browser: a cached copy of each graph a site ships, and one or more graphs the visitor writes. Each is a store in the browser's origin-private file storage, held by the embedded database RelateDB (relate), and each carries bookkeeping that says what it is: which graph, which revision or schema version, whether it is complete. A catalog is a single record, per origin, of every graph persisted there: its kind, name, format, version, state and, where it can be learned, its size.

The organizing claim is that persisted graphs need a catalog because the bookkeeping is currently scattered, and the scattered form cannot answer the questions a site, a visitor and the core package itself need answered: what is stored here, is each graph whole, which ones are orphaned, and what can be cleared. The hardest part is keeping an entry consistent with the data it describes, because the two are written at different times and either can be lost.

A catalog has to do four things: enumerate the graphs, say whether each is whole, stay consistent with the data it describes, and allow cleanup. The sections below set out the candidates for each, the measurements that would choose between them, and the questions that remain open.

## 2. Problem / Motivation

The core package (the library that hosts the database in a page, `@relate/web`) keeps two kinds of persistent store, and each keeps its own record of what it holds.

- **A content cache** is a store named `rel-<id>` for a graph the site ships, with a small file, outside the store, at the root of the origin's private storage (`relate-web/<id>.json`). The file holds the graph descriptor, which carries the revision. It is written last after a complete load and removed before a reset, so a file that is present describes a complete store. A different revision in the file means the store is stale and is wiped.
- **An application graph** is a store named `app-<name>` for a graph the visitor writes, with a marker node labelled `_RelateApplication` inside the graph. The marker holds the store's format, schema version and state (`seeding`, `ready`, `importing`).

Neither can be listed through the core. The browser can list the directories in the origin's private storage, but the engine keeps each store as a directory of fixed-size slot files (`relate/<name>/slot-N`) whose layout belongs to the engine and says nothing about what the store holds, and the core offers no call that lists stores. A page that has two application graphs, or a content cache for a graph it no longer ships, cannot ask what it has.

The scattered bookkeeping has costs that are already visible.

- **The marker is data.** It is counted by `MATCH (n) RETURN count(n)`, drawn by a graph visualisation, and removed by a statement such as `MATCH (n) DETACH DELETE n`. A statement that removes only the marker leaves data without one, and the store then fails to open as `store-unmarked`, because the core cannot tell it from a store it never created. `MATCH (n) DETACH DELETE n` removes every node, marker included: if the application created indexes they remain and the store fails the same way, and otherwise the store opens as a first run and loads the seed again, with no failure to say the visitor's data is gone.
- **The two records are not written with the data.** A cache's descriptor file and a store's contents are two writes; the file is ordered last so that a crash leaves a store that looks stale, not one that looks complete. An application import resets the store and then writes the new marker as separate steps; a crash between them leaves an empty store with no marker, which opens as a first run and seeds again.
- **Nothing detects a name collision.** Two applications on one origin that pick the same name share one store, and nothing records that the name was taken.
- **Nothing finds leftovers.** A site that renames a descriptor `id` or an application leaves the old store in the visitor's storage with no way for the page, the site or the visitor to find it.
- **The visitor cannot be told anything.** Whether a site's data is durable, how many graphs it holds, and what clearing one would cost are all unanswerable, so the application cannot give a visitor an honest account of what is stored (RFC-006's privacy question on shared devices has no home).

Two further facts shape the problem. The browser evicts or clears an origin's storage as a whole; measured in Chromium, clearing the origin-private storage removed engine stores and a file beside them together, and a reopened store came back empty, indistinguishable from a first visit. And a store serves one holder at a time (a second tab's attempt to open it waits until the first releases it), so a catalog that is itself a store of the same kind is unreadable from every other tab while one tab holds it.

## 3. Goals

- **List.** A page can enumerate every graph the origin has persisted, with kind, name, format, version or revision, state, and size where the browser or engine can report it, without opening the stores.
- **One record per graph.** A graph's identity, version and state are recorded in one place, outside the graph's own data. The data carries nothing that a query can see, count or delete.
- **Consistency.** After a crash, a closed tab or a terminated worker at any point, an entry never describes a store as complete when it is not, and a store is never treated as empty while holding data. Where this cannot be guaranteed, the failure is detected and reported, never silent.
- **Readable from any tab.** Every tab of an origin can read the catalog while another tab holds a store. Writes from several tabs do not corrupt it.
- **Orphans are visible.** A store with no entry, and an entry with no store, are both reported as such.
- **Cleanup is possible and deliberate.** A site and a visitor can remove one graph or all of them, and the catalog says what each removal discards. Nothing is removed without an explicit call.
- **Honest storage.** The catalog reports what the browser is willing to say about persistence and eviction, and notices partial loss (a store without its entry, or an entry without its store). Loss of everything at once looks like a first visit, and the catalog says so rather than implying it can tell.
- **One mechanism for both kinds.** Content caches and application graphs use the same catalog, with different rules per kind (a cache can be rebuilt; an application's data cannot).

## 4. Non-Goals

- Sharing or synchronising graphs between devices or visitors, or any server-side catalog.
- Changes to the graph data format or to the engine's own store format. A need found here, such as a per-store metadata slot, is recorded and raised with the engine's maintainers.
- Encryption of stored data or of the catalog.
- Preventing the browser from evicting storage; the catalog reports it.
- A query interface over graph contents. The catalog describes graphs, not what is in them.
- Catalogs spanning origins. A browser keeps each origin's storage apart.
- Catalogs of graphs that are not persisted (an in-memory page graph has no entry).
- A ready-made visitor interface for listing and clearing graphs. The catalog supplies the data and the calls; a page builds its own surface.

## 5. Proposed Approach (high-level)

### 5.1 What an entry says

An entry names a graph and says what the core needs to decide what to do with its store. Working assumption: kind (content cache or application), name, format of the bookkeeping, the content revision or the schema version, state, when it was last opened, and size if known. State is the part with consequences: it has to distinguish a complete graph from one being seeded, imported, migrated or reset, because those states are what the marker records for an application today and what the stored-copy file implies for a cache.

### 5.2 Where the catalog lives

Candidates, each with a different consequence for access from several tabs and for eviction:

- **In the engine.** A catalog, or a per-store metadata slot committed with the store's data, provided by the engine. This is the only candidate that can make an entry atomic with its data. It needs the engine to offer it: the engine's public interface has no call for listing stores or reading a store's size or metadata today, and a per-store slot would not by itself enumerate stores.
- **A store of the engine's kind**, with a reserved name, holding the catalog as a small graph. It enumerates and is written transactionally, but it serves one holder at a time and so is not readable from other tabs while one tab holds it.
- **One small file per graph** in the origin's private storage, replaced atomically, listed by directory. It enumerates cheaply, needs no store to be open, and works across tabs; it is a second write beside the store's data. Measured in Chromium, Firefox and WebKit, such a file can be read and replaced from every tab while another tab holds a store, and writers from several tabs lose no update when each takes a Web Lock (without the lock, updates are lost, and WebKit's replace can expose an empty file). The content cache already works this way: its stored-copy file is such a file, written last and removed before a reset, so its cost is known in outline (a crash between the two writes is survivable only because the order makes the store look stale).
- **State carried in the store's own name**, for example a directory name that encodes kind, revision and state. It enumerates for free and needs no second file, but changing state means renaming a directory, which the browser's storage interface does not do atomically.
- **A browser database designed for several tabs** (IndexedDB, or a shared key-value store), which gives cross-tab transactions and a coordinated writer but is not atomic with the engine's files. Browsers document eviction as whole-origin, which would take such a database along with the stores; a visitor's selective clear could leave it. That was not measured.

A choice can combine them: an engine-provided slot for state that must be atomic with the data, and a cross-tab list for enumeration.

### 5.3 Keeping an entry consistent with its data

The entry and the store change at different moments, so a protocol is needed. Candidates:

- **Intent first.** The entry records the intent (`seeding`, `importing`, `migrating to n`) before the data changes and the outcome (`ready`) after. A crash leaves an intent entry, which names the interrupted operation, as the marker does today. Where the entry is a file, writers from several tabs are ordered with a Web Lock, which a terminated or closed holder releases within a few milliseconds.
- **Verify on open.** The entry holds a fingerprint the store can be checked against (a count, a generation number written into the store by the engine), so an entry that disagrees with its store is detected.
- **Atomic with the data.** The engine commits the state with the data (the engine candidate in 5.2). No crash window remains.

The first two close the common crash windows but leave a window between the data write and the entry write; the third closes it. The window found in application import (a reset followed by writing the new record) is the case a protocol has to cover.

### 5.4 Enumeration, orphans and cleanup

The catalog is the starting point for listing; a reconciliation step compares it with what the origin's storage actually contains and reports two kinds of mismatch: a store with no entry (created by an older version of the core, or lost its entry) and an entry with no store (a crash between the two writes, or a selective clear that left the catalog). A visitor's full clear or an eviction removes both, so it leaves no mismatch to report. Listing the stores from the origin's directory gives each store's name, approximate size and last-modified time without opening it, even while another tab holds one; it costs a file read per slot file, about 5 ms per store in Chromium and 20 to 25 ms in Firefox and WebKit. Cleanup is explicit: remove one graph, remove all graphs of a kind, remove orphans. A content cache can be removed freely because the site can ship it again; removing an application graph discards the visitor's data and is reported as such.

### 5.5 Several tabs

Every tab needs to read the catalog, and every tab can change it (a tab opens a store, another finishes a migration). The catalog has to define who may write, how writers are ordered, and what a tab sees when a store it listed is held by another tab: a listed graph and an open graph are different facts. A second tab that tries to open a held store is refused at once, while reading and replacing a file beside it succeeds.

### 5.6 What the page and the visitor see

The core reports the catalog to the page: a listing, a change notification, and the storage facts the browser gives (persistence, usage, quota). A page can show a visitor what it holds and offer to clear it.

### 5.7 Relationship to descriptors, application options and existing stores

A descriptor still names a graph and its revision as the site ships it; the catalog records what the browser holds. An application's name and version stay the application's declaration. Stores created before a catalog exists carry a marker or a stored-copy file; they have to be recognised and either adopted into the catalog or rebuilt.

### 5.8 What was measured

Three measurements, each in Chromium, Firefox and WebKit unless noted, were run against these candidates:

- **A small file in the origin's private storage** (a 50 KB self-checking file, 300 replaces against a reader in another tab). The file is readable and replaceable from any tab while another holds a store. Without a lock, readers see torn or missing reads in some browser and method combinations (WebKit's atomic-swap replace gave an empty file in a third of reads), and three tabs writing at once lost most updates; with an exclusive Web Lock for writers and a shared one for readers, nothing tore, went missing or was lost in any browser. A writer terminated at a random point left a whole file in all but one of 180 runs (three browsers, three methods, twenty each; the exception was an in-place write in Firefox). A temporary-file-and-rename scheme leaves a temporary file behind. The lock was granted to a waiting tab within 8 ms of its holder being terminated or its tab closed.
- **Eviction** (Chromium only for the clear, which Playwright can script there). Clearing the origin's file storage removed engine stores and the catalog file together; reopened stores were empty; a store held at the time failed its next write; `navigator.storage` has no change event, and only the usage figure and the missing data show that anything happened. The engine's stores cannot be placed in a storage bucket, which only Chromium offers. Browsers document eviction as per origin and whole.
- **Enumeration through the engine.** The engine's public interface exposes no listing, size or metadata call. A page can list the stores from the origin-private directory instead: each store is a directory of 65 files whose sizes sum to the store's size (identical across browsers), with a modification time, readable while another tab holds the store. Kind, version and state are not in the directory.

Figures are single runs on one machine; power loss was not tested. The harnesses and raw results are with the spikes.

## 6. Alternatives Considered

- **Keep the per-graph bookkeeping and add a scanning call.** A function that lists the origin's stores by reading storage would enumerate, but it would not say what a store holds without opening it, could not report state without the marker or stored-copy file, and leaves the marker in the data. Rejected: it adds listing without removing the scattered records.
- **A catalog the site ships.** A site could ship a list of its graphs, as a descriptor does for one. It says what the site expects, not what the browser holds, so it cannot report orphans, eviction or the visitor's own graphs. Rejected as the record of persisted state; it remains how a site declares what it wants.
- **One store holding every graph, in namespaces.** One engine store would give one holder, one place for state and a natural list. It needs namespace support the browser build was not tested for, makes a content-cache wipe and an application's data share a store, and ties every graph's lifetime to one lock. Not chosen now; it stays a candidate if the engine offers per-graph isolation.
- **Leave the marker and document its cost.** Rejected as the end state: it keeps the data polluted, leaves enumeration unsolved and keeps the import window.

## 7. Open Questions

7.1. Where does the catalog live (5.2)? A file in the origin's private storage, ordered by a Web Lock, is measured to work across tabs in all three browsers; a per-store metadata slot committed with the data is the only candidate that closes the window between a data write and an entry write, and the engine offers none. Is the file candidate acceptable with a reported mismatch, or is the engine slot a prerequisite for the application kind?

7.2. Which consistency protocol (5.3), and which failure is acceptable when no candidate closes every crash window: a detected and reported mismatch, or an automatic repair?

7.3. What identifies a graph across kinds and sites on one origin? A content cache and an application can currently choose the same text for different stores; two applications can choose one name and share data. Does the catalog refuse a name that is taken, and by whom is it "taken"?

7.4. A store's approximate size and last-modified time can be read from its directory without an engine call, at a cost of a file read per slot file. Is that figure and cost acceptable for the listing, including for an origin with many stores?

7.5. A full clear or eviction removes every store and the catalog together and cannot be told from a first visit. A cold start that finds nothing cannot know a graph existed: today it treats the store as a first run and applies the configured seed. A live client that already holds a store learns of the loss from a storage error and can report it. What should each do, and does an application that cannot afford silent loss need a signal kept outside the origin, such as an exported copy or a server record? Partial loss, from a crash or a selective clear, is detectable by the reconciliation in 5.4.

7.6. Who may remove a graph and when: the site's code, the visitor through a page the site provides, or the core on its own for leftover content caches? Is there an automatic age or count limit for caches?

7.7. What happens to stores that already exist with a marker or a stored-copy file: adopted in place, rebuilt from the data, or required to be reset? Is a window of support for both forms needed?

7.8. What does the catalog say about privacy on a shared device (RFC-006 7.11), and can a visitor clear everything the origin persisted from inside the application?

## 8. ADRs

- ADR-010: a catalog file beside the stores, ordered by a Web Lock. It replaces the application-graph decision's marker node and the descriptor decision's stored copy.
