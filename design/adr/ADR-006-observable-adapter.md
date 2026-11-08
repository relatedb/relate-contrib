---
id: ADR-006
title: The Observable Framework Adapter as a Helper Package over the Core
status: accepted
rfcs: [RFC-001, RFC-002]
created: 2026-11-08
---

# ADR-006: The Observable Framework Adapter as a Helper Package over the Core

## 1. Context

Observable Framework builds a static site from markdown pages whose fenced `js` blocks are reactive cells. A cell re-runs when a value it reads changes (an input, another cell), and each run gets an `invalidation` promise that resolves when the run is superseded. Five facts about Framework shape how the embedded graph database can be added to a site built with it.

- **There is no integration API.** Framework's configuration file sets titles, pages, themes and similar options; it has no plugin hook, no way to inject routes and no build step a package can join. What a package can add is modules that pages import, and files produced by *data loaders*. A data loader is a script in the site's `data/` folder (for example `data/pantry.json.js`) that Framework runs at build time, or on demand in the preview server, and whose standard output becomes the file named by dropping the last extension. Any text or binary content works, and a build publishes the result under a content-hashed name (`_file/data/pantry.<hash>.json`), which a cell obtains through `FileAttachment("data/pantry.json").url()`. Framework keeps each loader's output in a cache under the project's `.observablehq/cache` folder and treats it as fresh when it is newer than the loader script itself. A change to a module the loader imports, to a file it reads, or to an installed package does not make it stale, and `observable build` reuses a cached output even when the loader script is newer, running a loader only when no output exists (Framework 1.13.4, `loader.js`; confirmed by editing an imported module between two builds of a scratch page, whose output did not change). The preview server runs a loader again when the loader script is newer than its output.
- **A bundler places nothing except the module graph.** Framework bundles bare imports from `node_modules` into one module per package and copies the site's own modules. SPIKE-001 found that the engine's glue is bundled and its `.wasm` is not, so the glue's default lookup returns a 404 page. The same holds for workers: in a build of a scratch page, a module containing `new Worker(new URL("./inner.js", import.meta.url), { type: "module" })` was copied to `_import/` and `inner.js` was not emitted. The shared core starts its worker exactly that way, so under Framework neither the engine binary nor the worker is found by default. A data loader that writes a binary produced a hashed file in the same scratch build (a 4-byte `hello.bin.js` became `_file/data/hello.9f64a747.bin`), a loader named `w.js.js` produced `_file/data/w.<hash>.js` that a static server answered as `text/javascript`, and a loader that exited with an error stopped the build.
- **Every page is a new document.** Framework's client code contains no history handling: a link is a full page load. The only profile that applies is the core's per-page profile (one client per page, started by that page, which restores a copy of the graph kept in the browser when one exists); there is no retained instance to design.
- **A cell is the unit of lifetime.** A client created in a cell has to be destroyed when that cell re-runs, or each re-run leaks a worker. A page also ends without a router event: the document unloads.
- **The core passes results through unaltered, and Framework's components want rows.** The engine's envelope has rows keyed alphabetically (observed again at engine 0.14.0), tagged entities, paths as alternating arrays and a reduced error envelope. SPIKE-001 built a normalization layer and a tagged-template client (`cypher`) after Observable's database clients, and Plot, Inputs, d3 and DuckDB consumed its output without further adapters. Framework has no database-client interface for a custom engine, since its `sql` support is DuckDB's, so the tagged template is the integration surface.

A bundler fault specific to Framework applies to the repository's own checks: it could not resolve a package installed as a symlink whose real path lies outside the project (`Could not resolve entry module`), and built when the package was copied in or linked from inside the project (SPIKE-001 §4.6). A site inside the repository's workspace gets symlinks to `packages/*`, which are outside the site.

The core package `@relate/web` provides the client, loader, descriptor handling, profiles and a conformance check (ADR-001, ADR-002, ADR-003), the build-time helpers in `@relate/web/build` and a `workerFactory` option that replaces how the worker is constructed (ADR-005). The Astro and Next adapters (ADR-004, ADR-005) add build-time endpoints and a lifecycle on the router's events. What remains for Framework is placing the engine and the worker, declaring graph data through loaders, tying a client to a cell, and shaping results. RFC-001 §5.1 frames the adapter as owning only that wiring; RFC-002 §5.1 and §5.4 list the data sources and the page shapes it has to cover.

