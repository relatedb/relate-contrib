---
id: SPIKE-008
title: The Engine's Browser Store as a Durable Application Store
status: done
rfcs: [RFC-006]
created: 2026-11-08
---

# SPIKE-008: The Engine's Browser Store as a Durable Application Store

## 1. Question

Can the engine's durable browser store (`opfs://<name>`, a dedicated-worker file store) carry an application graph, and where does it fall short? The spike measures the facts RFC-006 leaves open:

- RFC-006 goal "after a worker is terminated in the middle of a write, every change the page was told succeeded is present on restart", and the worker-termination and page-close cases behind it.
- RFC-006 §7.1 (several tabs): what a second holder sees, and how long until the store is free.
- RFC-006 §7.2 (migration): what a migration statement costs, and what a terminated one leaves behind.
- RFC-006 §7.5 (growth, recovery, checkpoints): how a store grows, how long it takes to reopen, and whether a limit appears.
- RFC-006 §7.6 (export fidelity): which values the engine stores and which survive the graph data format.
- RFC-006 §7.7 and §7.10: what the browser reports about persistence and quota.
- RFC-006 §7.9: store naming and isolation on one origin.

Not covered: RFC-006 §7.3 (content and application graph in one instance, namespaces), §7.4 (what the core promises when no store is available; the core's own tests already show WebKit's default context has none), §7.8 (damaged stores).

## 2. Method

A static harness in `harness/`: a small server (`serve.mjs`) serves a page, a dedicated module worker (`worker.js`, which loads the vendored engine package from `vendor/relate-wasm/pkg` and runs commands against one instance) and the engine package. `exp.mjs` holds the experiments and `run.mjs` runs them in Playwright's Chromium, Firefox and WebKit (WebKit in a persistent profile, as the core's browser tests do, because its default context has no origin-private storage). Raw results are in `harness/results/`, one JSON file per browser and experiment set.

- **E1, durability.** A worker writes `(:Item {id, payload})` nodes one statement at a time and records the number of finished statements in a `SharedArrayBuffer` the page can read, so the page knows exactly how many writes the engine had acknowledged. The page terminates the worker after 0.3 to 1.5 s (five cycles per browser), or closes the whole tab (three cycles), then reopens the store and checks that the count recovered is at least the count acknowledged, with ids 0..n−1 and no gaps.
- **E3, locks.** A second worker in the same tab, then a second tab, opens a store a first holder has open; then the first holder is terminated or the tab closed and the second retries every 100 ms.
- **E2, growth.** Bulk writes in statements of 500 nodes to 1,000, 5,000, 20,000, 50,000 and 100,000 nodes, and in a larger run to 200,000, 500,000, one million and two million (Chromium only). After each step the worker is terminated, the files under the origin-private root are summed, and the store is reopened and counted. A second store takes 20,000 single-node writes (200,000 in the larger run). Payload is 100 characters per node.
- **E4, values.** Each of 21 value literals is created as a node property by Cypher and read back as raw wire text. The results are checked against the core's validator for the graph data format.
- **E5, names and isolation.** Valid and invalid store names, and two stores open at once.
- **E6, migration.** Statements that add a property, rename a property and change a label over 50,000 nodes, timed. A 300,000-node statement is terminated after 100 ms and 400 ms; a variant with a `WHERE` clause and a resumable variant in id ranges are tried.
- **E7, persistence and quota.** `navigator.storage.estimate()`, `persisted()` and `persist()`.

All runs are single runs on one macOS machine, headless, with default browser profiles (WebKit persistent). Nothing here tests power loss or an operating-system crash, only termination of the worker and closing of the page. Synthetic data: one label, 100-byte string payload, no relationships and no indexes.

## 3. Time-box

One working session (about four hours).

## 4. Findings

### 4.1 Acknowledged writes survived every termination

In all 24 interrupted runs (five worker terminations and three page closes in each of three browsers), no acknowledged write was lost and the recovered ids had no gaps. After a worker termination the store held 0 to 3,447 more writes than the engine had acknowledged when the page read the count (in Chromium the worker kept running for seconds after `terminate()` was called; in Firefox and WebKit the difference was 0 to 1); after a page close it held 1 to 62 more. Those extra writes were whole, committed statements. This matches the engine's documented per-commit barrier for the browser store.

| | Worker terminated mid-write (store free again after) | Tab closed mid-write (store free again after) |
|---|---|---|
| Chromium | 3.0 to 3.4 s | 0.36 to 0.74 s |
| Firefox | 0.21 to 0.48 s | 0.17 to 0.38 s |
| WebKit | 0.08 to 0.11 s | 0.10 to 0.13 s |

