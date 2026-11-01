# observable-graph

SPIKE-001 reproduction: the CypherLite WASM build running in an Observable Framework app. See `../SPIKE.md` for the question and findings.

## Setup

The WASM package is not published to npm, so it is built from a local CypherLite checkout. The checkout is not modified: build output and the cargo target directory live in `.wasm-build/`.

Prerequisites (from the checkout's own `scripts/build-wasm.sh`): `rustup` with the `wasm32-unknown-unknown` target for the checkout's pinned toolchain, `wasm-bindgen-cli` at the version its `Cargo.lock` pins (its `scripts/install-wasm-bindgen.sh` installs it), and `binaryen` 110 or newer.

```bash
CYPHERLITE_DIR=/path/to/cypherlite npm run build:wasm   # MODE=dev for a faster, larger build
npm install
npm run dev                                             # http://localhost:3000
npm test                                                # real engine in Node
npm run build                                           # production build into dist/
```

Re-run `build:wasm` and `npm install` after any CypherLite change. Set `OBSERVABLE_TELEMETRY_DISABLE=true` to turn off Framework's telemetry.

## Layout

- `docs/index.md`: sample queries, an editable Cypher box, a result table, and a force graph.
- `docs/components-demo.md`: results from the `cypher` tag feeding Plot, Inputs, d3, DuckDB and the force graph.
- `docs/probe.md`: raw wire envelopes for scalar, entity, path, error and empty results.
- `docs/components/cypherTag.js`: the Observable-style tagged template (`cypher`); `${}` values bind as parameters, rows come back as an array with `columns`, and engine errors reject.
- `docs/components/graphDbClient.js`: opens the database, passing the `.wasm` URL to `init` explicitly.
- `docs/components/normalize.js`: column order, entity flattening, and graph extraction.
- `docs/components/forceGraph.js`: d3 force layout. It copies its input because d3 mutates it.
- `scripts/sync-wasm.js`: copies the `.wasm` into `docs/data/` so Framework serves it as a static file.

## Notes

- Observable cells do not run while the browser tab is in a hidden background pane; check rendering with the page visible.
- Cells run on the main thread. A worker variant is not implemented.
