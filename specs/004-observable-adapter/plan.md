# Implementation Plan: Observable Framework Adapter for Embedding the Graph Database

**Branch**: `adapter/observable` (spec directory `004-observable-adapter`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-observable-adapter/spec.md`

## Summary

Build `@relate/observable` (`packages/observable`): a loader entry whose helpers place the engine, build and place the core's worker, and publish a graph's document and descriptor from a source module; a browser entry whose `open` call creates the core's client from file attachments and ties it to a cell; and a results entry that carries over SPIKE-001's normalization and tagged template, re-checked against the current engine. Check it with a Framework conformance site and the core's conformance runner in three browsers, with adapter tests, and with a clean-install package test.

Planning ran the whole path once with stand-ins (V-1 to V-8 in [research.md](research.md)): a binary loader and a bundled-worker loader work, the core's client runs in all three headless browsers from them, a loader's cache is not refreshed by what it reads (the amendment ADR-006 already carries), a loader error stops a build while a cell error does not, and pnpm's injected workspace copy builds where a plain symlink fails. No further ADR amendment is needed; one imprecision in ADR-006's context (which symlinks fail) is narrowed in the research and in the implementation's README.

## Technical Context

**Language/Version**: TypeScript 7 (as the core and the other adapters), Node 24 for loaders, build and tests, ES2022 browser target

**Primary Dependencies**: peers `@observablehq/framework` ^1.13, `@relate/web`, `@relate/relate-wasm`; runtime dependency `esbuild` (the worker loader). Dev: `@playwright/test`, `vitest`, `typescript`, `@observablehq/framework` (for the conformance site).

**Storage**: none of its own. Descriptor graphs use the core's origin-private store through the core.

**Testing**: Vitest (results against the real engine in Node; loaders run as scripts; build tests running `observable build` on small fixtures), Playwright in Chromium, Firefox and WebKit (destruction on invalidation and `pagehide`, several opens, the back-forward reload, queries feeding components), the core's conformance runner over the conformance site, a clean-install package test, and a trace check that every FR and SC has a tagged, passing test.

**Target Platform**: Framework 1.x sites, production build served statically and the preview server; desktop browsers as in the core.

**Project Type**: library (a workspace package) with an unpublished test site. No change to the core or the other adapters (FR-028).

**Performance Goals**: none stated in the spec beyond SC-003. The conformance site records load figures for the engine, the worker bundle and a document graph (single run, one environment, labeled so) and sets no threshold.

**Constraints**: the adapter MUST NOT decide fault handling, status, recovery or loading (FR-014); no main-thread instance, no visit-lifetime client (FR-017); the package never imports the engine's binary (FR-002); the core is unchanged (FR-028).

**Scale/Scope**: one package of about ten source files in three entries, one test site of about ten pages and five loaders, four test suites.

## Constitution Check

*Gate: before Phase 0. Re-checked after Phase 1 design (same result).*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Decisions Before Code | The plan implements ADR-006 (accepted, reviewed and amended 2026-11-08) and builds on ADR-001 to ADR-005. The planning checks found nothing that needs a decision ADR-006 does not make. | Pass |
| II. Core First, Thin Adapters | The adapter places files, creates the core's client and shapes results; fault handling, status, loading and revisions come from the core (`createClient`, `@relate/web/build`, `@relate/web/validate`). Normalization lives in the adapter because the constitution keeps query results unaltered in the core; ADR-006 §4 records the move to the core as follow-up work. | Pass |
| III. The Page Works Without the Graph | Cells do not render on a server, so no first render depends on the instance; a page's text and non-graph cells render while the graph loads or fails (SC-008, tested); `ready` rejects with the core's failure wording instead of leaving a blank region. Framework pages have no client navigation to preserve. | Pass |
| IV. Faults Are Contained | All instances run in the core's worker, constructed from the bundled worker module; a replaced instance is the core's recovery; the adapter adds no visitor-supplied statements. | Pass |
| V. Specified Behavior Is Tested and Measured | Every FR and SC gets a tagged test and the trace check; V-1 to V-8 are single runs and say so; the cost of cleaning the cache on every build and of an extra instance is labeled unmeasured. | Pass |
| VI. The Engine Stays Upstream | The engine is reached through its package interface: its binary is copied by path, its glue is bundled as published, nothing of its internals is copied. | Pass |

## Decisions (research D-1 to D-6; none needs an ADR amendment)

- **D-1.** Loaders resolve the engine and the core from the site's root, not from the adapter's location.
- **D-2.** Loader tests run the loader scripts as processes; no output parameter is added to the helpers.
- **D-3.** `open` resolves each attachment once per page, keyed by name.
- **D-4.** The conformance site takes its packages as pnpm injected dependencies and refreshes them in `pretest`, with pack-and-unpack as the fallback (untested until the site exists; see the first implementation task).
- **D-5.** Graph sources are plain JavaScript or JSON modules.
- **D-6.** Conformance variants are literal attachments chosen by a query parameter.

## Project Structure

### Documentation (this feature)

```text
specs/004-observable-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output (checks V-1 to V-8, decisions D-1 to D-6)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output: loader-entry, browser-entry, results-entry, conformance-site
├── verify/              # the planning checks' fixtures
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/observable/
├── package.json                  # @relate/observable; exports ".", "./loader", "./results"
├── tsconfig.json
├── README.md                     # the loaders, the open call, the clean-before-build scripts, the cell rules
├── src/
│   ├── index.ts                  # open, and the results re-exports (FR-011 to FR-017)
│   ├── open.ts                   # attachments, descriptor rewrite, createClient, lifetime (FR-012 to FR-016)
│   ├── attachments.ts            # once-per-page resolution by name (D-3)
│   ├── loader/
│   │   ├── index.ts              # engine, worker, document, descriptor (FR-003 to FR-010)
│   │   ├── resolve.ts            # package resolution from the site's root (D-1)
│   │   └── fail.ts               # message to standard error, exit non-zero
│   └── results/
│       ├── index.ts              # normalize, toGraph, makeCypher (FR-018 to FR-021)
│       ├── normalize.ts
│       ├── graph.ts
│       └── cypher.ts
├── tests/
│   ├── unit/                     # results against the real engine in Node; open's lifetime with a stub client
│   ├── build/                    # loaders as processes; `observable build` on fixtures: failures, freshness, revisions
│   ├── browser/                  # Playwright: destruction, several opens, back-forward reload, components
│   ├── package/clean-install.test.ts
│   └── trace/check-trace.ts
└── conformance-site/             # unpublished Framework project
    ├── package.json              # injected @relate/observable and @relate/web; the engine as a direct dependency
    ├── observablehq.config.js
    ├── docs/data/                # relate.wasm.js, relate-worker.js.js, example.graph.json.js, example.descriptor.json.js
    ├── docs/lib/example.js       # the graph source (variant a) and a small document for the page graphs
    ├── docs/*.md                 # home, page-1, page-2, notes, blank, broken, document, two-graphs, rerun, queries
    ├── docs/variants/            # variants b, mismatch and broken as plain files
    └── serve.mjs                 # static file server for the built site
pnpm-workspace.yaml               # adds packages/observable/conformance-site
package.json (root)               # scripts: test:observable, test:observable-browsers, test:observable-conformance, test:observable-package, test:observable-trace
```

**Structure Decision**: a fourth workspace package beside `packages/web`, `packages/astro` and `packages/nextjs`, with the conformance site inside the package (unpublished: excluded by `files`), as the others do. The site is its own workspace member so pnpm can inject the packages into it.

## Complexity Tracking

No constitution violations. The planning checks found no gap in ADR-006.
