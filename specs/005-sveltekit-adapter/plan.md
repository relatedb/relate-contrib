# Implementation Plan: SvelteKit Adapter for Embedding the Graph Database in SvelteKit Sites

**Branch**: `adapter/sveltekit` (spec directory `005-sveltekit-adapter`) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-sveltekit-adapter/spec.md`

## Summary

Build `@relate/contrib-sveltekit` (`packages/sveltekit`): a server entry that turns registered graph sources into prerendered, revision-named files and descriptors and returns a plain-data catalog, and a main entry shipped as Svelte source with a provider, an inline-graph component and helpers whose lifetimes follow components. Check it with a SvelteKit conformance site and the core's conformance runner in three browsers, as static files and as a Node server, and with a clean-install package test.

Planning checked ADR-007's open items early (V-1 to V-8 in [research.md](research.md)): the endpoint under the Node output, build failures for a throwing, a non-deterministic and an invalid source, the development server following an edit, hydration of a holder on an on-demand page, the `$app/paths` import from a package compiled by the site's build, and `data-sveltekit-reload` all behave as ADR-007 assumes. Three statements needed amending and were (ADR-007 §6, 2026-11-08): rune modules in the package are `.svelte.js`, not `.svelte.ts` (the development server rejects `.svelte.ts` from `node_modules`); `resolve()` gives the server render a page-relative path, so only the browser's location matters; and `GraphData` writes the same element on both sides, since a server-only element is removed by hydration.

## Technical Context

**Language/Version**: TypeScript 7 for the server entry and the tests (as the other packages), plain JavaScript with JSDoc for rune modules and the registry, Svelte 5 components (which may use TypeScript), Node 24, ES2022 browser target

**Primary Dependencies**: peers `@sveltejs/kit` ^3, `svelte` ^5, `@relate/contrib-web`, `@relate/relate-wasm`; no other runtime dependency. Dev: `@playwright/test`, `vitest`, `typescript`, `@sveltejs/kit`, `svelte`, `vite`, `@sveltejs/vite-plugin-svelte`, `@sveltejs/adapter-static`, `@sveltejs/adapter-node`.

**Storage**: none of its own. Registered graphs are prerendered files; the core's origin-private store is used through the core.

**Testing**: Vitest (unit; build tests running `vite build` on small fixture apps with each adapter), Playwright in Chromium, Firefox and WebKit (lifetimes, consecutive pages, inline graphs, direct lookup, on-demand hydration, development server), the core's conformance runner over the conformance site (both profiles, both outputs), a clean-install package test (both outputs), and a trace check that every FR and SC has a tagged, passing test.

**Target Platform**: SvelteKit 3 sites with the static and Node adapters; desktop browsers as in the core.

**Project Type**: library (a workspace package) with an unpublished test site; no change to the core or the other adapters (FR-033).

**Performance Goals**: none stated in the spec beyond SC-003 and SC-004. The conformance site records load figures for inline and registered graphs (single run, one environment, labeled so) and sets no threshold.

**Constraints**: the adapter MUST NOT decide fault handling, status or loading (FR-027); no main-thread instance; the package never imports the engine's binary and needs no Vite plugin (FR-003); the server entry uses no SvelteKit virtual module (FR-002); module state is touched only in the browser (FR-022).

**Scale/Scope**: one package of about fifteen source files (a server entry of four, Svelte and JavaScript modules for the rest), one test site of about fifteen pages, five test suites.

## Constitution Check

*Gate: before Phase 0. Re-checked after Phase 1 design (same result).*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Decisions Before Code | The plan implements ADR-007 (accepted, reviewed 2026-11-08, amended after the planning checks) and builds on ADR-001 to ADR-006. The planning checks found three statements to correct; they are recorded in ADR-007 §6 before tasks, not decided here. | Pass |
| II. Core First, Thin Adapters | The adapter wires a route builder, a provider and helpers; instance lifetime, faults, loading and status pass through the core. The page lifetime composes `createClient` and `destroy()` as ADR-005 §2.4 records, now for the third time (follow-up work in ADR-004, ADR-005 and ADR-007: move it into the core). The shared build code is the core's. | Pass |
| III. The Page Works Without the Graph | Helpers return empty values on the server and in the first browser render; the inline element is inert data; conformance pages keep links and placeholders; SC-008 tests the server's markup, hydration warnings and the failed state. | Pass |
| IV. Faults Are Contained | All instances run in the core's worker; page clients are destroyed one task after the last holder leaves; the adapter adds no visitor statements. | Pass |
| V. Specified Behavior Is Tested and Measured | Every FR and SC gets a tagged test and the trace check; the inline-size threshold, the cost of evaluating each source twice and the extra copies of the binary are labeled unmeasured; planning checks are single runs and say so. | Pass |
| VI. The Engine Stays Upstream | The engine is reached through its package interface, with the site passing the binary's URL from its own `?url` import; no engine internals are copied. | Pass |

## Decisions (D-1 to D-6; D-1 and D-3 applied to ADR-007 §6 on 2026-11-08)

- **D-1.** Rune modules are plain `.svelte.js` with JSDoc and a `.d.ts` beside each; components are `.svelte` and may use TypeScript (V-2).
- **D-2.** Locations are built in the browser with `resolve()` after mount; the catalog carries none (V-1).
- **D-3.** `GraphData` writes the same `{@html}` element on both sides and validates in both places (V-3).
- **D-4.** The registry, the inline lookup and the location builder are plain JavaScript without runes, so they have Node unit tests; the Svelte wrappers only connect them to `onMount`.
- **D-5.** The conformance site's profile comes from the `handle` hook (`data-sveltekit-reload`), its output from `ADAPTER`, `OUT` and `BASE`.
- **D-6.** The route builder derives the base path from the request.

## Project Structure

### Documentation (this feature)

```text
specs/005-sveltekit-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output (checks V-1 to V-9, decisions D-1 to D-6)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output: server-entry, client-entry, conformance-site
├── verify/              # fixtures for the planning checks
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/sveltekit/
├── package.json                    # @relate/contrib-sveltekit; exports "." (svelte and default conditions) and "./server"
├── tsconfig.json                   # for src/server and the tests
├── README.md                       # use, lifetimes, the placeholder-first rule, route file, base path, cell-free notes
├── src/
│   ├── index.js                    # re-exports the main entry (RelateProvider, GraphData, useGraph, useQuery, graph)
│   ├── index.d.ts                  # types of the main entry, written by hand
│   ├── RelateProvider.svelte       # context: catalog, engineUrl, navigation, per-render id record (FR-016)
│   ├── GraphData.svelte            # inline graph element via {@html}; validation (FR-013, FR-014)
│   ├── context.js                  # context keys and accessors
│   ├── registry.js                 # visit clients, page holders, deferred destroy, browser-only (FR-019 to FR-022)
│   ├── inline.js                   # find an inline graph by id: only match, else first visible parent (FR-021)
│   ├── locations.js                # descriptor location from $app/paths resolve() (FR-024)
│   ├── use-graph.svelte.js         # useGraph, useQuery, graph (FR-017, FR-023, FR-025)
│   └── server/
│       ├── index.ts                # createGraphRoute, catalog (re-exports)
│       ├── graphs.ts               # declaration check (id rule, duplicates, fields) (FR-004, FR-012)
│       ├── route.ts                # createGraphRoute: entries, GET, base from request, double evaluation (FR-005 to FR-010)
│       └── catalog.ts              # plain-data catalog (FR-011)
├── tests/
│   ├── unit/                       # declaration rules, route builder, catalog, registry, inline lookup, locations
│   ├── build/                      # `vite build` on fixture apps with each adapter: failures, base path, determinism, outputs
│   ├── browser/                    # Playwright: lifetimes, consecutive pages, inline graphs, direct lookup, on-demand hydration, dev
│   ├── package/clean-install.test.ts
│   └── trace/check-trace.ts
└── conformance-site/               # unpublished SvelteKit app; built once per profile and output
    ├── package.json                # depends on @relate/contrib-sveltekit and @relate/contrib-web by workspace
    ├── vite.config.js              # ADAPTER, BASE, OUT, PORT; server.fs.allow for the repository root
    ├── src/hooks.server.ts         # NAVIGATION=multi-page adds data-sveltekit-reload to the body
    ├── src/lib/graphs.ts           # example sources (variant a; a small one for inline and page graphs)
    ├── src/routes/relate/[id]/[file]/+server.ts   # the route file
    ├── src/routes/+layout.server.ts, +layout.svelte, and pages: home, page-1, page-2, notes, blank, broken, inline-a, inline-b, two-graphs, lifetime-a/b/c, direct, live
    ├── static/                     # variants b, mismatch and broken descriptors and data (as Astro's and Next's)
    └── serve.mjs                   # static file server for adapter-static output (page files win over route folders)
pnpm-workspace.yaml                 # adds packages/sveltekit/conformance-site
package.json (root)                 # scripts: test:sveltekit, test:sveltekit-browsers, test:sveltekit-conformance, test:sveltekit-package, test:sveltekit-trace
```

**Structure Decision**: a fifth workspace package beside `packages/web`, `packages/astro`, `packages/nextjs` and `packages/observable`, with the conformance site inside the package (unpublished: excluded by `files`), as the others do. The site is its own workspace member so pnpm can link or inject the packages into it.

## Complexity Tracking

No constitution violations. The page-lifetime registry written a third time is the follow-up ADR-004 and ADR-005 named (moving it into the core), not a new decision; it stays in the adapters until the core is changed.
