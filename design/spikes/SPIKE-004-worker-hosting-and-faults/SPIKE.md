---
id: SPIKE-004
title: Worker Hosting and Fault Recovery in Astro
status: done
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-004: Worker Hosting and Fault Recovery in Astro

## 1. Question

Does hosting the browser CypherLite instance in a dedicated worker remove the main-thread block caused by replaying the site graph, what does each query cost across the message boundary, and how is a trapped or runaway instance replaced without losing the page or the state of components that depend on it?

Parent open questions in RFC-001:

- §7.3: does a worker remove the main-thread block, and at what graph size does replay stop being acceptable for a first load?
- §7.2: can a trapped instance be replaced transparently for components that hold query state, and what must an adapter expose so components recover cleanly?
- §7.6: does a worker owned by the page that persists under client-side routing give both persistence and relief from the main-thread block?

Also observed: fault containment (RFC-001 §5.2).

Out of scope: embeddings and the navigation element.

## 2. Method

0. **Read the guidance first (first hour).** In the local CypherLite checkout, read what it says about workers and traps (`docs/api/wasm/spec.md`, the bundled trap helper, the `examples/wasm-playground` worker) and work out how to provoke a trap on purpose. If no query provokes one, record that and use terminating the worker as the stand-in for a crash.
1. **Set up.** Copy SPIKE-003's `astro-nav` into this spike's directory as `astro-worker`. Add a dedicated-worker host with an async query interface, owned by a persisted island or a module-level singleton under client-side routing. The worker fetches the binary and the graph itself (fetch worked in a dedicated worker in SPIKE-003).
2. **Main thread against worker** at 1,000 pages, 5,000 pages and a larger synthetic graph. Measure main-thread blocking during load (long tasks, and frame gaps while an animation runs), time to first query, and the per-query round trip for small and large results.
3. **Faults.** Provoke a trap and a runaway query. Measure the time to replace the worker and replay at each graph size, and what a component with registered queries sees (error state, recovery, retries). Design the smallest interface the adapter must expose, for example an instance generation counter and re-running of registered queries. Terminate a runaway query by terminating the worker and measure it.
4. **Navigation.** Observe whether client-side navigation stays usable while the worker loads and while it recovers.
5. **If time remains:** observe whether the dedicated worker's origin-private persistence (opening a stored graph instead of replaying) shortens a repeat visit, since a dedicated worker is the only place it can run. Record the cost to open against the cost to replay.

## 3. Time-box

One working day. If no query provokes a trap, spend the time on worker termination as the crash stand-in and move on to step 4. Step 5 is dropped if steps 1–4 take the full day.

## 4. Notes

- 2026-11-01, step 0. CypherLite's WASM contract says a Rust panic traps the module, the instance is unusable afterwards, and the remedy is a new worker or a page reload; `isWasmTrap` (shipped as `trap.js`) classifies an error by type and by message. A trap can be provoked on purpose (see 5.3). Probed in Node with `scripts/trap.mjs`.
- 2026-11-01, setup. The site is a copy of SPIKE-003's `astro-nav` (`astro-worker/`), with a dedicated worker and a client that replaces it after a fault.
- 2026-11-01, measurement. The embedded browser did not render the page during these runs, so `requestAnimationFrame` never fired and `PerformanceObserver` reported no long tasks. Main-thread blocking was measured with a 4 ms timer heartbeat instead (largest gap between ticks), which does not depend on rendering. The first main-thread run of the session was slower than later ones (1,000-page replay 388 ms against 160 ms), so differences under about 2× in the single runs below are not reliable.
- 2026-11-01, client-side router swaps stalled in the embedded browser again (as in SPIKE-003), so navigation timing under a loading or recovering worker was not measured (see 5.5).
- 2026-11-01, a replacement worker that failed to open the store (`storage locked`) left the client stuck in "recovering" and its readiness promise rejected. The client has no retry; the retry-until-free measurement in 5.4 was done by hand.

## 5. Findings

Figures are from a production build (`astro build`, `astro preview`) in the embedded browser, one run per cell unless stated. Raw numbers are in `astro-worker/results/browser-runs.json`. Synthetic sites of 1,000 pages (5,000 links), 5,000 pages (25,000 links) and 20,000 pages (100,000 links), replayed through two fixed statements with an index on `Page.id`.

