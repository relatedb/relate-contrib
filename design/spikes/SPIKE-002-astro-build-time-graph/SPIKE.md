---
id: SPIKE-002
title: Build-Time Content Graph in Astro
status: planned
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-002: Build-Time Content Graph in Astro

## 1. Question

In an Astro site, can a site's pages and links be turned into a graph at build time, delivered to a browser WASM instance, and queried from a page, and what does each step cost and require?

This answers, for a second framework:
- RFC-001 §7.3: how a graph reaches the instance, and what each way costs for a site-sized graph.
- RFC-001 §7.9: whether a checkpoint written by the native Node library can be used by the WASM build, or whether the graph has to be built with the WASM build itself.
- RFC-001 §7.7: bundler handling of the `.wasm` asset in a Vite-based framework (SPIKE-001 covered Observable Framework).

It also observes §7.1 (module size and start-up) in this setting.

Out of scope: embeddings, a navigation element, and a graph schema richer than pages and links. Those belong to later RFCs.

## 2. Method

1. **Establish how the WASM build can take a graph at all, in Node, before involving Astro.** The WASM type declarations expose `execute`, `executeScript`, `reset`, and an OPFS-backed `open`, with no direct snapshot import. So the candidate delivery routes are replaying statements, and placing a snapshot in the browser's origin-private storage and opening it (CypherLite ADR-0145, dedicated worker only). Read that decision for the store layout, then try both:
   - Replay: build a small graph, serialize it as a `CREATE` script, and load it into a fresh WASM instance.
   - Checkpoint: build the same graph with the native Node library (the C library is built from the local CypherLite checkout; the Node package is not on npm), write a JSON checkpoint, and test whether anything in the WASM build can open it. If native is impractical to build, build the graph with the WASM build in Node and record that as the fallback.
2. **Astro site.** A handful of content pages with links between them. A build-time step reads the content, extracts pages and links into a graph, and writes the chosen delivery artifact (a script and/or a snapshot) as a static asset.
3. **Browser island.** A client-side island loads the WASM module and the artifact, and runs a query over the pages-and-links graph. Reuse the SPIKE-001 normalization and tagged-template client where they apply. If both delivery routes work, compare them.
4. **Measure on a production build.** Artifact size (raw and compressed) for the sample site and for a scaled-up synthetic site (for example 100 and 1,000 pages), load and query time, and module size. Record every bundler step needed to get the `.wasm` file served (§7.7), and how the island behaves under the framework's render modes.

## 3. Time-box

One working day. If step 1 shows no workable route to a snapshot, stop that thread, take the replay route through steps 2–4, and record the missing capability as a request for the CypherLite maintainers (RFC-001 §7.8).

## 4. Notes

- 2026-11-01: The WASM type declarations (`cypherlite.d.ts`, CypherLite 0.14.0) expose only `execute`, `executeScript`, `reset`, `new CypherliteDb()` and the OPFS-backed `open`. There is no snapshot import call, so "load a snapshot" in the browser means either replaying statements or getting the snapshot into OPFS first. This shaped the method above.

## 5. Findings

_(filled in once the spike concludes)_

## 6. Conclusion

_(filled in once the spike concludes)_
