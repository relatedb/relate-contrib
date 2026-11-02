# Vendored engine

`cypherlite/` is a git submodule of `git@github.com:neo4j-labs/cypherlite.git`, the embedded graph engine
whose browser build this repository wraps. It is vendored because the browser package is not published to
npm yet. The core package declares `@neo4j-labs/cypherlite-wasm` as a peer dependency and never refers to
this directory; the workspace resolves the peer dependency to `vendor/cypherlite-wasm/pkg` (see
`pnpm-workspace.yaml`).

## Pinned commit

`0b596fd8` (`fix(executor): the classifier reads the tag, not the payload`, #565), the checkout the design
spikes and the loading experiment in `specs/001-core-package/research.md` (R2) used. Remote HEAD has moved on
since; move the pin deliberately, after re-running the test suite.

## Access

The repository is not public yet. Cloning the submodule needs read access to `neo4j-labs/cypherlite`:

```bash
git submodule update --init vendor/cypherlite
```

## Building the browser package

```bash
pnpm run build:wasm
```

This runs the engine's own `scripts/build-wasm.sh` (release profile) with its output and the cargo target
directory kept outside the submodule, so the submodule stays clean: output in `vendor/cypherlite-wasm/pkg`,
cargo target in `vendor/.build/target` (both gitignored). It needs Rust (the toolchain the engine pins),
`wasm-bindgen-cli` at the version in the engine's `Cargo.lock`, `wasm-opt` (binaryen) and the
`wasm32-unknown-unknown` target.

## Continuous integration

No workflow exists yet (this repository has no remote). When one is added:

- Check out with submodules using a read-only deploy key or fine-grained token for `neo4j-labs/cypherlite`, stored as
  a secret.
- Install the Rust toolchain the engine pins, `wasm-bindgen-cli` at the version `pnpm run build:wasm` reports, and
  binaryen, then run `pnpm run build:wasm`. Cache `vendor/.build/target` and `vendor/cypherlite-wasm/pkg`, keyed by the
  submodule commit and the lockfile, since the first build takes several minutes.
- Install the browsers with `pnpm exec playwright install --with-deps chromium firefox webkit`, then run the scripts
  listed in `packages/core/README.md`. Baselines are per environment: set `GW_ENV` to a name for the runner and commit
  its baselines after a first run.
- Once `@neo4j-labs/cypherlite-wasm` is published to npm, delete the submodule, `scripts/build-wasm.sh` and the
  override in `pnpm-workspace.yaml`, and depend on the published package.