## 2. Decision

### 2.1 Package: `@relate/observable`, helpers and no integration

A workspace package `packages/observable`, published as `@relate/observable`, with three entry points:

- `@relate/observable`, a browser module that pages and components import (section 2.3);
- `@relate/observable/loader`, helpers that data loaders call (section 2.2);
- `@relate/observable/results`, the normalization of the engine's envelope (section 2.4), also used by the main entry.

Peer dependencies are `@observablehq/framework` (version 1; the spikes ran 1.13.4), `@relate/web` and `@relate/relate-wasm`. The runtime dependencies are `esbuild`, used by the worker loader, and nothing else. The package ships no UI components: a force-directed graph, tables and charts remain the site's own, and `toGraph` (section 2.4) supplies the data for the first.

### 2.2 Build time: loaders place the engine and the worker, and declare graphs

A site adds data loaders, each a few lines that call a helper. Nothing is injected; Framework runs them in both `observable build` and the preview server.

**Engine and worker.** Two loaders, written once per site:

```js
// data/relate.wasm.js            // data/relate-worker.js.js
import { engine } from "@relate/observable/loader";   import { worker } from "@relate/observable/loader";
await engine();                                        await worker();
```

`engine()` writes the bytes of the `.wasm` file of the site's installed `@relate/relate-wasm` to standard output. `worker()` bundles the core's worker entry (`@relate/web/worker`) and the engine's JavaScript glue into one self-contained ES module with esbuild and writes it to standard output. The bundle is made when the site builds, from the engine the site has installed, so the glue and the binary always come from the same package version; a bundle shipped inside `@relate/observable` could be paired with a different engine version, and the glue and the binary only work together. The published names are `relate.wasm` and `relate-worker.js` (the second keeps a JavaScript extension so a static host serves it with a script's content type).

**Graph data.** A graph has an id (the id rule of ADR-003) and a source: a module that default-exports a function returning an ADR-002 document, or a promise of one, as in ADR-004 and ADR-005. A graph is declared as a pair of loaders sharing that source, or as a single loader when it needs no stored copy:

```js
// data/pantry.graph.json.js                              // data/pantry.descriptor.json.js
import { document } from "@relate/observable/loader";      import { descriptor } from "@relate/observable/loader";
import source from "../../src/pantry.js";                   import source from "../../src/pantry.js";
await document("pantry", source);                           await descriptor("pantry", source, { indexes: [{ label: "Page", property: "id" }] });
```

`document` evaluates the source, validates the result with `@relate/web/validate` and writes the canonical text (`@relate/web/build`) with the revision it hashes to in the document's own `revision` key (ADR-002). `descriptor` evaluates the same source and writes the ADR-003 descriptor (a small JSON file that names a graph's data location, revision and counts, so a page can restore a stored copy of the graph, kept in the browser, instead of fetching the data), with `revision` computed from the canonical text, counts for `data.nodes` and `data.links`, and `data.url` set to the logical name of the data file (`data/pantry.graph.json`) because the published name is not known when the descriptor is written. The page replaces it (section 2.3). A source that is invalid, or a loader that fails, fails the build with the first problem's path, because Framework fails a build whose loader exits with an error. The two loaders evaluate the source independently, so a source that is not deterministic gives a descriptor whose revision disagrees with the document; the core's agreement check (which compares the descriptor's revision and counts with the document's) reports that at load as a `mismatch`, and the package test builds twice and compares.

**Freshness.** A loader's output is refreshed only when its cache is cleared (section 1), so an edit to a graph source, a content change that a source reads, or an engine upgrade reaches the published files only after a clean. The site's `build` and `dev` scripts therefore remove the cache folder (`docs/.observablehq/cache`; Framework 1.13 has no `clean` command, and its own templates clear the folder with a script) first, so every loader reruns on every build and the document and the descriptor cannot go stale independently of each other; the package's README gives the scripts. In the preview server, after the server has started, a source edit takes effect only when a loader script is saved or the server is restarted after a clean. A wrapper command that removes only the adapter's cached outputs is follow-up work.