Chromium's `terminate()` on a worker running a long synchronous loop took about 3 s to release the store. This is of the same order as the 2.3 s found earlier (ADR-001).

### 4.2 Several holders

- A second holder, in the same tab or another, is refused at once (1 to 3 ms) with the message `storage locked: opfs://<name>`, in all three browsers.
- A holder that is idle and then terminated or closed frees the store in 19 to 121 ms (reopen succeeded on the first try in each browser).
- The store serves one holder at a time. Nothing in these runs offered a way to read from a store another tab holds.

### 4.3 Growth and recovery

- **Size on disk is the same in all three browsers and deterministic**: 218,910 bytes for 1,000 nodes, 1.10 MB for 5,000, 4.44 MB for 20,000, 11.1 MB for 50,000, 22.3 MB for 100,000 (about 220 bytes per node with a 100-byte payload). Larger Chromium runs: 44.8 MB at 200,000, 164 MB at 500,000 (not proportional, so the store holds a snapshot and log in different proportions at different times), 244 MB at one million, 424 MB at two million.
- **The file count is constant.** Every store used 65 files (the catalog and the 64 pooled slots) at every size up to two million nodes. No pool exhaustion or other error appeared.
- **Time to open an existing store (the figure is the open call alone; the first count query adds 22 to 128 ms in Chromium between 5,000 and 100,000 nodes, and 1.3 s at one million):**

  | Nodes | Chromium | Firefox | WebKit |
  |---|---|---|---|
  | 5,000 | 27 ms | 80 ms | 37 ms |
  | 20,000 | 65 ms | 114 ms | 61 ms |
  | 100,000 | 332 ms | 388 ms | 292 ms |
  | 500,000 | 1.27 s | not run | not run |
  | 1,000,000 | 2.8 s | not run | not run |
  | 2,000,000 | 6.3 s | not run | not run |

  For comparison, ADR-001 measured 0.35 s to restore a 5,000-page graph from a store; these graphs have a different shape, so the figures are not directly comparable.
- **A single-statement write costs** about 0.5 ms in Chromium, 0.2 ms in Firefox and 0.08 ms in WebKit (medians). Over 200,000 single writes in Chromium the median stayed near 0.5 ms and the 1,000 last writes had a worst case of 421 ms, against 20 ms in the first 1,000. A stall of that size appears in each long run (45 ms in Firefox, 35 ms in WebKit at 20,000). It may be a checkpoint on the write path; the spike did not confirm that.
- **There is no API to trigger a checkpoint, to measure the store, or to export it.** The engine's JavaScript surface is the constructor, `open`, `execute`, `executeScript` and `reset`.
- Storage quota in these profiles was 10.7 GB (Chromium, Firefox) and 20.6 GB (WebKit); nothing approached it.

### 4.4 A terminated statement can be partly applied

A migration over 300,000 nodes written as `MATCH (n:Item) SET n.v3 = …` takes about 2 s. Terminated at 100 ms it left no change in Firefox and WebKit; terminated at 400 ms it left exactly 50,000 of 300,000 nodes updated in both. The engine's documented behaviour for a statement of this shape (a bare `MATCH` with no `WHERE` and one write clause, touching at least 10,000 entities) is to apply it in batches of about 25,000, each its own commit, and to accept that "batches committed before a failure stay committed". Written with a `WHERE` clause (`WHERE n.id >= 0`), the same statement terminated at 400 ms left none applied in Firefox and WebKit. A migration written as 30 range statements (`WHERE n.id >= $lo AND n.id < $hi AND n.v3 IS NULL`) is resumable by running it again, and took 9.8 s (Firefox), 9.3 s (WebKit) and 6.6 s (Chromium) for 300,000 nodes.

Costs of the 50,000-node migrations (Chromium, Firefox, WebKit): adding a property 292, 280, 233 ms; renaming a property 607, 589, 462 ms; changing a label 668, 664, 538 ms; writing a version marker 1 to 3 ms.

In Chromium the terminated statements ran to completion (all 300,000 nodes updated) and the store was free about 4 to 6 s after `terminate()`. Chromium did not interrupt the engine in the middle of a statement.

### 4.5 What survives an export in the graph data format

