---
id: SPIKE-004
title: Worker Hosting and Fault Recovery in Astro
status: planned
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