A graph with no loader is also possible: a cell passes a document it holds as a value (section 2.3). It has no revision and no stored copy, as an inline graph in ADR-004.

### 2.3 Client module: one call, tied to the cell

`@relate/observable` exports `open(options)`:

```js
const db = await open({
  engine: FileAttachment("data/relate.wasm"),
  worker: FileAttachment("data/relate-worker.js"),
  graph: { descriptor: FileAttachment("data/pantry.descriptor.json"), data: FileAttachment("data/pantry.graph.json") },
  invalidation,
});
```

`graph` is one of: `{ descriptor, data }` (two file attachments), `{ document }` (a file attachment or an object the cell holds), with an optional `indexes` list as in the core. The options take file attachments, not URLs, because Framework reads the literal `FileAttachment("...")` calls in a cell to know which files the page uses, so a package cannot call it with a name of its own. `open` resolves each attachment's URL once per page and keeps it (Framework returns the same object for one file on one page, so the object itself is the key), reads the descriptor and sets its `data.url` to the data attachment's URL, then creates the core client with the core's `createClient`, `navigation: "multi-page"`, `engineUrl` set to the binary's URL and `workerFactory` returning `new Worker(workerUrl, { type: "module" })`. A descriptor graph gets the stored copy the per-page profile allows; a document does not.

`open` is asynchronous: its promise resolves as soon as the attachments' locations are known and the client exists, not when the graph is ready, and a cell waits for readiness with `await db.ready`. A file attachment's location is available only through a promise, and the client needs it to be created, so the call cannot return the client before then. The resolved object has:

- `client`, the core client, for status, `subscribe`, `run` and the rest of its interface;
- `ready`, a promise resolving when the instance is ready and rejecting when the client reaches `failed`;
- `cypher`, the tagged template of section 2.4, and `query(text, params)`, resolving to a normalized result;
- `graph(result)`, the flattening to `{ nodes, links }` of section 2.4.

The client is destroyed when `invalidation` resolves, which is when the cell re-runs or the page is torn down, and on `pagehide`, so a cell that re-runs does not leave a worker behind. A page restored from the browser's back-forward cache after `pagehide` has a destroyed client, and a cell has no way to rebuild a client its page closed, so `pageshow` with `persisted` set reloads the document once. A page may call `open` any number of times; each call is an independent client with its own worker, which the core already supports. The call goes in a cell that does not read inputs, so that changing an input re-runs only the cells that query. Opening in a cell that depends on an input destroys and recreates the client at each change.

Framework does not render cells on a server, so a cell's output never has to match server markup, and the placeholder-first rule of the other adapters applies to a cell only in that it should show something while `ready` is pending.

### 2.4 Results: the spike's normalization and tagged template

The core returns the envelope unaltered, and it stays so. `@relate/observable/results` holds what SPIKE-001 built, adjusted to the current engine:

- `normalize(envelope)` returns `{ columns, columnTypes, rows, tableRows, stats, error, elapsedMs }`. Rows are keyed in column order. `rows` keep the engine's tagged entities and `tableRows` flatten them (`{ id, labels, ...properties }` for a node, `{ id, type, start, end, ...properties }` for a relationship, an array for a path) with a non-enumerable `toString` so Inputs.table shows a readable cell.
- `toGraph(result)` collects every node and relationship in a result into `{ nodes: [{ id, label, name, properties }], links: [{ source, target, type }] }` for a force layout, dropping relationships whose endpoints are not in the result. A result with no entities gives an empty graph.
- `cypher` is a tagged template on a `query` function: each `${}` becomes a parameter (`$p0`, `$p1`, ...) and is never spliced into the text. It resolves to an array of flattened rows with `columns`, `columnTypes`, `stats` and `elapsedMs` attached and the normalized result on a non-enumerable `result`, and rejects when the engine returns an error, as Observable's database clients do. The call goes through the core client's `query`, so it has the core's timeout and recovery.

