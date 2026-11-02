---
id: ADR-003
title: Graph Descriptor Beside the Graph Data
status: accepted
rfcs: [RFC-001]
created: 2026-11-02
---

# ADR-003: Graph Descriptor Beside the Graph Data

## 1. Context

A graph reaches the browser as a JSON document that a loader replays into the database. Replaying 5,000 pages in a worker took about 1.4 s, and restoring the same graph from the browser's origin-private store (the per-site private file storage) took about 0.35 s. To use a store, a page must know before loading anything whether the stored graph still matches the data the site is serving now.

Three things get in the way of that when the only description of a graph is the data document:

- **The data has to be fetched to be compared.** If the build's revision string lives inside the document, every page load fetches and parses the whole document to learn whether it can skip loading it. A 5,000-page document in the earlier pages-and-links shape measured about 0.9 MB (143 KB compressed), so the cost is modest today. A node-link document is somewhat larger, and adding an embedding vector to each page, which the site-wide graph is planned to do, would make it many times larger (an estimate from the vector sizes, not a measurement); the store would then save the replay but not the download.
- **Something has to record what the store holds.** A node inside the graph that records the loaded revision appears in every `MATCH (n)`, in node counts, in graph views and in vector scans, and it forces a label that documents may not use.
- **Facts about a graph have no home.** The index to create, the name of the store, and later the graph's schema and the embedding model (a query must be embedded with the same model the graph was built with) all describe the graph, not any node in it.

A graph needs a small description of its own, kept apart from the data.

## 2. Decision

### 2.1 A descriptor is a small JSON document beside the data

A graph may have a descriptor: a JSON document served next to the data document and loaded on its own.

```json
{
  "version": 1,
  "id": "docs-site",
  "revision": "9f2c41e",
  "data": { "url": "graph.json", "nodes": 20000, "links": 100000 },
  "indexes": [ { "label": "Page", "property": "id" } ]
}
```