### 5.1 Main thread against a dedicated worker (RFC-001 §7.3)

| graph | host | ready | replay | largest main-thread gap while loading |
|---|---|---|---|---|
| 1,000 pages | main thread | 203 ms | 161 ms | 162 ms |
| 1,000 pages | worker | 324 ms | 288 ms | 5.3 ms |
| 5,000 pages | main thread | 642 ms | 593 ms | 602 ms |
| 5,000 pages | worker | 1,415 ms | 1,396 ms | 7.5 ms |
| 20,000 pages | main thread | 2,320 ms | 2,213 ms | 2,247 ms |
| 20,000 pages | worker | 6,252 ms | 6,212 ms | 6.9 ms |

- **The worker removes the main-thread block.** The largest gap in the page's timer stayed at 5–9 ms for every size, while on the main thread the page was blocked for the whole replay (0.16 s, 0.6 s, 2.2 s).
- **The worker's replay takes longer:** 1.8× at 1,000 pages, 2.4× at 5,000, 2.8× at 20,000. Not investigated. So the page becomes interactive at once but the graph is ready later (1.4 s at 5,000 pages, 6.3 s at 20,000).
- **Queries across the message boundary cost little.** A one-row query took 0.1–0.3 ms in both hosts. A 5,000-row result took 32 against 34 ms (1,000 pages), 49 against 50 ms (5,000) and 70 against 71 ms (20,000); the engine, not the transfer, dominates. Returning the raw JSON string and parsing it on the page saved about 1–2 ms.
- First query after ready: 1–6 ms in both hosts.

### 5.2 Persistent store in the worker (RFC-001 §5.2 "what the instance starts with")

The same worker, opening an origin-private store (`CypherliteDb.open("opfs://name")`) and replaying only when the store is empty:

| graph | first visit (replay and store) | repeat visit (restore) | worker replay without a store | main-thread replay |
|---|---|---|---|---|
| 5,000 pages | 1,490 ms | 345–358 ms | 1,415 ms | 642 ms |
| 20,000 pages | 6,892 ms | 1,322 ms | 6,252 ms | 2,320 ms |

- A repeat visit restored every page and link (5,000 and 25,000; 20,000 and 100,000). Opening took 328–333 ms at 5,000 pages and 1,301 ms at 20,000: 4–5× faster than replaying in the worker and about 2× faster than replaying on the main thread, without blocking it (largest gap 9.4 ms).
- Restoring is not free, and its cost grows with the graph.
- A stored graph can be stale after a deploy changes the content. Not tested; the page would have to compare a version or content hash.
- **One tab at a time:** a second tab that opened the same store while the first held it failed with `storage locked: opfs://s5000`, as the CypherLite contract describes. A shared-worker design (SPIKE-003) cannot use it either, since the store opens only in a dedicated worker.

### 5.3 Provoking a trap (§7.2, §5.2 fault containment)

- **A trap can be provoked on purpose.** A statement with deeply nested parentheses or list literals (`RETURN ((((...1...)))) AS x`) fails with "Maximum call stack size exceeded" at a nesting of 1,000 (a nesting of 100 runs normally), and so did 100,000 chained additions. Other long chains (unary minus, `NOT`, short additions) are rejected by the engine with an ordinary error ("maximum nesting depth of 500 exceeded"), so the 500-level limit does not cover parentheses and lists. A thousand characters of user-supplied query text is enough to trap the instance.
- **`isWasmTrap` recognizes the first failure and misses the second.** The first failure was a JavaScript `RangeError` (stack exhaustion), classified as a trap through its message. A later call on the same instance threw "recursive use of an object detected which would lead to unsafe aliasing in rust", which `isWasmTrap` classifies as not a trap, although the instance is unusable. An adapter has to mark the instance dead at the first trap instead of classifying each later error.
- **In the same module, other instances were unaffected** in a Node check: a second instance and a new instance both answered afterwards. Not checked beyond that.

### 5.4 Replacing the instance (§7.2)

The worker client terminates the worker on a trap, a timeout or a worker error, starts a new one, and re-runs every registered query.

| graph | trap detected | replacement ready after trap | runaway query stopped | replacement ready after runaway |
|---|---|---|---|---|
| 1,000 pages | 1.9 ms | 300 ms | 1,503 ms | 293 ms |
| 5,000 pages | 2.6 ms | 1,478 ms | 1,502 ms | 1,448 ms |
| 20,000 pages | 3.2 ms | 6,835 ms | 1,502 ms | 7,096 ms |

