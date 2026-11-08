# Implementation Plan: Next.js Adapter for Embedding the Graph Database in Next.js Sites

**Branch**: `003-next-adapter` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-next-adapter/spec.md`

## Summary

Build `@relate/nextjs` (`packages/nextjs`): a configuration wrapper, a server entry that turns registered graph sources into statically generated, revision-named files and descriptors and writes inline graphs into pages, and a client entry with a provider and React hooks whose lifetimes follow components. Move the revision and descriptor code out of `@relate/astro` into the core as `@relate/web/build`. Check it with a Next conformance site and the core's conformance runner in three browsers, and with a clean-install package test under both of Next's bundlers.

Planning checked ADR-005's four open questions early (V-1, V-2, V-4, V-5 in [research.md](research.md)): the destructured route export and the catalog as props work, the development server follows source edits, and a hidden earlier page is released but, under `cacheComponents`, leaves its inline-graph element in the document. That last result, and two points where ADR-005 and the Astro code do not fit (a Node-only hash and the list of what moves), need ADR amendments (section "Decisions needed"). The recommendations follow the checks; they need your approval before tasks are generated.

## Technical Context

**Language/Version**: TypeScript 7 (as the core and the Astro adapter), React 19, Node 24 for build and tests, ES2022 browser target

**Primary Dependencies**: peers `next` ^16, `react` ^19, `@relate/web`, `@relate/relate-wasm`; no other runtime dependency. Dev: `@playwright/test`, `vitest`, `typescript`, `@types/react`.

**Storage**: none of its own. Registered graphs are static files; the core's origin-private store is used through the core.

**Testing**: Vitest (unit; build tests running `next build` on small fixtures with each bundler), Playwright in Chromium, Firefox and WebKit (lifecycle, strict mode, store, direct lookup, hidden pages, development server), the core's conformance runner over the conformance site (production server and static export, both profiles), a clean-install package test (both bundlers), and a trace check that every FR and SC has a tagged, passing test.

**Target Platform**: Next 16 app router sites, static export and the Node production server; desktop browsers as in the core.

**Project Type**: library (a workspace package) with an unpublished test site; plus one additive subpath in the core.

**Performance Goals**: none stated in the spec beyond SC-003 and SC-004. The conformance site records load figures for inline and registered graphs (single run, one environment, labeled so) and sets no threshold.

**Constraints**: the adapter MUST NOT decide fault handling, status or loading (FR-025); no main-thread instance; the engine's binary is never imported by the package (FR-003); the core changes only by the build subpath (FR-028, as amended by D-2).

**Scale/Scope**: one package of about twelve source files, one core subpath of about five files, one test site of about ten pages, five test suites.

## Constitution Check

*Gate: before Phase 0. Re-checked after Phase 1 design (same result).*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Decisions Before Code | The plan implements ADR-005 (accepted) and builds on ADR-001 to ADR-004. Three points are not covered by ADR-005: D-1 (the hash must not use a Node-only module), D-2 (the inline check and escaping move too) and D-4 (inline graphs are found by visibility). Resolved by the ADR-005 amendment of 2026-11-05. | Pass |
| II. Core First, Thin Adapters | The adapter wires route handlers, a provider and hooks; instance lifetime, faults, loading and status pass through the core. The page lifetime composes `createClient` and `destroy()` as ADR-005 §2.4 records. The shared build code moves into the core (D-1, D-2), which is what the principle asks. | Pass |
| III. The Page Works Without the Graph | Hooks return empty values on the server and the first client render; inline graphs are inert `<script type="application/json">` data; conformance pages keep links and placeholders; SC-008 tests markup equality and hydration warnings. | Pass |
| IV. Faults Are Contained | All instances run in the core's worker; page clients are destroyed one task after the last holder leaves; the adapter adds no visitor statements. | Pass |
| V. Specified Behavior Is Tested and Measured | Every FR and SC gets a tagged test and the trace check; the inline-size threshold is labeled unmeasured and load figures are recorded as single-run figures. Planning checks V-1 to V-7 are single runs and say so. | Pass |
| VI. The Engine Stays Upstream | The engine is reached through its package interface, with the site passing the binary's URL (`new URL("@relate/relate-wasm/relate_bg.wasm", import.meta.url)`); no engine internals are copied. | Pass |

## Decisions (D-1, D-2, D-4 approved 2026-11-05; ADR-005 §6 and the spec are amended)

**D-1. The build subpath cannot use `node:crypto`.** ADR-005 §2.2 says `@relate/web/build` needs no Node-only module; the Astro code hashes with `createHash`. *Recommended*: use `globalThis.crypto.subtle.digest` (same SHA-256, so revisions are unchanged), which makes `revisionOf` and `prepare` asynchronous; the Astro adapter's call sites and unit tests gain `await` and no expectation changes. See [research.md](research.md) D-1 for the rejected alternative.

**D-2. Which Astro code moves.** ADR-005 §2.2 and spec FR-026 name canonical text, revision, document preparation and descriptor construction. The Astro adapter's inline check and JSON escaping (`inline.ts`) are framework-independent and the Next `GraphData` needs them. *Recommended*: they move too, with the caller's name as a parameter of the error text. Amend ADR-005 §2.2 and FR-026.

**D-4. How an inline graph is found when a hidden page stays in the document.** ADR-005 §2.4 queries the document's `data-relate-graph` elements. V-4 shows that under `cacheComponents: true` the departed page's element stays. *Recommended*: take the only match if there is one, otherwise the match whose parent element is visible (`checkVisibility()`, which Chromium, Firefox and WebKit all report correctly). Amend ADR-005 §2.4 and add User Story 3's scenario 9 as a firm requirement (FR-021 gains the rule); the fallback is in [research.md](research.md) D-4.

## Project Structure

### Documentation (this feature)

```text
specs/003-next-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output (checks V-1 to V-7, decisions D-1 to D-7)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── verify/              # fixtures for the planning checks
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/web/
├── package.json                  # gains the "./build" export
└── src/build/                    # NEW, additive (FR-026 to FR-028, D-1, D-2)
    ├── index.ts                  # public surface of the subpath
    ├── canonical.ts              # canonical text, revision (Web Crypto)
    ├── prepare.ts                # validate and canonicalize a document; names the caller in errors
    ├── descriptor.ts             # descriptor construction, base-path join
    └── inline.ts                 # inline document check, JSON escaping for a script element

