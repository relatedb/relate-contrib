# astro-graph

SPIKE-002 code. See `../SPIKE.md` for the question, method and findings. Step 1 (delivery routes) is in `scripts/`; the Astro site is not built yet.

## Setup

The WASM package is not on npm, so it is built from a local CypherLite checkout into `.wasm-build/` (the checkout is not modified; the cargo target directory can be redirected with `CARGO_TARGET_DIR`). Prerequisites are the same as SPIKE-001's `observable-graph`: `wasm-bindgen-cli` at the version the checkout's lockfile pins, `binaryen` 110 or newer, and the `wasm32-unknown-unknown` target for the checkout's pinned Rust toolchain.

```bash
CYPHERLITE_DIR=/path/to/cypherlite npm run build:wasm
npm install
```

## Step 1 scripts

```bash
node scripts/delivery.mjs 10,100,1000,5000 --indexed   # compares three ways to load a graph into the WASM engine
node scripts/delivery.mjs 10,100,1000                  # same, without an index on Page.id
```

Results are written to `results/`. `scripts/native-checkpoint.mjs` writes a checkpoint with the native Node library and needs the native C library (`cargo build --release` in the checkout's `surfaces/cypherlite-ffi`), the Node client (`clients/javascript`, with koffi installed, copied out of the checkout), and the environment variables listed at the top of the script.
