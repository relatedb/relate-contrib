# Quickstart: validating the core package

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

How to check, end to end, that the package works. The commands do not exist until the tasks are done;
this guide defines what they must do. Details of the interfaces are in [contracts/](contracts/).

## Prerequisites

- Node 22 or newer and pnpm (11.7.0 here).
- Rust toolchain for the engine's pinned version, `wasm-bindgen-cli` at the version the engine's lockfile
  pins, binaryen (`wasm-opt`), and the `wasm32-unknown-unknown` target (research R7).
- Access to the engine's repository for the submodule (it is not public yet).
- Chromium, Firefox and WebKit for Playwright (`pnpm exec playwright install`).

## Setup

```bash
git submodule update --init vendor/cypherlite
pnpm run build:wasm      # builds the pinned engine into vendor/cypherlite-wasm/pkg
pnpm install
pnpm -r build            # compiles packages/core
```

Expected: `vendor/cypherlite-wasm/pkg` contains `cypherlite.js` and `cypherlite_bg.wasm`; `packages/core/dist` exists.

## Scenario 1: data checks (User Story 2, SC-006)

```bash
pnpm --filter @relate/web-core test:unit
```

Expected: every valid document and descriptor in the corpus passes; every invalid one is rejected with the path of
its first problem; the validators agree with `contracts/graph-data.schema.json` and
`contracts/graph-descriptor.schema.json`; the number encoder writes a number
array with any fractional value as floats.

## Scenario 2: loading and querying in three browsers (Stories 1 and 2, SC-011)

```bash
pnpm --filter @relate/web-core test:browsers
```

Expected (WebKit runs in a persistent profile with origin-private data cleared between tests, since Playwright's default WebKit context has no origin-private file system): the loader tests pass in Chromium, Firefox and WebKit; the page stays responsive during a
20,000-node load (longest stall under 50 ms); timings are recorded and compared with the baselines.

## Scenario 3: faults and recovery (Story 3, SC-004, SC-010)

Included in the browser run (`faults.spec.ts`). Expected: after a trap, a timeout and a worker error each,
the generation increases and subscriptions deliver fresh results with no page reload; a document that
crashes the engine on every load ends in `failed` after three attempts, with links usable and the failure
wording shown.

## Scenario 4: both profiles (Stories 4 and 5, SC-007, SC-009)

Included in the browser run (`persistent.spec.ts`, `per-page.spec.ts`). Expected: across ten navigations in
`client-routing` the worker and generation are unchanged and no scoped data remains; in `multi-page` the graph
is restored from the store with no request for the data, a changed descriptor revision resets it, and a store
held by a second page falls back to an in-memory graph within five seconds plus the replay time.

## Scenario 5: conformance and packaging (Story 7, SC-008)

```bash
pnpm --filter @relate/web-core test:conformance
pnpm --filter @relate/web-core test:package
```

Expected: the conformance report passes under both profiles; the packed tarball installs in a clean
project outside this repository with the engine installed beside it and works with the binary URL passed as
an option.

## Traceability (SC-005)

```bash
pnpm --filter @relate/web-core test:trace
```

Expected: every requirement id in `specs/001-core-package/spec.md` has a row in the traceability table
with a passing test.
