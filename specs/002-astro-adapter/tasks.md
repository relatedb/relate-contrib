---
description: "Task list for the related-web Astro adapter"
---

# Tasks: Astro Adapter for Embedding the Graph Database in Astro Sites

**Input**: Design documents from `/specs/002-astro-adapter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-004 (accepted, amended 2026-11-04) and builds on ADR-001, ADR-002, ADR-003.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers: FR-…, SC-…` comment; `test:astro-trace` reads the tags.

**Organization**: Tasks are grouped by user story. Stories US1 to US3 are P1 and together are the MVP; they run in order because US3 extends the client that US1 and US2 start. The conformance site is created in Phase 2 and each story adds the pages it needs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root; `packages/astro` is the package of the plan. "Verify" tasks check an assumption in `research.md` against the installed Astro and record the finding there before dependent code is written.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package, tooling, scripts

- [X] T001 Create `packages/astro/package.json`: name `related-web-astro`, `type: module`, `private: true`, `files` listing `dist` and `src/GraphData.astro` only (the conformance site is not published), exports `.` (integration), `./graph-data` (the `.astro` file), `./client`, `./types`; `peerDependencies` on `astro` `^7.4`, `related-web-core` and `@neo4j-labs/cypherlite-wasm`; no `dependencies`; dev dependencies `astro`, `related-web-core` (`workspace:*`), `@playwright/test`, `vitest`, `typescript`, `tsx` (versions as the core's)
- [X] T002 [P] Create `packages/astro/tsconfig.json` (strict, ES2022, declaration files, `outDir` `dist`, includes `src/**/*.ts` and `src/types.d.ts`)
- [X] T003 [P] Create `packages/astro/vitest.config.ts` for `tests/unit` and `tests/build`, and `packages/astro/vitest.package.config.ts` for `tests/package`
- [X] T004 [P] Create `packages/astro/playwright.config.ts`: projects `chromium`, `firefox`, `webkit`; two web servers that build `conformance-site` with `NAVIGATION=multi-page` and `NAVIGATION=client-routing` into separate output directories and serve each with `astro preview` on its own port (5180 and 5181)
- [X] T005 Add to the root `package.json` the scripts `test:astro`, `test:astro-browsers`, `test:astro-conformance`, `test:astro-package` and `test:astro-trace` (each `pnpm --filter related-web-astro …`), per `quickstart.md`
- [X] T006 Run `pnpm install`, confirm `astro` 7.4.x and `related-web-core` resolve for `packages/astro`, and run `pnpm --filter related-web-core build` so the core's `dist` and conformance module exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The conformance site's shell, the core runner's additive parameters (D-1), test helpers and the traceability check

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 Create the conformance site shell in `packages/astro/conformance-site/`: `astro.config.mjs` (`output: "static"`, `build.format: "file"`, `outDir` chosen by `NAVIGATION`, a Vite alias `related-web-astro` to `../dist` and `related-web-core` to the core's `dist` as the core's example site does, `optimizeDeps.exclude` for the engine), a `tsconfig.json`, and an empty `src/pages/` and `public/`
- [X] T008 [P] Create `packages/astro/conformance-site/src/layouts/Base.astro`: the document shell and the `data-gw-*` markup the core's pages use (title, nav links to index, page-1, page-2, notes, broken, status, generation, profile, instance, restored, count, updates, last-error, failure, notes row, trap and timeout buttons), with `ClientRouter` included only when `NAVIGATION` is `client-routing`; copy the element contract from `packages/core/conformance/example-site/page-1.html` and `gw-page.ts`
- [X] T009 [P] Create `packages/astro/conformance-site/src/graphs/example.ts`: a source module returning the variant `a` document (300 `Page` nodes, 5 links each, the same shape as `packages/core/tests/fixtures/generate-graph.ts`, so the scenarios' count of `300` holds), plus `small.ts` returning a 20-node document for lifetime and inline pages
- [X] T010 Add additive, optional parameters to the core's conformance runner (D-1; ADR-004 consequences): `RunOptions.dataRequests?: { a: (url: string) => boolean; b: (url: string) => boolean }` in `packages/core/conformance/run.ts`, exposed on the scenario context, and use them in `packages/core/conformance/scenarios.ts` wherever C-02, C-07 and C-11 match request URLs on `/graph.json` or `/graph-b.json` (defaults keep the current substring checks, so the core's example site passes unchanged)
- [X] T011 Add `packages/core/tests/browser/conformance.spec.ts` cases proving the parameters: the core's example site still passes with defaults, and passing `dataRequests` predicates that match the same URLs also passes (covers: FR-028; tag the spec as the core's amendment, ADR-004)
- [X] T012 Rebuild the core (`pnpm --filter related-web-core build`) and run `pnpm test:conformance` to confirm no core regression from T010
- [X] T013 [P] Write the test helpers: `packages/astro/tests/helpers/build-site.ts` (builds a small fixture Astro site into a temporary directory through Astro's programmatic build with the integration under test, returns the output path and captured errors; and a dev-server variant that starts and stops `astro dev` on a free port) and `packages/astro/tests/browser/fixtures.ts` (the core's Playwright fixtures: clear the origin-private store between tests)
- [X] T014 Write the traceability check `packages/astro/tests/trace/check-trace.ts` and the `test:astro-trace` script: read every FR and SC id from `specs/002-astro-adapter/spec.md`, collect `// covers:` tags from `packages/astro/tests`, and fail naming any id with no tagged passing test (FR-031)

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 1 - A site registers a graph and a page queries it (Priority: P1) 🎯 MVP

