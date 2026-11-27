---
id: SPIKE-002
title: Build-Time Content Graph in Astro
status: done
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-002: Build-Time Content Graph in Astro

## 1. Question

In an Astro site, can a site's pages and links be turned into a graph at build time, delivered to a browser WASM instance, and queried from a page, and what does each step cost and require?

This answers, for a second framework:
- RFC-001 §7.3: how a graph reaches the instance, and what each way costs for a site-sized graph.
- RFC-001 §7.8 (asked as §7.9 before it was merged into 7.8): whether a checkpoint written by the native Node library can be used by the WASM build, or whether the graph has to be built with the WASM build itself.
- RFC-001 §7.7: bundler handling of the `.wasm` asset in a Vite-based framework (SPIKE-001 covered Observable Framework).

It also observes §7.1 (module size and start-up) in this setting.

Out of scope: embeddings, a navigation element, and a graph schema richer than pages and links. Those belong to later RFCs.

## 2. Method

1. **Establish how the WASM build can take a graph at all, in Node, before involving Astro.** The WASM type declarations expose `execute`, `executeScript`, `reset`, and an OPFS-backed `open`, with no direct snapshot import. So the candidate delivery routes are replaying statements, and placing a snapshot in the browser's origin-private storage and opening it (Relate ADR-0145, dedicated worker only). Read that decision for the store layout, then try both:
   - Replay: build a small graph, serialize it as a `CREATE` script, and load it into a fresh WASM instance.
   - Checkpoint: build the same graph with the native Node library (the C library is built from the local Relate checkout; the Node package is not on npm), write a JSON checkpoint, and test whether anything in the WASM build can open it. If native is impractical to build, build the graph with the WASM build in Node and record that as the fallback.
2. **Astro site.** A handful of content pages with links between them. A build-time step reads the content, extracts pages and links into a graph, and writes the chosen delivery artifact (a script and/or a snapshot) as a static asset.
3. **Browser island.** A client-side island loads the WASM module and the artifact, and runs a query over the pages-and-links graph. Reuse the SPIKE-001 normalization and tagged-template client where they apply. If both delivery routes work, compare them.
4. **Measure on a production build.** Artifact size (raw and compressed) for the sample site and for a scaled-up synthetic site (for example 100 and 1,000 pages), load and query time, and module size. Record every bundler step needed to get the `.wasm` file served (§7.7), and how the island behaves under the framework's render modes.

## 3. Time-box

One working day. If step 1 shows no workable route to a snapshot, stop that thread, take the replay route through steps 2–4, and record the missing capability as a request for the Relate maintainers (RFC-001 §7.8).

## 4. Notes

- 2026-11-01: The WASM type declarations (`cypherlite.d.ts`, Relate 0.14.0) expose only `execute`, `executeScript`, `reset`, `new CypherliteDb()` and the OPFS-backed `open`. There is no snapshot import call, so "load a snapshot" in the browser means either replaying statements or getting the snapshot into OPFS first. This shaped the method above.
- 2026-11-01, step 1, replay routes (WASM engine in Node, `scripts/delivery.mjs`, synthetic sites with 5 links per page; results in `astro-graph/results/`). Three ways to load the same graph into a fresh instance: **A1** one `CREATE` statement with a variable per page and link; **A2** a script with one `CREATE` per page and one `MATCH … CREATE` per link; **B** two fixed `UNWIND` statements over JSON parameters. With an index on `Page.id`:

  | pages | route | payload KB | gzip KB | brotli KB | load ms |
  |---|---|---|---|---|---|
  | 100 | A1 | 23.3 | 2.8 | 1.4 | 15.5 |
  | 100 | A2 | 42.1 | 3.0 | 1.5 | 38.9 |
  | 100 | B | 15.2 | 2.3 | 1.3 | 13.2 |
  | 1,000 | A1 | 246.5 | 30.5 | 14.9 | 142.4 |
  | 1,000 | A2 | 433.2 | 31.2 | 15.4 | 287.5 |
  | 1,000 | B | 164.6 | 26.7 | 13.3 | 98.8 |
  | 5,000 | A1 | 1,293.4 | 164.4 | 82.3 | 2,224.0 |
  | 5,000 | A2 | 2,222.3 | 158.4 | 82.0 | 1,318.4 |
  | 5,000 | B | 879.5 | 139.9 | 67.5 | 509.9 |

  Route B is the smallest and fastest at every size: 5,000 pages and 25,000 links load in about 0.5 s from a 67.5 KB brotli-compressed payload. Without the index, every link lookup scans the pages: at 1,000 pages A2 took 6.3 s and B 5.9 s, while A1 (which looks nothing up) took 138 ms. So the index, or a route that avoids lookups, matters more than the route. Queries over the loaded graph took under 1 ms for one hop and two hops at 1,000 pages (about 4 ms for A1 at 5,000, which had no index). Node timings only indicate the engine's cost; a browser adds its own overhead.
