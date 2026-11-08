# Research: Observable Framework Adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-08

This file records the checks made while writing ADR-006 and planning (V-1 to V-8) and the decisions that follow. They are single runs on Observable Framework 1.13.4, Node 24, macOS arm64, pnpm 11.7, esbuild 0.28.2 and the engine built from the pinned checkout (`@relate/relate-wasm` 0.16.1), with the stand-ins in [`verify/`](verify/README.md). Headless browsers are Playwright's Chromium, Firefox and WebKit.

## Checks

### V-1. A binary loader publishes the engine under a hashed name

`data/relate.wasm.js` wrote the bytes of `relate_bg.wasm` (resolved from the site's root with `createRequire(cwd + "/package.json")`) to standard output. The build published `_file/data/relate.f5934730.wasm` (6.25 MB) and `FileAttachment("data/relate.wasm").url()` returned that location. A 4-byte test loader gave the same shape.

### V-2. A bundled worker, placed by a loader, runs the core

`data/relate-worker.js.js` bundled `@relate/web/worker` with esbuild (`bundle`, `format: "esm"`, `platform: "browser"`) and wrote the text to standard output: 45.4 kB, published as `_file/data/relate-worker.<hash>.js` and served as `text/javascript`. A cell created the core's client with `workerFactory: () => new Worker(workerUrl, { type: "module" })`; the engine's glue was inside the bundle and the binary came from V-1. The worker started, loaded the 20-node document and answered `MATCH (n:Item) RETURN count(n) AS c` with `[{"c":20}]` in Chromium, Firefox and WebKit. Without a loader, a module containing `new Worker(new URL("./inner.js", import.meta.url))` was copied to `_import/` and `inner.js` was not emitted (ADR-006 §1).

### V-3. Framework's cells run in headless browsers

The same page, loaded by Playwright's headless Chromium, Firefox and WebKit (not a hidden app pane), rendered the cell's output within the 20 s wait. SPIKE-001's observation that cells did not run in a hidden pane does not apply to headless Playwright runs. This answers ADR-006 §4's open item for these three browsers.

### V-4. A loader's cached output is not refreshed by what it reads

`observable build` twice on a page whose loader imported `../../src/s.js`: after the imported module changed from `one` to `two`, the second build reported `[fresh]` and published `one`. Touching the loader script and building again reported `[using stale]` and still published `one`. Framework's `loader.js` (lines 322–345) shows why: output is fresh when the cache file is newer than the loader script, and `build` passes `useStale: true`, so it runs a loader only when no cached output exists. The preview server runs a loader again when the script is newer than its output. Consequence: ADR-006 §2.2's freshness rule (the site's scripts run a clean of `docs/.observablehq/cache` first).

### V-5. A loader that exits with an error stops the build; a cell error does not

A loader that wrote to standard error and exited 1 ended the build with "loader exited with code 1". A cell with `const document = …` produced the page with the text `SyntaxError: Global 'document' cannot be redefined` in place of the cell, and the build succeeded. So a build failure for an invalid graph can only come from a loader, which is where ADR-006 §2.2 puts the validation; a mistake in a cell shows in the page and in no build message.

### V-6. A symlinked workspace package fails; pnpm's injected copy builds

With `node_modules/@relate/web` a symlink to `packages/web`, `observable build` failed with `Could not resolve entry module "@relate/web"` (rollup `UNRESOLVED_ENTRY`), as SPIKE-001 §4.6 found for a package outside the project. With it a symlink into pnpm's store copy made by an injected workspace dependency (`dependenciesMeta: { "@relate/web": { injected: true } }`, a hard-linked copy under the repository's `node_modules/.pnpm`), the same build passed. The failing case is a symlink whose target is a plain directory outside the project; a target inside a `node_modules` folder resolved. A copy placed directly in the project's `node_modules` also built (the stand-in's setup). pnpm needs the engine declared as a direct dependency of the injecting project for the peer to resolve (`@relate/relate-wasm: "*"`, which the workspace override links).

### V-7. `await` in a loop body defeats a cell's top-level await

An earlier stand-in cell used `while (client.status === "loading") await …`; the cell compiled without its file attachments being registered. This is the quirk SPIKE-001 §4.6 recorded (a top-level `await` inside a `for…of` body). The adapter's `ready` promise lets a cell write `await db.ready`, so no site code needs a loop.

### V-8. The core's browser code bundles from a copied package