**Goal**: A registered graph is validated and published as a revision-named file and a descriptor, and a page asks for it, shows a placeholder, then the result.

**Independent Test**: Build the conformance site and open a page that asks for the registered graph; check the placeholder, the result, the descriptor and the data file.

### Verify first

- [X] T015 [US1] Verify V-1 (research R-2): in a throwaway fixture under `packages/astro/tests/verify/v1/`, check that an `injectRoute` entrypoint in a package (linked, then packed into a temporary project) can import a user source that imports `astro:content`, in `astro build` and in `astro dev`; record the result, and any needed workaround, in `specs/002-astro-adapter/research.md` under R-2
- [X] T016 [US1] Verify V-2 (research R-3): check that editing a file a source imports re-evaluates it in `astro dev` (Vite invalidation of the sources module on watcher events) and the descriptor's revision follows; record the result under R-3

### Tests for User Story 1 (write first, they must fail)

- [X] T017 [P] [US1] Unit tests for option parsing in `packages/astro/tests/unit/options.test.ts`: a graph name that breaks ADR-003's id rule, duplicate names, a lifetime or navigation value not listed, defaults (`page`, `multi-page`), a missing source file; each message names the entry (covers: FR-002, FR-004, FR-005, SC-006)
- [X] T018 [P] [US1] Unit tests for the canonical form and revision in `packages/astro/tests/unit/canonical.test.ts`: equal content in different key and node and link order gives one revision, a changed property gives another, array-valued properties keep their order, the revision is 12 hex digits (covers: FR-007, SC-002)
- [X] T019 [P] [US1] Build tests in `packages/astro/tests/build/registered.test.ts` using `build-site.ts`: the data file and descriptor exist at `/_related/<name>/…`, the descriptor's revision, counts, `data.url` and `indexes` match the document; a JSON file source is published the same way; an invalid document fails the build naming the path of the first problem; a non-root `base` appears in the descriptor and data URLs; a counting source is evaluated once per build; `output: "server"` is reported (covers: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, SC-006, SC-002)
- [X] T020 [P] [US1] Dev-server tests in `packages/astro/tests/build/dev.test.ts`: the files are served; editing the source changes the revision; a source that throws or returns an invalid document leaves the server running, prints the error with the path of the first problem, and answers the two files with an error status until the source is fixed (covers: FR-011)
- [X] T021 [US1] Playwright test `packages/astro/tests/browser/registered.spec.ts` in three browsers: `/page-1.html` of the conformance site renders its links and status placeholder before any script runs, then the status becomes `ready` and the count is `300`, and the created index exists and no other (query the engine's index listing through the client) (covers: US1 scenarios 3 and 7, FR-017, FR-024, SC-008)

### Implementation for User Story 1

- [X] T022 [US1] Implement `packages/astro/src/options.ts`: the option types, parsing, defaults and the configuration-time failures of `contracts/integration.md`
- [X] T023 [US1] Implement `packages/astro/src/sources.ts`: load a module or JSON source, memoized evaluation holding a result or an error, validation with `related-web-core/validate`, the canonical text (sorted keys, nodes by `id`, links by `(source, target, type)`, property arrays in order), the 12-hex revision and the ADR-003 descriptor builder (data URL under `BASE_URL`)
- [X] T024 [US1] Implement the injected route entrypoint `packages/astro/src/routes/files.ts`: `getStaticPaths` over the registered graphs returning `descriptor.json` and `graph.<revision>.json`, `GET` serving the canonical text with the right content type, and the `500` error answer for a failed evaluation (per `research.md` R-2, R-3)
- [X] T025 [US1] Implement the Vite plugin `packages/astro/src/plugin.ts`: `virtual:related-web/config` (names, descriptor URLs with base, lifetimes, profile), `virtual:related-web/sources` (server only), dev re-evaluation on change, `ssr.noExternal` for the package and `optimizeDeps.exclude` for the engine
- [X] T026 [US1] Implement the integration `packages/astro/src/index.ts`: `astro:config:setup` validates options and output setting, calls `injectRoute` for `/_related/[id]/[file]` with `prerender: true`, and registers the plugin
- [X] T027 [P] [US1] Write `packages/astro/src/types.d.ts` declaring the virtual modules and the exported types of the contracts
- [X] T028 [US1] Implement `packages/astro/src/client/registry.ts` and the first-load part of `packages/astro/src/client/index.ts` and `page.ts`: `onPage(setup)` runs setup once when the DOM is ready with a `page.graph(name)` that resolves a registered graph, creating the client with the core (`createSiteClient` for `visit`, `createClient` for `page`, passing the descriptor URL, the profile from the virtual config, the engine URL imported from `@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url`, and `store: true` when a descriptor exists)
- [X] T029 [US1] Add to the conformance site a registered graph `example` (source `src/graphs/example.ts`, lifetime `visit`, an index on `Page.id`) in `astro.config.mjs`, and the page `src/pages/page-1.astro` using `Base.astro` and a page script that asks for `example`, subscribes to the page count and fills the `data-gw-*` elements
- [X] T030 [US1] Run T017 to T021 and make them pass; mark them in this file

**Checkpoint**: A registered graph is published and a page queries it. This is the first usable slice.

---

## Phase 4: User Story 2 - A page carries its own small graph (Priority: P1)

**Goal**: A component writes a validated small graph into a page; the page asks for it by name and queries it.

**Independent Test**: Build a page with an inline graph, load it and query it; build pages with invalid inline graphs and see the build fail.

### Verify first

- [X] T031 [US2] Verify V-3 (research R-5): check that `GraphData.astro`, imported from the package under `node_modules` (linked, then packed), is compiled, which needs `vite.ssr.noExternal` for the package, in `astro build` and `astro dev`; record the result under R-5

### Tests for User Story 2

- [X] T032 [P] [US2] Unit tests in `packages/astro/tests/unit/graph-data.test.ts` (Astro's container API): the output is one `<script type="application/json" data-related-graph>`; `<`, `>`, `&`, U+2028 and U+2029 are escaped and a document containing `</script>` cannot close the element; `config.indexes` is carried (covers: FR-013, FR-015)
- [X] T033 [P] [US2] Build tests in `packages/astro/tests/build/inline.test.ts`: an invalid document or `config`, a duplicate name on a page, and a name that is also registered each fail the build naming the page and the problem; the same name on two different pages passes; a graph built from content entries produces one graph per page with no entry in the integration options (covers: FR-014, FR-015, SC-006)
- [X] T034 [US2] Playwright test `packages/astro/tests/browser/inline.spec.ts` in three browsers: an inline graph loads and answers a query with no descriptor or data request, an index named in `config` exists and no other, reloading replays from the page (no stored copy), and a page with two inline graphs gives independent clients (a trap in one leaves the other's generation and results) (covers: US2 scenarios 1, 6, 7, 8, FR-013, FR-015)

### Implementation for User Story 2

- [X] T035 [US2] Implement `packages/astro/src/GraphData.astro`: props `id`, `document`, `config`; validate with `related-web-core/validate` and the index shape; check duplicates per page (a map keyed by the request) and against the registered names (read through the plugin's config); render the escaped JSON script of `contracts/graph-data-component.md`
- [X] T036 [US2] Extend `packages/astro/src/client/registry.ts` to find inline graphs first (`script[data-related-graph]` of the current document), parse them, and create a `createClient` client with `{ document }` and the caller's indexes from `config`, always `page` lifetime and `store` off
- [X] T037 [US2] Add the site content for the conformance site: a small content collection `recipes` (`src/content.config.ts`, two entries), `src/pages/inline.astro` (one inline graph with `config.indexes`), `src/pages/recipes/[slug].astro` (a graph built from the entry), and `src/pages/two-graphs.astro` (two inline graphs)
- [X] T038 [US2] Run T032 to T034 and make them pass; mark them in this file

**Checkpoint**: Both ways of declaring a graph work.

---

## Phase 5: User Story 3 - A page's graph work follows its arrival and departure (Priority: P1)

**Goal**: Setup, cleanup, page-lifetime destruction and the selector follow the page under both profiles.

**Independent Test**: In the `client-routing` build, navigate by link, history and script; check no client, subscription or scoped data from a departed page remains.

### Verify first

- [X] T039 [US3] Verify V-4 (research R-6): record when `astro:page-load` fires on the first load with and without `ClientRouter`, that a bundled page script runs once per document, and the order of `astro:before-swap` and the next page's script; note the result under R-6
- [X] T040 [US3] Verify V-5 (research R-6): in Chromium, Firefox and WebKit, check the router's real view-transition path (a rendering page, no fallback override) keeps a module-state client across navigations; record under R-6 (closes the gap ADR-004 section 4 names)

### Tests for User Story 3

- [X] T041 [US3] Playwright test `packages/astro/tests/browser/lifecycle.spec.ts` in three browsers and both profiles: setup runs once on the first page with and without the router (not twice at the router's first page-load); arrival runs the next page's setup after the previous cleanup; a page-lifetime client is destroyed before the next page's setup runs, and on tab close, reload and a link to another document; asking twice for one name returns one client; scoped data is dropped on departure and added again on arrival; a selector keeps a setup off pages where it does not match and runs it once where it does (covers: US3 scenarios 1 to 4 and 7 to 9, FR-016, FR-018, FR-019, FR-020, SC-003)
- [X] T042 [US3] Playwright test `packages/astro/tests/browser/store.spec.ts` in three browsers under `multi-page` and `client-routing`: a registered page-lifetime graph with a descriptor restores from the store on the next page with a matching revision, and does not wait on the previous page's client for the store (the departing client is destroyed first) (covers: US3 scenario 5, FR-018, FR-019)
- [X] T043 [US3] Playwright test in `packages/astro/tests/browser/lifecycle.spec.ts` (same file, new case): a `visit` graph under `client-routing` keeps one worker, instance and generation across link, history and script navigation, including the router's view-transition path (covers: US3 scenario 6, FR-021, SC-004)

### Implementation for User Story 3

- [X] T044 [US3] Implement the full lifecycle in `packages/astro/src/client/page.ts`: first-load run once the DOM is ready, ignore the router's first `astro:page-load` for the document, run setups on later `astro:page-load`, run cleanups on `astro:before-swap` and `pagehide`, complete the departing page before the next setup, and the optional `selector` test
- [X] T045 [US3] Complete `packages/astro/src/client/registry.ts`: one client per (page, name) (same client on a second ask), track every page-lifetime client and `destroy()` it on departure, `store: true` for a registered page graph with a descriptor under either profile
- [X] T046 [US3] Add the pages `lifetime-a.astro` and `lifetime-b.astro` (a registered `page`-lifetime graph `small`), a scoped-data page and a page whose script registers a setup with a selector, to the conformance site and `astro.config.mjs`
- [X] T047 [US3] Run T041 to T043 and make them pass; mark them in this file

**Checkpoint**: The three P1 stories are complete: the MVP.

---

## Phase 6: User Story 4 - The profile is chosen explicitly and checked (Priority: P2)

**Goal**: `navigation` decides the core's profile, defaults to `multi-page`, can be overridden for testing, and a development warning flags a disagreement with the router.

**Independent Test**: Build and run sites with each combination of the option and the router; check the warning and the profile.

### Tests for User Story 4

- [X] T048 [P] [US4] Dev-server tests in `packages/astro/tests/build/profile.test.ts`: `client-routing` without the router and `multi-page` with it each print the warning, matching combinations print none, and a production build contains no warning code (covers: US4 scenarios 3, 4, 6, FR-026)
- [X] T049 [US4] Playwright test `packages/astro/tests/browser/profile.spec.ts` in three browsers: with no option the profile is `multi-page` and the site works with and without the router; `client-routing` with the router retains a `visit` graph; an override option changes only the core's profile, not the router (covers: US4 scenarios 1, 2, 5, FR-004, FR-023)

### Implementation for User Story 4

- [X] T050 [US4] Pass the profile from the virtual config to the core in `packages/astro/src/client/registry.ts` and add the `navigation` and `descriptor` options to both lookups (they change only the profile or the descriptor URL passed to the core)
- [X] T051 [US4] Add the development-only check in `packages/astro/src/client/index.ts` (`import.meta.env.DEV`): read the `astro-view-transitions-enabled` meta tag and warn on a disagreement with the configured profile
- [X] T052 [US4] Run T048 and T049 and make them pass; mark them in this file

**Checkpoint**: Profile choice is explicit, checked and overridable.

---

## Phase 7: User Story 5 - Visit-lifetime graphs outside a page's setup (Priority: P2)

**Goal**: The direct lookup returns visit-lifetime graphs and fails loudly for the rest.

**Independent Test**: Call the lookup for a visit graph, a page graph, an inline graph and an unknown name.

### Tests for User Story 5

- [X] T053 [P] [US5] Unit tests in `packages/astro/tests/unit/direct-lookup.test.ts`: an inline name and a page-lifetime name throw with a message naming the graph and saying to ask from page setup; an unknown name throws listing the registered names (covers: US5 scenarios 2 and 3, FR-022)
- [X] T054 [US5] Playwright test in `packages/astro/tests/browser/lifecycle.spec.ts` (new case, three browsers): the direct lookup returns the core's client for a `visit` graph; under `multi-page`, a second lookup on the same page returns the same client and starts one worker (covers: US5 scenario 1, FR-021, FR-022)

### Implementation for User Story 5

- [X] T055 [US5] Implement `graph(name, options?)` in `packages/astro/src/client/index.ts` over the registry, with the errors of `contracts/client-module.md`, and the per-page-and-name cache for `visit` graphs under `multi-page`
- [X] T056 [US5] Run T053 and T054 and make them pass; mark them in this file

**Checkpoint**: Both lookups behave as specified.

---

## Phase 8: User Story 6 - The adapter is checked against the shared conformance scenarios (Priority: P2)

**Goal**: The conformance site passes the core's runner in both profiles and three browsers, and the adapter's own behaviors are tested.

**Independent Test**: `pnpm test:astro-conformance` and `pnpm test:astro-browsers` pass.

### Implementation for User Story 6

- [X] T057 [US6] Complete the runner's pages in the conformance site: `index.astro`, `page-2.astro`, `notes.astro` (the scoped overlay `Note` data of the core's example, through `attachView`), `broken.astro`, `blank.astro` (no graph), and a shared page script that fills the `data-gw-*` elements, reads `navigation` and `variant` from the query string, applies `{ navigation }` to the lookup (C-09), and selects variants (below)
- [X] T058 [US6] Add the static variant files for D-1: `packages/astro/conformance-site/public/` holds variant `b` (400 pages, descriptor `id` `example`, a different revision), `mismatch` (counts that disagree) and `broken` (a data URL that does not exist), generated by `packages/astro/conformance-site/make-variants.ts` (run once and committed, as the core's `make-example.ts`); the page script passes their URLs through the `descriptor` option for those variants only
- [X] T059 [US6] Write `packages/astro/tests/browser/conformance.spec.ts`: for each profile and browser run `runConformance` from `related-web-core/conformance` against the matching preview server with `dataRequests` predicates matching the integration's `/_related/example/graph.` URLs for variant `a` and `/graph-b.json` for variant `b` (covers: FR-027, FR-028, SC-004, SC-005)
- [X] T060 [US6] Run the conformance spec and fix adapter or site failures until every scenario passes for both profiles in Chromium, Firefox and WebKit
- [X] T061 [US6] Write `packages/astro/tests/browser/adapter.spec.ts` with the adapter-only checks of FR-029 not yet covered by T041 to T054: destruction on departure and the store free for the next page (reference the cases), `graph()` rejections, and the three duplicate and invalid-document build failures (reference `tests/build`); each failing check names its scenario and browser (covers: FR-029, US6 scenario 4)
- [X] T062 [US6] Run `pnpm test:astro-browsers` and `pnpm test:astro-conformance` and record the pass counts in `specs/002-astro-adapter/research.md` (single run, one environment)

**Checkpoint**: The conformance gate holds.

---

## Phase 9: User Story 7 - A published package installs and works in a clean project (Priority: P3)

**Goal**: The packed adapter and core work in a clean Astro 7 project outside the repository.

**Independent Test**: `pnpm test:astro-package`.

### Verify first

- [ ] T063 [US7] Verify V-6 (research R-7): the dev server in a project that installed the packed packages serves the engine binary and the worker; record under R-7

### Tests and implementation for User Story 7

- [ ] T064 [US7] Write `packages/astro/tests/package/clean-install.test.ts` in the style of `packages/core/tests/package/clean-install.test.ts`: build and pack the adapter and the core, create a temporary directory outside the repository (assert it is), install both tarballs, the engine and `astro` there as a user would, add a registered graph and a page that queries it, `astro build`, serve it, and in Chromium check the query returns a result and the binary is placed by the bundler with no workaround; assert no path in the install refers to the repository (covers: FR-030, SC-007)
- [ ] T065 [US7] Fix anything the test finds in `packages/astro/package.json` (`files`, exports, peer ranges) or the `.astro` component's resolution; run `pnpm test:astro-package`

**Checkpoint**: The package works as published.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T066 [P] Write `packages/astro/README.md`: install, the integration options, the two ways to declare a graph, lifetimes, `onPage` with `selector`, the direct lookup, the placeholder-first rule for wrappers in UI frameworks, the testing-aid options, and supported Astro and browsers (labeled as tested)
- [ ] T067 Record the load figures for an inline graph and a registered graph of the same document at 20, 300 and 2,000 nodes in `specs/002-astro-adapter/research.md` (method, environment, single-run figures, labeled as such), as the evidence for the size at which an inline graph should be registered instead (constitution V); do not set a threshold
- [ ] T068 [P] Update `CLAUDE.md` (project state, commands, layout) and `design/adr/README.md` / `RFC-001` ADR lists if the amendment changed them; mention the adapter's package name and commands
- [ ] T069 Run the full set (`pnpm test:astro`, `test:astro-browsers`, `test:astro-conformance`, `test:astro-package`, `test:astro-trace`, and the core's `test:unit`, `test:browsers`, `test:conformance` after T010) and fix what fails; the trace check must report no untagged FR or SC
- [ ] T070 Update `specs/002-astro-adapter/spec.md` status to `Implemented` and `checklists/requirements.md` if any item changed; commit with the ADR number (ADR-004) in the message

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. T010 and T011 (core runner parameters) must finish before T059.
- US1 (Phase 3) before US2 (Phase 4) before US3 (Phase 5): the client files are shared and extended in that order. US4, US5 and US6 follow US3. US7 can follow US1 and US2 but is placed last because it packs everything.
- Within a story: Verify, then tests (fail), then implementation, then the "run and make them pass" task.
- Verify tasks gate the code that depends on them: T015, T016 before T022 to T026; T031 before T035; T039, T040 before T044.

## Parallel opportunities

- Phase 1: T002, T003, T004. Phase 2: T008, T009, T013, T014 once T007 exists.
- Phase 3 tests T017 to T020 are independent files. Phase 4 tests T032 and T033. Phase 6 T048. Phase 7 T053.
- Different stories' browser specs can be written in parallel (different files); the shared client files (`registry.ts`, `page.ts`, `index.ts`) are edited in story order, not in parallel.

## Implementation strategy

- **MVP**: Phases 1 to 5 (US1, US2, US3). It delivers both declaration routes and a lifecycle-correct client under both profiles.
- **Then**: US4 and US5 (small), US6 (the release gate), US7 (the package gate), then polish.
- **Stop rule**: if a Verify task contradicts `research.md`, stop and amend the plan (and ADR-004 if the decision changes) before writing the dependent code (constitution I).
