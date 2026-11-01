---
id: SPIKE-001
title: CypherLite WASM in Observable Framework
status: done
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-001: CypherLite WASM in Observable Framework

The spike was first done in a separate, throwaway local project (`observable-graph`, an Observable Framework app embedding a peer checkout of the then-unreleased CypherLite WASM build). That project is not kept; its own `CLAUDE.md` notes are the source for findings 4.1–4.5. The work was then reproduced in [observable-graph/](observable-graph/), and finding 4.6 records what the reproduction confirmed and added. Anything the sources do not state is marked as not recorded.

## 1. Question

RFC-001 §7.7 and §7.9: what does it take to run the WASM build inside a framework's bundler and dev server, and what does the WASM result shape require of a shared core?

The two open questions are answered together here because they were encountered together in one integration. A later spike on another framework should treat them separately.

## 2. Method

**Original run:** not recorded in detail. The source notes establish an Observable Framework app with the CypherLite WASM package built from a peer checkout and copied into the app's dependencies, a small client module, and results shaped for a force-directed graph and Observable's input and table components. Where the instance ran and whether persistence was used: not recorded.

**Reproduction:** `observable-graph/` in this directory. The release WASM package is built from the local CypherLite checkout at version 0.14.0 with output and the cargo target directory kept outside the checkout (the package is not on npm). The app is Observable Framework 1.13.4 on Node 24.14.1 and npm 11.11.1 (macOS, arm64), with a client module that initializes the database on the main thread, a normalization module, a d3 force graph, a demo page with sample queries, and a probe page that prints raw envelopes. Checks: the pages in a browser, seven Node tests running the real engine through the normalization code (`npm test`), a production `observable build`, and three scratch copies of the app varying how the package is installed (finding 4.1).

## 3. Time-box

Original run: not recorded. Reproduction: no time-box was set; it took one working session, most of it toolchain setup and debugging.

## 4. Findings

Findings 4.1–4.5 are sourced from the original project's `CLAUDE.md` ("Gotchas" and "Conventions"). Finding 4.6 comes from the reproduction.

**4.1 Bundler resolution of the package.** Framework's bundler could not resolve a symlinked `file:` dependency whose real path lies outside the project, failing with "Could not resolve entry module". The workaround was to make the package manager copy linked dependencies instead of symlinking them (npm's `install-links` setting), which means rebuilding and reinstalling after every change to the database. This arose from using an unreleased peer checkout; whether it recurs with the published package is not recorded.

**4.2 Locating the `.wasm` file.** The glue code's default of resolving the `.wasm` file relative to its own module URL did not work under Framework. What worked: a sync script copies the binary into a git-ignored data directory, the framework's file-attachment mechanism produces its served URL, and that URL is passed to the module initializer explicitly.