- `version`: required integer, `1`. A loader that does not know the version rejects the descriptor.
- `id`: required string of 1 to 48 characters from `A-Z a-z 0-9 _ -`. It names the graph and, with a prefix, its store.
- `revision`: required non-empty string that changes whenever the data or anything else in the descriptor (the index list, for one) changes: a build id, or a hash of the data and the descriptor's contents.
- `data`: required object. `url` is the data document's location, relative to the descriptor's own URL when the descriptor is fetched and to the page's URL when it is embedded in the page; `nodes` and `links` are its counts, as non-negative integers.
- `indexes`: optional array of `{label, property}` pairs of non-empty strings, the indexes to create before the nodes load.
- Unknown keys are errors. The names `shape` (the graph's schema) and `embeddings` (the embedding model, dimensions and metric) are reserved for a later decision; a version 1 validator rejects them.

### 2.2 Relation to the data document

The data document stays as defined in ADR-002. If it carries a `revision` it MUST equal the descriptor's, and a mismatch is an error (a new descriptor served with cached old data, or the reverse). After validation the loader checks that the document's node and link counts equal the descriptor's.

### 2.3 A descriptor is optional

A graph given as a data document alone, with no descriptor, behaves as ADR-002 describes: it has no revision, uses no store, and takes its indexes from a caller option. A document's own `revision` has no effect without a descriptor. A page graph supplied inline needs no descriptor.

### 2.4 Start-up with a store

When a descriptor is given and a store is used, the worker:

1. opens the store (retrying a locked store for up to five seconds, then continuing in memory, as ADR-001 specifies);
2. reads the stored copy of the descriptor (2.5);
3. if the stored copy has the same `revision` (the `id` is equal by construction, since it names the store), restores: the data is not fetched and no index is created, since the store keeps its indexes. After the sweep of leftover scoped data, the worker compares the store's node count with `data.nodes`, and a difference means the store is incomplete and is treated as stale (step 4);
4. otherwise removes the stored copy, resets the store if it is not empty, fetches the data, validates it and checks 2.2, creates the indexes, loads, and writes the stored copy last.

If the store is locked after the retries, the worker loads in memory from the data and writes nothing. Without a store, the descriptor supplies the data location and the indexes, and the revision is unused.

### 2.5 The stored copy

The copy of the descriptor that records what the store holds is a file kept next to the store, not a node in the graph. The worker writes it with the browser's file API, at a path outside the directory the engine manages for the store, named from the descriptor's `id`. It is removed first and written last, so a copy that is present means the store holds the complete graph that copy describes. The exact path is left to implementation.

### 2.6 Store name

A store is named from the descriptor's `id` (a fixed prefix plus the `id`), so sites on one origin do not share a store. This replaces the separate site identifier in ADR-001. Graphs that use a store need distinct `id`s among the graphs of one origin, since two with the same `id` would contend for one store.

### 2.7 Validation

The core's validator checks descriptors as it checks data documents, and reports the path of the first problem (for example `data.nodes`). A descriptor that fails validation is not used and no store is opened.

### 2.8 Left to other decisions

The `shape` and `embeddings` sections, which the site-graph RFC defines. A catalog that lists several descriptors, for a site with several graphs. How the page gets the descriptor (embedded in the page or fetched), and its caching. Tooling that writes descriptors.

## 3. Alternatives Considered

- **The revision inside the data document only (ADR-001 as written).** Rejected: the whole document has to be fetched and parsed to decide whether to use it.
- **A bare revision string given to the page by the build.** Rejected as the only mechanism: it avoids the fetch, but has nowhere to carry the index list, the store's name, the counts for an integrity check, or the schema and embedding facts that will follow.
- **A metadata node in the graph (ADR-001 as written).** Rejected: it shows in queries, counts, views and scans, and needs a label that documents may not use.
- **HTTP validators on the data URL** (a conditional request, with the `ETag` kept beside the store). Rejected: it costs a request per page, depends on static hosts and CDNs giving stable validators across deploys, does not work for embedded data, and has nowhere to carry the index list or the schema and embedding facts.
- **The stored copy in IndexedDB.** Rejected: it adds a second storage mechanism to a feature that already needs the file storage the store uses, and so a second browser capability to test.
- **The revision in the store's name.** Rejected: a store per deploy accumulates, and removing old ones needs the engine's internal directory layout.
- **The descriptor as a section inside the data document.** Rejected: it cannot be read without the data.
- **A catalog of all graphs as the only form.** Rejected for now: a site with one graph needs only its descriptor, and a catalog can list descriptors later without changing them.
- **An existing graph-schema language for the whole descriptor** (the GQL graph-type and PG-Schema work, or Neo4j's data-model files). Not adopted: they describe schemas, and the descriptor's core is a version, a revision and a location. They are candidates for the `shape` section, to be examined when the site-graph RFC defines it; this decision has not verified their details.

## 4. Consequences

- A stored graph is produced as two files, a descriptor and a data document; the build step writes the descriptor last, with the data's counts. A small page graph needs neither. The stale path costs one request more than before (the descriptor), and a site that uses a store but gives no descriptor replays on every page: ADR-001's default of using the store in the `multi-page` profile only takes effect when a descriptor is given.
- With a matching store, a page restores without fetching the data. The wait is the descriptor plus the restore (about 0.35 s at 5,000 pages and 1.3 s at 20,000 in ADR-001's measurements).
- The graph holds nothing but the author's data. Counts, views and scans see no bookkeeping, and ADR-002's reserved label prefix is not needed.
- Staleness has the build's granularity: any change of `revision` replaces the whole stored graph.
- A new descriptor served with old cached data, or the reverse, is detected by the revision and count checks instead of loading a mixed graph.
- The stored copy lives outside the engine's store, so the worker uses the browser's file API directly, in addition to the engine. It needs the same browser capability as the store (a worker with synchronous file access). The copy and the store can diverge only if one is removed without the other; removing it first and writing it last makes every interruption end in a reset, and the count check after a restore catches a store that lost data on its own.
- Verified by the core package's tests in Chromium, Firefox and WebKit: reading, writing and removing the stored copy from a worker; that a restored store keeps its index; and a restore of 5,000 pages in 217, 310 and 260 ms (single runs) with no request for the data. Playwright's default WebKit context has no origin-private file system, so the tests run WebKit in a persistent profile.
- Not verified: the cost of reading the descriptor on every page (the tests give it as data); browsers other than these three on desktop, and mobile browsers.
- Follow-up: amend ADR-001 (the store-name rule and the staleness description in 2.4, which this replaces) and ADR-002 (remove the reserved label prefix from the unreleased amendment and make `revision` a consistency check only); the site-graph RFC defines `shape` and `embeddings`, and decides whether a catalog is needed; the core package's plan and specification take their revision, indexes and store name from the descriptor; a build helper that writes a descriptor from a data document (counts and revision).
- RFC question this decision informs: RFC-001 7.3 (what the wait for the graph consists of with a store).

## 5. Related

- RFCs: RFC-001
- ADRs: ADR-001 (worker hosting, the store and its retry rule), ADR-002 (the data document)
- Evidence: `design/spikes/SPIKE-002-astro-build-time-graph/SPIKE.md` (document size), `design/spikes/SPIKE-004-worker-hosting-and-faults/SPIKE.md` (replay and restore times), `design/spikes/SPIKE-005-worker-survival-across-navigation/SPIKE.md` (a restored store keeps its index)