- 2026-11-01, step 1, native checkpoint (`scripts/native-checkpoint.mjs`). The native C library built from the checkout in 32 s (output kept outside the checkout), and the Node client ran against it with `CYPHERLITE_LIB` set and koffi installed in a scratch copy of the client. A writable `Database.open` of a missing path created the store. With `CYPHERLITE_SNAPSHOT_FORMAT=json` a checkpoint is an ordinary directory: `graph.json` (nodes and relationships with full properties), `manifest.json` (`{"codec": "json", "checkpoint_lsn": …, "commit_ts": …}`) and a `wal/` directory, and it reopens read-only in native with the right counts. Its `graph.json` is larger than the route B payload for the same graph:

  | pages | `graph.json` raw KB | gzip KB | brotli KB | route B raw KB | gzip KB | brotli KB |
  |---|---|---|---|---|---|---|
  | 1,000 | 478.5 | 45.2 | 19.6 | 164.6 | 26.7 | 13.3 |
  | 5,000 | 2,469.7 | 215.4 | 87.6 | 879.5 | 139.9 | 67.5 |

  (The two graphs differ in which pages link where, but have the same node and link counts.)
- 2026-11-01, step 1, conclusion for §7.8. No public API of the WASM build opens a native checkpoint. The only conceivable route is to write the browser's origin-private store by hand: a catalog file in Relate's internal binary format (magic `MDBOPF01`, a CRC, and a path-to-slot map) plus 64 slot files, created from inside a dedicated worker at runtime, because a build step cannot write to a visitor's origin-private storage. That depends on an internal format and was not attempted. The route that works is replay: ship the graph as data and load it with fixed `UNWIND` statements. That also means the build step does not need Relate at all (it emits JSON for pages and links), and native is only needed when the graph is built or queried on a server.

## 5. Findings

Environment: Astro 7.4.4 (Vite-based), Node 24.14.1, Relate 0.14.0 built from a local checkout, macOS arm64. Browser measurements are from the production build served by `astro preview` on localhost, with the instance on the main thread.

**5.1 The build-time step is a static endpoint over the content collection.** `src/pages/graph.json.ts` reads the `pages` collection (`getCollection`), pulls internal links out of each entry's raw Markdown body, and returns `{pages, links}`. Astro writes it to `dist/graph.json` at build time, and the dev server serves it from the same code. For the 11 sample pages it produced 27 links, which matches the links in the Markdown by hand count; the file is 1,237 bytes. The whole site (13 pages including the endpoint) built in about 570 ms. This step uses no Relate.

**5.2 Delivery is replay.** The island opens a fresh instance, creates an index on `Page.id`, and runs two fixed `UNWIND` statements over the JSON (the best route from step 1). Everything needed to query the graph is the module binary plus that JSON.

**5.3 Bundler handling needed no workaround (RFC-001 §7.7).**
- A `<script>` that imports the package bundled to a single 15.9 KB JavaScript file, and the `.wasm` was emitted once as `_astro/cypherlite_bg.<hash>.wasm` (5,973,771 bytes).
- Vite rewrote the glue's default `new URL(…, import.meta.url)` lookup to that hashed path. So `init()` with no argument works, in dev and in production, and so does passing the URL from the package's documented `?url` import. Both resolve to the same single binary. Under Observable Framework the default lookup returned a 404 (SPIKE-001).
- An out-of-tree symlinked package, which broke Observable's build, builds in Astro, and the dev server serves the binary from outside the project (HTTP 200, `application/wasm`). The page was not run in a browser in that configuration.

**5.4 Measurements (browser, production build).**

| graph | graph JSON bytes | JSON gzip (on the wire) | init ms | load ms | first query ms |
|---|---|---|---|---|---|
| 11 pages, 27 links (site) | 1,237 | 363 | 36.6 | 6.6 | 1.6 |
| 100 pages, 500 links | 15,788 | not measured | 16.4 | 41.3 | 3.1 |
| 1,000 pages, 5,000 links | 170,561 | 27,620 | 16.6 | 191.0 | 7.2 |
| 5,000 pages, 25,000 links | 910,609 | 142,631 | 19.0 | 533.1 | 30.2 |