- Recovery costs the same as a first load in the worker, so it grows with the graph; the page stays responsive throughout because the work is in the worker.
- With a stored graph, recovery after a trap took 361 ms at 5,000 pages (a restore) instead of 1,478 ms.
- **A runaway query** (a three-way cartesian `count(*)` over the pages) ran until the call-site timeout, which then terminated the worker; the timeout fired at 1,502 ms for a 1,500 ms limit.
- **Terminating a worker that is running a query leaves the store locked.** After a timeout termination the replacement failed with `storage locked: opfs://s5000`, and the store opened again about 2.3 s later (retrying every 100 ms). After a trap, where the worker was idle at termination, the replacement opened at once.
- **What components saw:** two registered queries received `recovering` and then `ready` with fresh rows and the new generation, with no retry code of their own. A one-shot query in flight when the trap happened rejected with `trap: true`, and a query sent while recovering waited for the new instance.
- **Not exercised:** page-scoped data added on top of the site graph (SPIKE-003's overlay) lives in the instance and is lost with it; the client has no hook yet to re-apply it per generation.

### 5.5 Navigation while loading (§7.6)

- With the 20,000-page graph loading in the worker, the router handled a click on a link within 1 ms and had fetched the next page 5 ms later; the page was not blocked.
- The router swap itself stalled in the embedded browser, so arrival time at the next page and the persistence of the worker handle across swaps were not observed. The handle is held in module state, as SPIKE-003's main-thread singleton was, which survived swaps; that is an expectation, not a result of this spike.

## 6. Conclusion

- **§7.3.** A dedicated worker removes the main-thread block completely (a gap of 5–9 ms at every size, against 0.16 s, 0.6 s and 2.2 s for replay on the main thread at 1,000, 5,000 and 20,000 pages) at the cost of a longer wait for the graph: replay in the worker takes 1.8–2.8× as long (1.4 s at 5,000 pages, 6.3 s at 20,000). Main-thread replay stops being comfortable at about 5,000 pages (a 0.6 s freeze). A stored graph in the worker brings repeat visits to 0.35 s (5,000 pages) and 1.3 s (20,000 pages), but only one tab at a time can open it.
- **§7.2.** A trapped or runaway instance can be replaced without losing the page, and registered queries can recover without code of their own. The smallest interface found is a generation counter, a status (`loading`, `ready`, `recovering`), a call-site timeout that terminates the worker, and queries that re-run on each new generation. The adapter has to mark an instance dead at its first trap, retry opening a stored graph while it is locked, and re-apply any page-scoped data. Recovery costs a full load.
- **§7.6.** A dedicated worker held by the page that persists is workable (the page stays responsive while it loads and recovers). Whether the worker handle survives client-side swaps was not observed here.

Paste-ready wording for RFC-001:

> 7.3 (answer, SPIKE-004): a dedicated worker removes the main-thread block (largest gap 5–9 ms at 1,000, 5,000 and 20,000 pages, against 0.16 s, 0.6 s and 2.2 s for main-thread replay), but replay in the worker takes 1.8–2.8× as long (about 1.4 s at 5,000 pages and 6.3 s at 20,000). Opening a stored graph in the worker instead of replaying took about 0.35 s at 5,000 pages and 1.3 s at 20,000, but a second tab cannot open the same store while the first holds it. Remaining question: what causes the slower replay in the worker, and whether the store can be used by more than one tab.
>
> 7.2 (answer, SPIKE-004): a trap (provoked by a statement with about a thousand nested parentheses) or a runaway query was handled by terminating the worker and starting a new one, re-running registered queries; recovery took the same time as a first load (0.3 s at 1,000 pages, 1.5 s at 5,000, 6.8 s at 20,000, or 0.36 s at 5,000 with a stored graph). The adapter has to expose a generation counter, a status and a call-site timeout, mark an instance dead at its first trap (`isWasmTrap` misses the second error), retry a locked store (a worker terminated mid-query held the store for about 2.3 s), and re-apply page-scoped data.

Gaps: whether the worker handle persists across client-side swaps (pending a rendering-capable browser); why replay is slower in a worker; stored-graph staleness after a deploy; repeated measurements.