| Value written by Cypher | Wire form from the engine | Under the graph data format |
|---|---|---|
| integer up to 2^53 | number | kept |
| integer beyond 2^53 (for example 9007199254740993) | exact digits | lost: `JSON.parse` gives ...992 |
| float | number | kept |
| whole float (`2.0`) | `2.0` | becomes an integer on reload (`Number.isInteger(2)`) |
| `NaN` | the string `"NaN"` | becomes a string |
| string, empty string, unicode, boolean | as written | kept |
| `null` as a property | the property is not stored | consistent with the format (leave it out) |
| date, datetime, duration | string with a typed column | loads back as a string: the type is lost |
| point | an object (`srid`, `crs`, `latitude`, `longitude`) | rejected by the validator |
| list of integers, floats or strings | array | kept |
| list of mixed integers and floats | stored as floats (`[1.0, 2.5]`) | kept |
| empty list | `[]` | rejected by the validator (an empty array is not a value) |
| list of lists, map as a property | the engine rejects them (`InvalidPropertyType`) | not applicable |

A node whose `id` property is not a non-empty string (for example an integer, as in this spike's own data) fails validation, and a node with no `id` property cannot be exported at all. Relationship ids, indexes and constraints are not part of the format.

### 4.6 Names, isolation and the persistence grant

- A store name must be 1 to 64 characters from `[A-Za-z0-9_-]`; 64 characters, dashes and underscores succeed; 65 characters, a dot, a space and the empty string fail with `OPFS name must be 1-64 characters from [A-Za-z0-9_-]`.
- Two stores open at once in one origin were independent (5 nodes in one, none in the other).
- `navigator.storage.persisted()` was `false` in all three browsers. `persist()` returned `false` in Chromium and WebKit; in Firefox it did not answer within 3 s, and the first attempt with no time limit hung the run (a permission prompt in a headless browser).

## 5. Conclusion

The engine's browser store is a sound base for application graphs. Acknowledged writes survived every worker termination and tab close, the file count is fixed, reopen time grows roughly linearly with node count and stays under 400 ms for 100,000 nodes in all three browsers, and a second holder is refused at once with a recognisable message. The gaps are in the contract around it, and most are in the core and the application, not in the engine.

For RFC-006 (the RFC is not edited by this spike; the points below are text to consider):

- **Durability goal.** "After a worker is terminated in the middle of a write, every change the page was told succeeded is present on restart" held in 24 of 24 runs; the RFC can state it as met by the engine's store, and say that power-loss and operating-system-crash behaviour is unmeasured.
- **§7.1, several tabs.** Refusal is immediate and reliable, so "later tabs wait and retry", "later tabs run in memory with a warning" and "an elected owner" are all implementable; "later tabs read" is not, because no tab can open a store another holds. A tab that closes frees the store within about 0.4 s; a busy Chromium worker that is terminated can hold it for about 3 s.
- **§7.2, migration.** The RFC's candidate of "a numbered series of migration statements" needs a rule: a statement over thousands of nodes written as a bare `MATCH … SET` is not atomic if interrupted. A migration should be written with `WHERE` clauses and in bounded, resumable steps, with the schema version written last, so that an interrupted migration reruns safely.
- **§7.5, growth and recovery.** No limit appeared up to two million nodes (424 MB); reopen time is 0.3 s at 100,000 and 6 s at two million nodes in Chromium. The question that remains is the stall (421 ms worst case) and who triggers a checkpoint; the engine's JavaScript surface has no checkpoint, size or export call. These need an engine request or a separate measurement with a size-reporting hook.
- **§7.6, export.** The graph data format loses information for applications that store large integers, whole-number floats, dates, durations, points or empty lists, and requires string node ids. Export for backup needs either a richer format or the engine's own snapshot, which the browser build cannot produce. This is a request to the engine's maintainers or a format decision.
- **§7.7 and §7.10.** `persist()` cannot be assumed to be granted, and in Firefox it can wait on a prompt, so the core must not block on it. Quota in these profiles is in gigabytes.
- **§7.9, naming.** A store name is one segment of at most 64 characters from `[A-Za-z0-9_-]`, so a name derived from an application id needs a mapping rule (and a collision rule); two names on one origin are independent.

For ADR-008: a single provider statement is atomic only below the engine's batching threshold (about 10,000 entities for a bare `MATCH`); the provider's statements carry `WHERE` clauses on `id`, so this does not affect them, but the demo's reset and any migration must be written with the rule above.

Not answered: RFC-006 §7.3 (one instance for both graphs, namespaces) and §7.4 and §7.8; behaviour under power loss; the cause of the long-run stalls; whether Firefox and WebKit behave like Chromium at one million nodes and beyond.