- Module: 5,974,071 bytes transferred. `astro preview` served it uncompressed even when the request accepted gzip and brotli, while JSON was compressed, so compression of the binary is a hosting concern. The earlier brotli figure for the same file is 1.46 MB.
- `init` (fetching, compiling and instantiating the module, binary already on localhost) took 16–37 ms, the first load being the slowest; `new CypherliteDb()` took 0.2–0.5 ms.
- Load time with the index is about 2–3 times the Node figure at 100 and 1,000 pages (13 ms and 99 ms in Node) and about equal at 5,000 (510 ms). The first query looks up pages by an unindexed property (`slug`), and its time grows linearly with the graph.
- Loading and querying are synchronous, so at 5,000 pages the load blocks the page for about half a second. A worker would avoid that; it was not tested.
- In dev, with the 11-page site, `init` took 14 ms and loading 14 ms.

**5.5 Queries returned correct answers over the site's own content.** Pages linking to "snapshots" (5, matching the links in the Markdown), most linked-to pages (workers 6, snapshots 5, bundlers 3, overview 3, faults 2), pages within two hops of the overview, and the one page nothing links to (the changelog).

**5.6 Astro notes.** In Astro 7.4.4 the collection config imports `defineCollection` from `astro:content`, `glob` from `astro/loaders` and `z` from `astro/zod`, and `render(entry)` is a function. The glob loader exposes the raw Markdown as `entry.body`. The package requires Node 22.23.4 or later.

**5.7 Not covered.** A worker; a framework component island (the island is a plain script, so server-render and hydration consistency, RFC-001 §5.4, was not exercised); navigation between pages (Astro's client-side router was not tried, so §7.6 is untouched); cold-network load time; and any Astro integration beyond a static endpoint.

## 6. Conclusion

- **§7.3 (how a graph reaches the instance).** For a content site, ship the graph as JSON and load it with fixed `UNWIND` statements. It is small (about 0.9 MB raw and 143 KB gzipped for 5,000 pages), needs no Relate at build time, and loads in about 0.2 s for 1,000 pages and 0.5 s for 5,000 on the main thread. The index on the lookup property matters (step 1: without it, 1,000 pages took about 6 s). Whether a worker removes the main-thread block is the next thing to measure.
- **§7.8 (native checkpoint into WASM).** Not workable through any public API (step 1). The build does not need native Relate; native matters only where a graph is built or queried on a server.
- **§7.7 (bundler handling).** In a Vite-based framework the adapter needed nothing beyond importing the package: the default lookup and the explicit URL both work, and an out-of-tree symlink does not break the build. This contrasts with Observable Framework, where the adapter had to place the binary and pass its URL. The core's asset-location input is still worth keeping for frameworks that do not rewrite the lookup. Other Vite-based frameworks are likely similar, but only Astro was tested.
- **§7.1 (size and start-up).** 5.97 MB uncompressed, 1.46 MB brotli; initialization took 16–37 ms with the binary already local. A cold network fetch was not measured.

Suggested wording for RFC-001's open questions, to apply manually:

> 7.3 (partial answer, SPIKE-002): replaying the graph as JSON through two fixed `UNWIND` statements, with an index on the lookup property, loaded 1,000 pages and 5,000 links in about 190 ms and 5,000 pages and 25,000 links in about 530 ms in a browser on the main thread, from a 143 KB gzipped payload. Without the index, 1,000 pages took about 6 s in Node. Worker use was not tested.
>
> 7.8 (answer, SPIKE-002): no public API of the WASM build opens a checkpoint written by the native library. A content site does not need one, because the build step emits JSON and the browser replays it; the native library is relevant only to server-side graphs.
>
> 7.7 (partial answer, SPIKE-002): under Astro (Vite) the adapter needed no step for the `.wasm` asset: the bundler rewrote the default lookup and emitted one hashed binary, and an out-of-tree symlinked package built and served in dev. Under Observable Framework the adapter had to place the binary and pass its URL. Frameworks outside the Vite family remain untested.

**Gaps for follow-up.** Run the instance in a worker and measure main-thread blocking (RFC-001 §7.2, §7.6); try Astro's client-side navigation to see whether one instance can survive page changes; exercise server-render and hydration with a framework component island; measure a cold network fetch with the binary compressed.