The spike's reorder by `columns` is kept; if the engine later returns column order, it does nothing.

### 2.5 Profile and scope of the first version

- Only the core's per-page profile applies, so the package has no `navigation` option. Every page load starts its clients, restores a stored copy where a descriptor exists, and replays otherwise.
- Static output and the preview server. A site rendered elsewhere is not a Framework mode.
- Framework version 1 on a current Node. Other major versions are not checked.
- Every instance runs in the core's worker. A main-thread instance, a dashboard that fetches its data at load, and loaders for several sites sharing a source are not decided here.
- A single `@relate/relate-wasm` version per site; the loaders read the installed one.

### 2.6 Checked against the core's conformance scenarios

`packages/observable/conformance-site` is a Framework project, not published, that reproduces the example pages' `data-rel-*` markup (defined in the core's `conformance/example-site/rel-page.ts`) from cells, using only `@relate/observable`. It has a page for each way a graph is used: a graph from a descriptor and data pair, a page with its own document, a page with two graphs, and the pages the scenarios navigate between. It is built once, with `observable build`, and served as static files. `runConformance` from `@relate/web/conformance` runs against it with the per-page profile in Chromium, Firefox and WebKit; the scenarios that need a retained instance belong to the other profile and are not run. A failure blocks the adapter's release.

The conformance site installs `@relate/observable` and `@relate/web` as copies (pnpm injected workspace dependencies), so they are real directories inside the project, because Framework's bundler failed on symlinks whose target is outside it. The adapter's own tests, in `packages/observable/tests`, cover: the loaders' output against `@relate/web/build` (revision and canonical text), a build failure for an invalid document, a client destroyed on invalidation and on `pagehide`, and the normalization and the tagged template against the real engine in Node (the spike's fourteen tests, rewritten for the current engine). A package test packs `@relate/observable`, the core and the engine, installs them in a clean Framework project outside the repository, builds it, and runs a page.

## 3. Alternatives Considered

