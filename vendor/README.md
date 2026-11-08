# Vendored engine

`relate/` is a git submodule of `git@github.com:relatedb/relate.git`, the embedded graph engine (RelateDB,
formerly CypherLite) whose browser build this repository wraps. It is vendored because the browser package,
`@relate/relate-wasm`, is not published to npm yet. The core package declares `@relate/relate-wasm` as a peer
dependency and never refers to this directory; the workspace resolves the peer dependency to
`vendor/relate-wasm/pkg` (see `pnpm-workspace.yaml`).

## Pinned commit

`31269e3` (`feat(storage): experimental rkyv and fjall snapshot codecs, default off`, ADR-0537), the head of the
engine's `main` at the time of the rename (2026-11-08). The design spikes and the loading experiment in
`specs/001-core-package/research.md` (R2) ran against the earlier CypherLite checkout `0b596fd8`; the repository
history was reset in the move, so the two commits share no ancestry. Move the pin deliberately, after re-running
the test suite.

## Access

The submodule is cloned from a local checkout while the engine's remote is not public: the first
`git submodule add` used `/Users/abk/Developer/relatedb/relate`, then `.gitmodules` was pointed at the GitHub
remote. To refresh from a local checkout, fetch into the submodule from it and check out the wanted commit:

```bash
git -C vendor/relate fetch /path/to/relate main && git -C vendor/relate checkout FETCH_HEAD
```

Cloning from the remote needs read access to `relatedb/relate`:

```bash
git submodule update --init vendor/relate
```

## Building the browser package

```bash
pnpm run build:wasm
```

This runs the engine's own `scripts/build-wasm.sh` (release profile) with its output and the cargo target
directory kept outside the submodule, so the submodule stays clean: output in `vendor/relate-wasm/pkg`,
cargo target in `vendor/.build/target` (both gitignored). It needs Rust (the toolchain the engine pins),
`wasm-bindgen-cli` at the version in the engine's `Cargo.lock`, `wasm-opt` (binaryen) and the
`wasm32-unknown-unknown` target.

## Continuous integration

No workflow exists yet (this repository has no remote). When one is added:

- Check out with submodules using a read-only deploy key or fine-grained token for `relatedb/relate`, stored as
  a secret.
- Install the Rust toolchain the engine pins, `wasm-bindgen-cli` at the version `pnpm run build:wasm` reports, and
  binaryen, then run `pnpm run build:wasm`. Cache `vendor/.build/target` and `vendor/relate-wasm/pkg`, keyed by the
  submodule commit and the lockfile, since the first build takes several minutes.
- Install the browsers with `pnpm exec playwright install --with-deps chromium firefox webkit`, then run the scripts
  listed in `packages/web/README.md`. Baselines are per environment: set `GW_ENV` to a name for the runner and commit
  its baselines after a first run.
- Once `@relate/relate-wasm` is published to npm, delete the submodule, `scripts/build-wasm.sh` and the
  override in `pnpm-workspace.yaml`, and depend on the published package.
