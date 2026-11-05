# Implementation Plan: Astro Adapter for Embedding the Graph Database in Astro Sites

**Branch**: `002-astro-adapter` | **Date**: 2026-11-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-astro-adapter/spec.md`

## Summary

Build `@relate/web-astro` (`packages/astro`): an Astro 7 integration that turns registered graph sources into revision-named static files and descriptors, an `.astro` component that carries a small graph inside a page, and a client module whose page entry ties each page's graph clients to the router's arrival and departure. Everything about instances, faults, loading and profiles stays in `@relate/web-core`. The adapter is checked by an unpublished conformance site (run with the core's runner in three browsers, both profiles), its own browser and build tests, and a clean-install test.

Planning found two points where ADR-004 and the core's conformance runner did not fit Astro (section "Decisions needed"). Both were resolved on 2026-11-04 by an ADR-004 amendment and a spec amendment, as recommended there.

## Technical Context

**Language/Version**: TypeScript 7 (as the core), Node 24 for build and tests, ES2022 browser target

**Primary Dependencies**: peers `astro` ^7.4, `@relate/web-core`, `@neo4j-labs/cypherlite-wasm`; no other runtime dependency. Dev: `@playwright/test`, `vitest`, `typescript`.

**Storage**: none of its own. Registered graphs are static files; the core's origin-private store is used through the core.

**Testing**: Vitest (unit, build-failure tests running `astro build` on small fixtures), Playwright in Chromium, Firefox and WebKit (lifecycle, store, direct lookup, dev server), the core's conformance runner over the conformance site, a clean-install package test, and a trace check that every FR and SC has a tagged passing test.

**Target Platform**: static Astro 7 sites; desktop browsers as in the core (Chromium, Firefox, WebKit)

**Project Type**: library (a workspace package) with an unpublished test site

**Performance Goals**: none stated in the spec beyond SC-003 and SC-004 (no leaks, retained client). The adapter adds no measured cost claim; the conformance site records load figures for inline and registered graphs (labeled single-run, one environment) so a later decision can set the size at which a graph is registered instead.

**Constraints**: the adapter MUST NOT decide fault handling, status or loading (FR-025); no main-thread instance; the core is not changed except as the amendments below allow.

**Scale/Scope**: one package of roughly ten source files, one test site of about ten pages, five test suites.

## Constitution Check

*Gate: before Phase 0. Re-checked after Phase 1 design (same result).*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Decisions Before Code | The plan implements ADR-004 (accepted) and builds on ADR-001, ADR-002, ADR-003. Two needs are not covered by ADR-004: D-1 (conformance against hashed, id-bound descriptors) and D-2 (scoping page setup to its page). Pass after the 2026-11-04 ADR-004 amendment (D-1, D-2). |
| II. Core First, Thin Adapters | The adapter wires build-time data and router events; instance lifetime, faults, loading and status pass through the core. The `"page"` lifetime composes `createClient` and `destroy()` as ADR-004 records. D-1 would add an additive parameter to the core's conformance runner so the adapter passes the same check. | Pass, subject to D-1 |
| III. The Page Works Without the Graph | Inline graphs are inert `<script type="application/json">` data; nothing renders from the instance; conformance pages keep links and placeholders; SC-008 tests it. | Pass |
| IV. Faults Are Contained | All instances run in the core's worker; page-lifetime clients are destroyed on departure; no visitor statements are added by the adapter. | Pass |
| V. Specified Behavior Is Tested and Measured | Every FR and SC gets a tagged test and the trace check; the inline-size threshold is labeled unmeasured and load figures are recorded as single-run figures. | Pass |
| VI. The Engine Stays Upstream | The engine is imported through its package interface (`@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url`); no engine internals are copied. | Pass |

## Decisions needed (resolved 2026-11-04 by the ADR-004 amendment)

**D-1. Conformance of an id-bound, hashed-URL adapter against the core's runner.** The runner (`packages/core/conformance/scenarios.ts`) assumes the core's example site: fixed page paths (`/index.html`, `/page-1.html`, `/notes.html`, `/blank.html`), `variant=b|mismatch|broken` query values that select other descriptors, and request checks that look for the substrings `/graph.json` (C-11, positive) and `/graph-b.json` (C-07, positive). Two facts about the adapter break that:

1. A registered graph's data URL is `/_related/<id>/graph.<revision>.json` and contains neither substring, so C-07 and C-11 fail on the positive checks.
2. A descriptor's `id` is the graph name, and the store is named by the descriptor `id`. C-07 needs the same `id` with a different `revision` (an older store replaced by a newer revision). One Astro build produces one revision per name, so a "variant b" of the same graph needs a second build, or a descriptor the adapter does not generate. C-03 (broken data URL) and C-10 (counts that disagree) likewise need descriptors the adapter never writes.

*Recommended resolution*: amend ADR-004 so `page.graph(id, options)` and `graph(id, options)` accept a `descriptor` URL override beside the `navigation` override (a testing aid, documented as such); and parameterize the runner (additive, optional) with a predicate for "this request fetched variant A / B data" so the default behavior is unchanged. The conformance site then registers the graph for variant `a` through the integration (so the adapter's build path is what scenarios C-01 to C-06, C-08, C-09 exercise) and serves variants `b`, `mismatch` and `broken` from static files under `public/` through the override. This keeps "every adapter passes the same check" (principle II) without weakening the core's scenarios. It needs the spec's "changes to the core" exclusion to read "except additive parameters of the conformance runner".

**D-2. Which pages a page's setup runs on.** Astro's router runs a bundled module script once per document, not again on each arrival, and `astro:page-load` fires only when the router is present. Two consequences for the page entry: (a) the first page's setup must run at load whether or not the router exists, and the router's first `astro:page-load` must not run it a second time; (b) a setup registered by a script that only some pages include would, if run on every `astro:page-load`, run on pages that never loaded the script. ADR-004 §2.3 says "on every `astro:page-load`" and is right only for layout-level scripts.

*Recommended resolution*: amend ADR-004 so `onPage(setup, { selector })` runs the setup only on pages where `document.querySelector(selector)` matches (default: every page). Page-specific scripts pass the selector of the markup they drive.

## Project Structure

### Documentation (this feature)

```text
specs/002-astro-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/astro/
├── package.json                  # @relate/web-astro; exports ".", "./graph-data", "./client", "./types"
├── tsconfig.json
├── README.md                     # use, lifetimes, the placeholder-first rule for UI-framework wrappers
├── src/
│   ├── index.ts                  # the integration: options, config check, plugin, injected routes, dev warning hook
│   ├── options.ts                # parse and validate `graphs`, `navigation`, lifetimes (FR-002 to FR-005)
│   ├── sources.ts                # evaluate once, validate (core), canonical form, revision (FR-006 to FR-009)
│   ├── routes/files.ts           # injected prerendered endpoint for descriptor.json and graph.<revision>.json
│   ├── plugin.ts                 # Vite plugin: virtual:related-web/config and /sources, dev re-evaluation (FR-011, FR-012)
│   ├── GraphData.astro           # exported as @relate/web-astro/graph-data (FR-013 to FR-015)
│   ├── client/
│   │   ├── index.ts              # onPage, graph (FR-016 to FR-024, FR-026)
│   │   ├── page.ts               # page lifecycle: first load, arrival, departure, pagehide
│   │   └── registry.ts           # resolves a name: inline first, then registered; lifetimes; same-client rule
│   └── types.d.ts                # the virtual module and the component's props
├── tests/
│   ├── unit/                     # options, canonical form and revision, escaping, registry rules
│   ├── build/                    # `astro build` and `astro dev` on small fixture sites: failures, base path, dev errors
│   ├── browser/                  # Playwright: lifecycle, departure, store, direct lookup, conformance run
│   ├── package/clean-install.test.ts
│   └── trace/check-trace.ts
└── conformance-site/             # unpublished Astro site; built once per profile
    ├── astro.config.mjs          # NAVIGATION=client-routing|multi-page chooses the profile and the layout's router
    ├── src/graphs/               # example graph sources (variant a, and a small one for inline/page graphs)
    ├── src/layouts/Base.astro    # markup contract (data-gw-*), ClientRouter only for client-routing
    ├── src/pages/                # index, page-1, page-2, notes, broken, blank, plus lifetime and two-graph pages
    └── public/                   # variant b, mismatch and broken descriptors and data (D-1)
pnpm-workspace.yaml               # unchanged: packages/* already includes packages/astro
package.json (root)               # scripts: test:astro, test:astro-conformance, test:astro-package, test:astro-trace
```

**Structure Decision**: a second workspace package beside `packages/core`, with the conformance site inside the package (unpublished: excluded by `files`) as the core does for its example site. The site is an Astro project so it can be built twice from one source tree, once per profile.

## Complexity Tracking

No constitution violations. The two decisions above are gaps in ADR-004, not violations; they are resolved by amendment, not by justification.