**4.3 Result shape.** Each statement returns an envelope of `columns`, `columnTypes`, `rows` (objects keyed by column name), `stats` and `error`.
- Engine errors arrive in `error` and are not thrown.
- Row keys come back in alphabetical order, so the client reorders by `columns` (upstream issue neo4j-labs/cypherlite#528). The notes expect the reorder to stay harmless if the issue is fixed.
- Nodes and relationships carry a `kind` tag (`node` or `relationship`).
- Paths arrive as alternating arrays `[node, rel, node, ...]` with column type `PATH`. The client also handles a `{nodes, relationships}` shape defensively.

**4.4 Presentation-layer notes (specific to Observable).** Its table input formats cells with `String()`, so flattened entities needed a non-enumerable `toString` to read well. Its select input reports option indices as DOM values, and its search input matches word prefixes, which matters for scripted browser tests.

**4.5 Visualization convention.** The client flattens results into `{nodes: [{id, label, properties}], links: [{source, target, type}]}`. The graph component copies its input because the layout library mutates it. A result with no nodes or relationships yields an empty graph, deliberately.

**4.6 Reproduction results.** Environment: CypherLite 0.14.0 built from a local checkout, Observable Framework 1.13.4, Node 24.14.1, macOS arm64.

- **Build.** The release build needed `wasm-bindgen-cli` 0.2.128 (the version the checkout's lockfile pins), binaryen (version 133 installed) and the `wasm32-unknown-unknown` target for the checkout's pinned Rust toolchain. With those in place the cargo step took about 37 seconds. Output and the cargo target directory were redirected so the checkout stayed unmodified.
- **Size.** The release module is 5,973,771 bytes raw, 2,070,478 gzipped and 1,459,013 brotli-compressed. The checkout's build script describes release bundles as "~4.3 MB / ~1.0 MB brotli", so the measured size is larger than its own estimate.
- **4.1 reproduced, and narrowed.** Three scratch copies of the app differed only in how the package was installed. A symlinked package outside the project failed `observable build` with `Could not resolve entry module "@neo4j-labs/cypherlite-wasm"`. The same out-of-tree package installed with `install-links=true` was copied by npm and built. A symlink to a directory inside the project built too. So the failure is specific to a symlink whose real path is outside the project. In the app itself, `install-links=true` with an in-tree path still produced a symlink, and it works. None of this was tested against a published package, which does not exist yet.
- **4.2 reproduced.** With no argument, the glue requests `/_node/@neo4j-labs/cypherlite-wasm@0.14.0/cypherlite_bg.wasm` and gets a 404 HTML page, because the bundler emits only the glue as a single module. With the static-file approach the dev server serves the binary as `application/wasm`, and the production build emits it as `_file/data/cypherlite_bg.<hash>.wasm`, with the glue as a hashed module under `_node/`.
- **4.3 and 4.4 confirmed against the real engine.**
  - Rows still arrive alphabetical at 0.14.0 (columns `name, age` came back as keys `age, name`), so cypherlite#528 is not fixed in this build.
  - Successful envelopes carry `columnTypes` (`STRING`, `INTEGER`, `NODE`, `RELATIONSHIP`, `PATH`, and `ANY` for an empty result), plus `elapsed_ms`, `notifications` and `plan`.
  - The error envelope is reduced: `columns` and `rows` empty, `stats` empty, and no `columnTypes`.
  - Paths are alternating arrays, as the notes say.
  - Seven Node tests cover these shapes by running the real engine, initialized in Node by passing the `.wasm` bytes to `init`.
- **Load time.** `init` took 16 ms and 34 ms in two dev-server loads, and constructing the database 0.1–3.4 ms. This was on localhost, uncompressed, on the main thread, so it says nothing about a cold network fetch of a roughly 6 MB file.
- **Framework quirk.** A top-level `await` inside a `for…of` statement body in a code cell was not detected: the cell compiled as non-async, the page raised `Uncaught SyntaxError: Unexpected reserved word`, and no cells rendered. Rewriting with `Promise.all` fixed it.
- **Tooling note.** Observable cells did not run while the browser pane was hidden, so rendering has to be checked with the page visible. The page was checked again with the pane visible after the last edits (empty-result graph, timings display), with no cell errors.

**4.7 Other components consuming the results.** Observable Framework has no database-client interface to implement for a custom engine: its `sql` support is DuckDB-specific. The reproduction instead follows the convention Observable's clients use, a tagged template that returns an array of row objects with `columns` attached, binds `${}` values as query parameters, and rejects on engine errors (`cypher` in `docs/components/cypherTag.js`). `docs/components-demo.md` feeds its output to other components, and each was checked in a browser with the page visible and with the numbers compared against the seed data:

- **Plot:** bars from scalar columns (5 bars), dots with text labels from an aggregation (5 dots), a binned histogram, and a grouped bar chart whose accessor reaches into a flattened entity (`d => d.c.name`, 3 bars).
- **Inputs:** a range slider driving a parameterized query (age 45 gave 1 row, age 20 gave 5), a search box over the rows (`al` gave 1 match), and a select populated by a query and then used as a parameter (San Francisco gave Dave). Each interaction re-ran its query and updated the page with no cell errors. `Inputs.table` rendered scalar and entity columns, with readable entity cells.
- **d3:** `d3.rollup` and `d3.mean` over rows (mean age 38.8, 3 people at Neo4j and 2 at Acme).
- **DuckDB:** the rows loaded into Framework's DuckDB client and a SQL aggregation returned the right decade counts. The demo converts DuckDB's numeric output with `Number()` as a precaution, since DuckDB can return integers as BigInt; whether it did here was not checked.
- **The force graph** built from the same result's original entities (10 nodes, 15 links, matching the seed).
- **Production build:** `observable build` succeeded with the new page and the DuckDB import.
- **Node tests:** 14 tests pass against the real engine, including that `${}` values bind as parameters (a hostile string matched nothing and changed no query text) and that an empty result is an empty array that still carries `columns`.

**4.8 Not measured.** Query latency beyond the engine-reported 0.1–0.2 ms on tiny results, trap recovery, worker use, persistence, cold-network load time, behavior with a published package, other bundlers, and other visualization libraries beyond those listed. RFC-001 §7.2 and §7.6 are untouched; §7.1 has a size but no cold-start figure.

## 5. Conclusion

**§7.1 (size and cold start).** The release module is 5.97 MB raw and 1.46 MB brotli-compressed (4.6), larger than the checkout's own estimate. Cold-start time on a real network is still unmeasured.

**§7.7 (bundler handling of the `.wasm` asset).** In this framework the core cannot locate the file itself: the bundler emits the glue but not the binary, so the adapter must put the binary into the framework's static assets and hand its URL to the core, which should accept the location as an explicit input (4.2, reproduced). The out-of-tree dependency failure is reproduced and narrowed to a symlink whose real path is outside the project (4.1, 4.6). It comes from consuming an unpublished checkout, and a published package should install as an ordinary directory, but that is unverified.

**§7.9 (WASM vs native API shape).** The WASM envelope needs normalizing before anything else can consume it: column order (still unfixed upstream in 0.14.0), entity tagging, path shape, and a reduced error envelope (4.3, 4.6). The normalization module in `observable-graph/` and its Node tests are a concrete starting point for the core's layer. With normalization in place, a tagged-template client returning plain row arrays is enough for Plot, Inputs, d3 and DuckDB to consume results without adapters (4.7), so that shape is a reasonable target for the core's query interface. The `columnTypes` field offers a way to drive normalization from declared types instead of sniffing value shapes. The spike did not look at the native package, so whether it yields the same shapes is still open.

**Text for the RFC.** Suggested wording for RFC-001's open questions, applied manually:

> 7.1 (partial answer, SPIKE-001): the release WASM module (CypherLite 0.14.0) is 5.97 MB raw, 2.07 MB gzipped and 1.46 MB brotli-compressed; main-thread initialization took 16–34 ms on localhost. Cold-network start-up is unmeasured.
>
> 7.7 (partial answer, SPIKE-001): under Observable Framework the bundler does not emit the `.wasm` file, so the adapter supplied a static-asset URL through the framework's file-attachment mechanism and passed it to the initializer explicitly; the default relative lookup returned a 404. A core input for the asset location is sufficient for this framework; other bundlers remain untested.
>
> 7.9 (partial answer, SPIKE-001): the WASM result envelope required client-side normalization of column order (still alphabetical in 0.14.0), entity kind tags, path shape, and a reduced error envelope; `columnTypes` could drive this. The native package's result shape was not examined.

**Gaps for follow-up spikes.** Measure cold-network start-up (7.1); run in a worker and exercise trap recovery (7.2, 7.6); recheck bundler behavior with the published package; compare the native package's result shapes (7.10); repeat the bundler questions on a second framework.
