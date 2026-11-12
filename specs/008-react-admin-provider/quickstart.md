# Quickstart: running each check

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Prerequisites: the repository set up as in the root `CLAUDE.md` (`git submodule update --init vendor/relate`, `pnpm run build:wasm`, `pnpm install`, `pnpm -r build`).

## The engine assumptions (research R2)

```sh
node specs/008-react-admin-provider/probes/reads-and-writes.mjs
node specs/008-react-admin-provider/probes/guarded-writes.mjs
node specs/008-react-admin-provider/probes/indexes-and-fill.mjs
node specs/008-react-admin-provider/probes/constraints.mjs
node specs/008-react-admin-provider/probes/constraints-2.mjs
node specs/008-react-admin-provider/probes/constraints-3.mjs
```

Each prints a statement and its result. After the probes become tests they run with the package's unit tests.

## The package

```sh
pnpm test:react-admin             # contract tests against the real engine, in Node
pnpm test:react-admin-package     # packs the package, installs it in a clean project with react-admin and @relate/web, runs a list call
pnpm test:react-admin-trace       # every requirement and success criterion has a passing, tagged test
```

## The demo

```sh
pnpm --filter react-admin-demo dev          # the demo at a local address
pnpm test:react-admin-browsers                 # the demo in Chromium, Firefox and WebKit
```

Expected: the lists show 6 companies, 50 people and 10 projects on first run; a created person is still there after a reload; a second tab says it is waiting.

## Everything

```sh
pnpm test:drift     # build, typecheck, unit tests (includes the package's), conformance
pnpm test:all       # adds the browsers, packages and traces
```
