# Contract: loader entry (`@relate/observable/loader`)

Imported only from data loaders, which Framework runs as Node scripts with the project root as working directory. Needs no browser. Every helper writes to standard output and, on failure, writes the message to standard error and exits non-zero (Framework then stops the build).

```js
import { engine, worker, document, descriptor } from "@relate/observable/loader";
await engine();                                     // data/relate.wasm.js
await worker();                                     // data/relate-worker.js.js
await document("pantry", source);                   // data/pantry.graph.json.js
await descriptor("pantry", source, { indexes });    // data/pantry.descriptor.json.js
```

- `engine()` (FR-003): resolves `@relate/relate-wasm/relate_bg.wasm` from the site's root (research D-1) and writes its bytes.
- `worker()` (FR-004): bundles the site's `@relate/web/worker` entry, with the engine's script glue, into one ES module with esbuild (`bundle`, `format: "esm"`, `platform: "browser"`) and writes it. The glue and the binary come from the same installed engine.
- `document(id, source)` (FR-006): validates `id` (ADR-003's id rule), calls `source()`, validates the result with `@relate/web/validate`, writes the canonical text from `@relate/web/build`. Failure message names the graph and the path of the first problem (FR-009).
- `descriptor(id, source, options)` (FR-007): evaluates `source` the same way and writes the ADR-003 descriptor built by `@relate/web/build`'s descriptor construction, with `data.url` set to `data/<id>.graph.json`. `options.indexes` is a list of `{ label, property }`.

The helpers import the core's build code and validator; they hold no copy (FR-008). Published names are the loaders' own file names: the helpers do not choose them.

Files named by the site are conventions: `relate.wasm` and `relate-worker.js` for the first two, `<id>.graph.json` and `<id>.descriptor.json` for a graph. The browser entry takes attachments, so any names work.