The cell's `import {createClient} from "@relate/web"` was bundled by Framework into `_node/@relate/web@0.0.0/index.<hash>.js` from a copy of the core's `dist` in `node_modules`. The worker module was not pulled in by the import (it is started by URL), which is why the loader supplies it.

## Decisions

### D-1. Loaders resolve packages from the site's root

`engine()` and `worker()` resolve `@relate/relate-wasm` and `@relate/web` with `createRequire(process.cwd() + "/package.json")`. Framework runs a loader with the project root as the working directory, and under pnpm the adapter's own folder may not see the site's copies of its peers. Rejected: resolving from the adapter's location (finds another copy, or none, under pnpm's layout).

### D-2. Loader tests run the scripts as processes

The loader helpers write to standard output and exit non-zero on failure, so tests run small loader scripts with Node and read the output and exit code, as Framework does. Rejected: adding an output-stream parameter to the helpers for tests (public API for a test's convenience).

### D-3. Attachments are resolved once per page by object, and `open` is asynchronous

`FileAttachment(name)` returns the same object each time for one file on one page (Framework's `fileAttachment.js` keeps a map by path), so `open` keeps each attachment's location (and, for a descriptor, its parsed content) in a weak map keyed by the object. Several opens on one page therefore request each location once (spec FR-012, US3 scenario 6). A name is not a key: it is the last path segment, and two files in different folders can share it. An attachment's location is available only through a promise (`url()`; `href` exists on Framework's object but is undocumented), and the core's client needs the engine's location at creation, so `open` returns a promise of the opened object, resolved when the client exists. ADR-006 §6 records the change from "returns immediately".

### D-4. The conformance site gets its packages as pnpm injected dependencies, and a refresh step

The conformance site declares `@relate/observable` and `@relate/web` as injected workspace dependencies and the engine as a direct dependency (V-6). pnpm makes the injected copy at install time as hard links. Checked while implementing (single run, pnpm 11.7): an edit to an existing built file shows through the link at once; a file added to the package's `dist` does not appear in the copy, and neither `pnpm install --offline --frozen-lockfile` nor `--force` adds it. The site therefore runs `scripts/refresh-deps.mjs` before every build; it removes each published folder in the injected copy and copies the package's own over it (`files` from its manifest), and it also copies `package.json`. Rejected: relying on a reinstall (does not refresh) and on pack-and-unpack (the script copies the same files without a tarball).

### D-5. Graph sources are plain modules the loader imports

A source is any module the loader script can import: plain JavaScript or JSON. Framework also runs `.ts` loaders, but TypeScript sources are untested and the conformance site uses JavaScript only.

### D-6. Conformance variants are static attachments chosen by a page's query parameter

The core's runner selects descriptor variants `b`, `mismatch` and `broken` by a query parameter. A cell cannot build an attachment name at run time (V-5 and ADR-006 §2.3), so the page contains one literal `FileAttachment` per variant and a lookup table, and the variants are plain files in the site (not loaders). Variant `a` is the loader-published pair.

## Checks made while implementing

- **V-9. The engine's envelope, against the results layer (T018).** At `@relate/relate-wasm` 0.16.1 the spike's findings still hold: rows are keyed alphabetically (`age`, `name` for columns `name`, `age`); an error arrives as `{ columns: [], error, rows: [], stats: {} }` with no column types; entities are tagged and paths are alternating arrays; column types are `STRING`, `INTEGER`, `NODE`, `RELATIONSHIP`, `PATH`. The successful envelope has gained `execute_ms`, `parse_ms` and `plan_ms`, which `normalize` ignores. Single run, Node 24.

- **V-10. Framework 1.13.4 has no `clean` command.** `observable clean` answers "unknown command"; `observable help` lists create, preview, build, login, logout, deploy, whoami, convert, help and version. The loader cache is `<root>/.observablehq/cache` (`docs/.observablehq/cache`); Framework's own templates clear it with a `clean` script. ADR-006 and the planning documents had assumed the command; the ADR's §6 corrects it. The `cleanUrls` option is deprecated in this version, so the site sets `preserveExtension: true` to keep `/page-1.html`.

## Consequences for ADR-006

No amendment is needed beyond the one made on 2026-11-08. This research adds three facts to cite in the implementation's README and tests: cell errors do not fail a build (V-5), the symlink failure is specific to a plain directory outside the project, and pnpm's injected copy builds (V-6, so ADR-006 §2.6's choice holds).
