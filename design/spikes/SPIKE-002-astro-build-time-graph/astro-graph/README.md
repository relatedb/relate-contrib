# astro-graph

SPIKE-002 code. See `../SPIKE.md` for the question, method and findings. It holds the step 1 experiments (`scripts/`) and a small Astro site whose pages and links become a graph at build time and are loaded into a browser CypherLite instance.

- `src/content/pages/*.md`: eleven content pages with links between them.
- `src/pages/graph.json.ts`: the build-time step, a static endpoint that turns the content collection into `{pages, links}`.
- `src/pages/explore.astro` and `src/lib/graphClient.js`: the island that loads the WASM module and `/graph.json` and runs Cypher. `?graph=/synthetic/graph-1000.json`, `&variant=default` (call `init()` with no argument) and `&indexed=0` change what it loads.
- `src/lib/normalize.js`, `src/lib/cypherTag.js`: copies of SPIKE-001's result normalization and tagged template.

## Setup

The WASM package is not on npm, so it is built from a local CypherLite checkout into `.wasm-build/` (the checkout is not modified; the cargo target directory can be redirected with `CARGO_TARGET_DIR`). Prerequisites are the same as SPIKE-001's `observable-graph`: `wasm-bindgen-cli` at the version the checkout's lockfile pins, `binaryen` 110 or newer, and the `wasm32-unknown-unknown` target for the checkout's pinned Rust toolchain.

```bash
CYPHERLITE_DIR=/path/to/cypherlite npm run build:wasm
npm install
```

## Run the site

```bash
node scripts/synthesize.mjs 100,1000,5000   # optional: synthetic graphs for the scale checks
npm run dev                                 # http://localhost:4321/explore/
npm run build && npm run preview            # production build, http://localhost:4321/
```

Set `ASTRO_TELEMETRY_DISABLED=1` (or run `npx astro telemetry disable`) to turn off Astro's telemetry.

## Step 1 scripts

```bash
node scripts/delivery.mjs 10,100,1000,5000 --indexed   # compares three ways to load a graph into the WASM engine
node scripts/delivery.mjs 10,100,1000                  # same, without an index on Page.id
```

Results are written to `results/`. `scripts/native-checkpoint.mjs` writes a checkpoint with the native Node library and needs the native C library (`cargo build --release` in the checkout's `surfaces/cypherlite-ffi`), the Node client (`clients/javascript`, with koffi installed, copied out of the checkout), and the environment variables listed at the top of the script.