packages/astro/                   # CHANGED: imports the above; behavior unchanged (FR-027)
└── src/{sources.ts,inline.ts,routes/files.ts,GraphData.astro,...}   # remove local copies, add await

packages/nextjs/
├── package.json                  # @relate/nextjs; exports ".", "./server", "./client"
├── tsconfig.json
├── README.md                     # use, lifetimes, the placeholder-first rule, route file, base path
├── src/
│   ├── index.ts                  # withRelate(nextConfig, options) (FR-002)
│   ├── env.ts                    # names of the env values the wrapper sets and the client reads
│   ├── server/
│   │   ├── index.ts              # createGraphRoute, catalog, GraphData (re-exports)
│   │   ├── graphs.ts             # declaration check (id rule, duplicates), per-process evaluation (FR-004 to FR-012)
│   │   ├── route.ts              # createGraphRoute: generateStaticParams, GET, revision check (FR-005, FR-006, FR-009)
│   │   ├── catalog.ts            # plain-data catalog (FR-011)
│   │   └── GraphData.tsx         # server component for inline graphs (FR-013 to FR-015)
│   └── client/
│       ├── index.ts              # RelateProvider, useGraph, useQuery, graph (FR-016 to FR-024)
│       ├── Provider.tsx          # context + effect-written module state; no client created
│       ├── registry.ts           # visit clients (module state); page holders, deferred destroy (FR-019 to FR-021)
│       ├── inline.ts             # find an inline graph by id: single match, else visible (D-4)
│       └── hooks.ts              # useGraph, useQuery; empty on server and first render
├── tests/
│   ├── unit/                     # declaration rules, route builder, catalog, inline lookup, registry rules
│   ├── build/                    # `next build` with each bundler on fixture apps: failures, base path, determinism
│   ├── browser/                  # Playwright: lifecycle, strict mode, store, direct lookup, hidden pages, dev server
│   ├── package/clean-install.test.ts
│   └── trace/check-trace.ts
└── conformance-site/             # unpublished Next app; built once per profile
    ├── next.config.mjs           # NAVIGATION, EXPORT, CACHE_COMPONENTS choose the build
    ├── lib/graphs.ts             # example graph sources (variant a; a small one for inline/page graphs)
    ├── app/relate/[id]/[file]/route.ts   # the three-line route
    ├── app/                      # layout with provider; pages: home, page-1, page-2, notes, broken, blank, inline, two-graphs, lifetime-a/b, direct
    └── public/                   # variants b, mismatch and broken descriptors and data (as Astro's D-1)
pnpm-workspace.yaml               # unchanged: packages/* already includes packages/nextjs
package.json (root)               # scripts: test:next, test:next-browsers, test:next-conformance, test:next-package, test:next-trace
```

**Structure Decision**: a third workspace package beside `packages/web` and `packages/astro`, with the conformance site inside the package (unpublished: excluded by `files`), as the Astro adapter does. A Next app builds inside a pnpm workspace package under both bundlers (V-6).

## Complexity Tracking

No constitution violations. D-1, D-2 and D-4 are gaps in ADR-005 and in the code it moves, resolved by amendment, not by justification.
