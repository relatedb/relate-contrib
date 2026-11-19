# @relate/contrib-observable

Implements [ADR-006](../../design/adr/ADR-006-observable-adapter.md). Needs Observable Framework 1.x, `@relate/contrib-web` and `@relate/relate-wasm` (all peer dependencies). Static builds and the preview server are supported.

Framework has no plugin interface, so the package is three entries you call from your own files:

- `@relate/contrib-observable/loader`: helpers for **data loaders** (scripts in `docs/data/` that Framework runs and publishes under hashed names). They place the engine's binary and the core's worker and publish a graph's document and descriptor.
- `@relate/contrib-observable`: `open`, which creates the core's client for a graph and ties it to a cell.
- `@relate/contrib-observable/results`: the normalization, the graph shape for a force layout, and the `cypher` tagged template (re-exported by the main entry).

## Use, in five steps

**1. Install** `@relate/contrib-observable`, `@relate/contrib-web` and `@relate/relate-wasm` beside Framework. The package depends only on `esbuild`.

**2. Add two loaders that place the engine and the worker** (once per site):

```js
// docs/data/relate.wasm.js
import { engine } from "@relate/contrib-observable/loader";
await engine();
```

```js
// docs/data/relate-worker.js.js
import { worker } from "@relate/contrib-observable/loader";
await worker();
```

`worker()` bundles the core's worker and the engine's script glue when the site builds, from the engine the site has installed, so the glue and the binary always match. Framework does not place either file by itself: a worker started with `new Worker(new URL(...))` is not published, and the engine's glue finds no binary.

**3. Declare each graph** that is shared or large as a source module and two loaders (a graph a cell holds as an object needs no loaders):

```js
// docs/lib/pantry.js: any module whose default export returns an ADR-002 document, or a promise of one
export default () => ({ version: 1, nodes: [/* ... */], links: [/* ... */] });
```

```js
// docs/data/pantry.graph.json.js
import { document } from "@relate/contrib-observable/loader";
import source from "../lib/pantry.js";
await document("pantry", source);
```

```js
// docs/data/pantry.descriptor.json.js
import { descriptor } from "@relate/contrib-observable/loader";
import source from "../lib/pantry.js";
await descriptor("pantry", source, { indexes: [{ label: "Page", property: "id" }] });
```

An invalid document, a malformed id or a source that throws stops the build and names the graph and the first problem. The descriptor carries a content revision, so a page restores a stored copy of the graph in the visitor's browser while the revision is unchanged.

**4. Clear Framework's loader cache before every build.** Framework runs a loader again only when its output is older than the loader script itself, and `observable build` reuses a cached output even then. An edit to a graph source, a content change a source reads, or an engine upgrade reaches the published files only after the cache folder is removed. Framework 1.13 has no `clean` command; its templates clear the folder with a script:

```json
{ "scripts": { "clean": "rm -rf docs/.observablehq/cache dist", "build": "npm run clean && observable build", "dev": "npm run clean && observable preview" } }
```

In the preview server, after it has started, a source edit takes effect only when a loader script is saved or the server is restarted after a clean.

**5. Open the graph in a cell** and query it:

````md
```js
import { open } from "@relate/contrib-observable";
const db = await open({
  engine: FileAttachment("data/relate.wasm"),
  worker: FileAttachment("data/relate-worker.js"),
  graph: { descriptor: FileAttachment("data/pantry.descriptor.json"), data: FileAttachment("data/pantry.graph.json") },
  // or: graph: { document: FileAttachment("data/pantry.graph.json"), indexes }
  // or: graph: { document: anObjectTheCellHolds, indexes }
  invalidation,
});
await db.ready;
```

```js
const rows = await db.cypher`MATCH (p:Page) WHERE p.words > ${minWords} RETURN p.title AS title ORDER BY title`;
display(Inputs.table(rows));
```
````

`open` takes file attachments, not URLs, because Framework finds a page's files by reading literal `FileAttachment("...")` calls. Its promise resolves as soon as the client exists, not when the graph is ready; `db.ready` resolves when it is, and rejects with the core's wording if the client reaches `failed`. `${}` values are bound parameters, never spliced into the statement. The rows are an array with `columns`, `columnTypes`, `stats` and `elapsedMs`; entities in a row are flattened (`d => d.p.age`) and read as text in a table; `db.graph(rows.result)` gives `{ nodes, links }` for a force layout.

`db.client` is the core's client: `status`, `subscribe`, `run` (with a stop control) and the rest of its interface. A statement a visitor types should go through `db.client.run`, which has a timeout and can be stopped.

## Lifetime

The client is destroyed when the cell's `invalidation` resolves and when the page hides, and a page restored from the browser's back-forward cache reloads once. Open a graph in a cell that reads no input: an input a cell reads re-runs it, which destroys the client and opens a new worker each time. A page may open any number of graphs; each is independent, with its own worker. Framework pages are separate documents, so only the core's per-page profile applies; there is no `navigation` option.

## Cell rules (Framework's, not this package's)

- A cell cannot define a variable named `document` (or another global): `SyntaxError: Global 'document' cannot be redefined`.
- A top-level `await` inside the body of a loop is not detected; the cell compiles as non-async and its file attachments are not registered. Write `await db.ready` instead of a polling loop.
- A mistake in a cell shows in the page where its output would be, not in the build. Only a loader stops a build.
- Framework publishes only the files its cells name in literal `FileAttachment(...)` calls, here or in a module they import (paths in a module are relative to it).

## Workspace sites

A Framework site that installs these packages from a workspace must not link them as plain directories outside the site: the bundler fails with `Could not resolve entry module`. A pnpm injected dependency (`"dependenciesMeta": { "@relate/contrib-web": { "injected": true } }`), a copy, or a published package builds. See `conformance-site/` for the injected form and `scripts/refresh-deps.mjs`, which refreshes the copies, since pnpm does not add new built files to one after install.

## Not measured

The cold-network cost of the engine (about 6 MB) and the worker bundle (about 45 kB); the cost of clearing the cache on every build; the cost of each extra instance on a page.

## Develop

```sh
pnpm run build:wasm
pnpm install
pnpm --filter @relate/contrib-observable build
pnpm test:observable             # results against the real engine, loaders, build, freshness, preview server
pnpm test:observable-browsers    # the adapter's behavior in Chromium, Firefox and WebKit
pnpm test:observable-conformance # the core's conformance scenarios over conformance-site/
pnpm test:observable-package     # packs adapter, core and engine; installs in a clean Framework project
pnpm test:observable-trace       # every requirement has a passing, tagged test
```