- **Copy the `.wasm` into `data/` with a script run before `dev` and `build`** (the spike's `sync-wasm`). Rejected: it adds a step to every site's scripts, runs before the preview server only when the site remembers to, and cannot serve a worker. A loader runs in both modes and its output is hashed.
- **Import the core and let Framework's bundler place the worker.** Rejected: observed not to work. The worker's module is not emitted, so the page requests a file that does not exist.
- **Ship a prebuilt worker bundle inside `@relate/observable`.** Rejected: the bundle contains the engine's glue, which has to match the binary the site serves, and the site's installed engine can differ from the one the adapter was built with.
- **Build the worker from a Blob URL over the bundle's text.** Rejected: the bundle's text still has to reach the page as a file, so a loader is needed either way, and some content security policies block workers made from blob URLs.
- **Load the engine and the worker from a CDN.** Rejected: the version served can drift from the one the site was built and tested with, and the site gains a third-party dependency and fails offline.
- **An instance on the main thread, as in the spike.** Rejected: the core supports only a worker (ADR-001), where a trapped or runaway instance is replaced without freezing the page; the spike's main-thread instance cannot be stopped.
- **A Framework `sql` or database-client integration.** Rejected: Framework has no interface for a custom engine and its SQL support is DuckDB's. A tagged template returning row arrays is what its inputs and charts consume.
- **Taking URLs as options and calling `FileAttachment` inside the package.** Rejected: Framework finds a page's files by reading literal `FileAttachment` calls in cells, so a call inside a package would not be seen and the file would not be published.
- **UI components (a graph view, a Cypher box).** Rejected: components follow the site's design and the charting libraries it already uses; `toGraph` and the tagged template give them their data.
- **Re-implementing results normalization in each future adapter.** Rejected as the long-term shape; see section 4.

## 4. Consequences

- A site gets a working graph from two loaders for the engine, two for each graph that wants a stored copy, and one `open` call in a cell. That is more files than the other adapters need and no code of the site's own. A generator that writes the loaders (`init` command) is follow-up work.
- Framework's loader cache is not invalidated by what a loader reads (section 1), so freshness depends on the site's scripts cleaning the cache (section 2.2). A site that builds without cleaning publishes the old graph, and one whose clean misses a loader publishes a document and a descriptor of different revisions. Cleaning reruns every loader on every build, including the 6 MB engine copy and the worker bundle; the cost is unmeasured. The package test builds, edits a source, builds again and checks the revision changed.
- The worker bundle is made with esbuild from the site's installed packages; whether the core's worker entry and the engine's glue bundle cleanly into one module, and whether a new engine version's glue still does, are checked in the package test.
- This decision settles RFC-001 §7.7 for this framework: loaders place the binary and the worker, and the adapter hands their locations to the core. It narrows §7.9: the result shape is normalized in this package, and the native package's shapes stay unexamined.
- Each `open` is a worker with its own copy of the module, and a page whose open cell re-runs on input changes pays a full start each time. The cost per extra instance is the unmeasured one of RFC-002 §7.2.
- No retained instance exists across pages: every page load pays the replay or the stored-copy restore, and one tab at a time can hold a stored copy (RFC-001 §7.3). A site-wide graph for a navigation element does not fit this framework, since Framework's own sidebar is plain links.
- Normalization lives in this package, so another adapter wanting normalized rows would copy it. Moving it into the core as an additive export is follow-up work once a second adapter needs it; RFC-001 §7.9 asks the same question for the native package's shapes, which the spike did not examine.
- The conformance site's pages are cells, so the scenarios observe markup written by cells running in a real browser. Framework's cells did not run while the Browser pane was hidden (SPIKE-001 §4.6); whether headless Playwright browsers are affected is checked while building the conformance site.
- A loader error in the preview server (shown on the page or only in the terminal) and installing the adapter as a published package rather than a workspace copy each need a test; the second repeats the failure SPIKE-001 saw with a symlinked package.
- The cold-network cost of the module and the worker bundle is unmeasured (RFC-001 §7.1). The worker bundle adds a small second download; the module's size is the engine's, about 6 MB raw and 1.5 MB compressed.
- The adapter cannot say what a good graph is. Sources are the site's own, and RFC-002's authoring questions stay open.

## 5. Related

- RFCs: RFC-001, RFC-002
- Builds on: ADR-001 (hosting), ADR-002 (data format), ADR-003 (descriptor), ADR-004 and ADR-005 (the adapters this one follows)
- Evidence: SPIKE-001 (Observable Framework 1.13.4); a scratch Framework project built on 2026-11-08 for worker placement, binary and JavaScript-named loaders and loader failure (its results are the sentences in section 1 that cite them)

## 6. Amendments

- 2026-11-08: the review run before implementation (`/adr-review`, which had been skipped at acceptance) found that Framework's loader cache is invalidated by neither a changed source module nor an engine upgrade, and that `observable build` reuses stale output (section 1, confirmed in the loader's code and by a two-build scratch test). Added the freshness rule to 2.2 (the site's scripts run `observable clean` first), the consequence and test to 4, the back-forward cache rule to 2.3, the Blob worker alternative to 3, the definitions of the descriptor, the stored copy, the per-page profile and the agreement check at first use, and the statement of what the decision settles in RFC-001 §7.7 and §7.9.
- 2026-11-08: implementation: `open` is asynchronous (a cell writes `const db = await open({...})`) because an attachment's location is a promise and the client needs it at creation; an attachment's resolved location is kept once per page by the attachment object, which Framework returns for one file, not by its name (the name is only the last path segment, so two files in different folders can share it). Sections 2.3 and 4 read accordingly.
- 2026-11-08: implementation: the document carries its `revision` key. The other adapters detect a source that is not deterministic by the revision in a data file's name; a loader's output has no such name, and a document without the key would pass the core's agreement check (which compares counts when the key is absent) whenever two runs gave the same counts. With the key, a disagreement between the document and the descriptor is a `mismatch` at load.
- 2026-11-08: implementation: Framework 1.13.4 has no `observable clean` command (`observable help` lists create, preview, build, login, logout, deploy, whoami, convert, help, version); the cache is the folder `<root>/.observablehq/cache`, so the site's scripts remove that folder. Section 2.2 and the amendment above read accordingly.
