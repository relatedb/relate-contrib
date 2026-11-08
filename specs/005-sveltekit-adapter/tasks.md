---
description: "Task list for the @relate/sveltekit adapter"
---

# Tasks: SvelteKit Adapter for Embedding the Graph Database in SvelteKit Sites

**Input**: Design documents from `/specs/005-sveltekit-adapter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-007 (accepted; reviewed and amended 2026-11-08) and builds on ADR-001 to ADR-006. Planning decisions D-1 to D-6 are in research.md; D-1 and D-3 are applied to ADR-007 §6.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers: FR-…, SC-…` comment; `test:sveltekit-trace` fails for any untagged requirement (FR-034).

**Organization**: Tasks are grouped by user story. US1 to US3 are P1 and together are the MVP; they run in order because each extends the registry and helpers the one before starts. The conformance site's shell is created in Phase 2 and each story adds the pages it needs. The registry, inline lookup and location builder are plain JavaScript (research D-4), so their unit tests run in Node.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US8) from spec.md
- Paths are relative to the repository root; `packages/sveltekit` is the package of the plan. Fixtures from the planning checks are in `specs/005-sveltekit-adapter/verify/` and are the starting point for the matching tasks.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- Rune modules are `.svelte.js` with JSDoc and a `.d.ts` beside each; components are `.svelte` (research D-1). Never write `.svelte.ts` in the package.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package, tooling, scripts

- [X] T001 Create `packages/sveltekit/package.json`: name `@relate/sveltekit`, `type: module`, `private: true`, `sideEffects: false`, `files` listing `src` and `dist` only (the conformance site is not published), exports `.` (conditions `svelte` and `default` pointing at `./src/index.js`, `types` at `./src/index.d.ts`) and `./server` (types and default under `dist/server`), peer dependencies `@sveltejs/kit ^3`, `svelte ^5`, `@relate/web`, `@relate/relate-wasm`; dev dependencies `@playwright/test`, `@sveltejs/adapter-node`, `@sveltejs/adapter-static`, `@sveltejs/kit`, `@sveltejs/vite-plugin-svelte`, `svelte`, `vite`, `@types/node`, `@relate/web` (`workspace:*`), `tsx`, `typescript`, `vitest`; scripts `build`, `typecheck`, `test:sveltekit`, `test:sveltekit-browsers`, `test:sveltekit-conformance`, `test:sveltekit-package`, `test:sveltekit-trace` as the Next package names them (FR-001, FR-002)
- [X] T002 [P] Create `packages/sveltekit/tsconfig.json` (strict, ES2022, declaration files, `outDir` `dist`, `rootDir` `src`, includes `src/server/**/*.ts` only; the Svelte and JavaScript sources are not compiled by `tsc`)
- [X] T003 [P] Create `packages/sveltekit/vitest.config.ts` for `tests/unit` and `tests/build` (with `@sveltejs/vite-plugin-svelte` so unit tests can render components with `svelte/server`), and `packages/sveltekit/vitest.package.config.ts` for `tests/package`
- [X] T004 [P] Create `packages/sveltekit/playwright.config.ts`: projects `chromium`, `firefox`, `webkit`; web servers that build `conformance-site` into one directory per build and serve it, as in the table of `contracts/conformance-site.md`: `client-routing-static`, `multi-page-static`, `client-routing-node`, `multi-page-node`, `base-path-static`, each on its own port, plus the development server; tags `@conformance` and `@figures` as in the Next config
- [X] T005 Add to the root `package.json` the scripts `test:sveltekit`, `test:sveltekit-browsers`, `test:sveltekit-conformance`, `test:sveltekit-package` and `test:sveltekit-trace` (each `pnpm --filter @relate/sveltekit …`), per `quickstart.md`
- [X] T006 Add `packages/sveltekit/conformance-site` to `pnpm-workspace.yaml`, create its `package.json` (private; `@relate/sveltekit` and `@relate/web` by `workspace:*`, `@relate/relate-wasm: "*"`, the SvelteKit, Svelte, Vite and adapter dev dependencies), run `pnpm install`, and run `pnpm --filter @relate/web build`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Test helpers, the traceability check, the scope guard, the conformance site's shell

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T007 [P] Write the browser fixtures `packages/sveltekit/tests/browser/fixtures.ts`: Playwright's `test` with WebKit in a persistent context (the origin-private file system is unavailable in its ephemeral context), the origin-private root emptied before and after each WebKit test for every build's origin, a counter of worker creations and terminations, and a check that fails on a hydration warning in the console
- [X] T008 [P] Write the build-test helper `packages/sveltekit/tests/helpers/build-site.ts`: copies a small fixture app into `packages/sveltekit/.tmp/<name>` inside the workspace (linked packages as in the conformance site), runs `vite build` with `ADAPTER`, `BASE`, `OUT` and fixture-specific environment values, returns the output path, exit status and captured output
- [X] T009 Write the traceability check `packages/sveltekit/tests/trace/check-trace.ts` as the Observable package's (with the `TRACE_SPEC` override), reading ids from `specs/005-sveltekit-adapter/spec.md` and the reports `vitest.json`, `package.json`, `playwright.json` and `conformance.json` (FR-034)
- [X] T010 [P] Scope guard test `packages/sveltekit/tests/unit/scope.test.ts` (covers FR-033, FR-003): no file under `packages/web/src`, `packages/astro/src`, `packages/nextjs/src` or `packages/observable/src` differs between commit `1994c3c` (the plan) and the working tree; the package's `src` imports no `.wasm` file and no Vite plugin; `src/server` imports no `$app`, `$env`, `$lib` or `.svelte` module
- [X] T011 Create the conformance site shell in `packages/sveltekit/conformance-site/`: `vite.config.js` (`ADAPTER=static|node`, `BASE`, `OUT`, `PORT`, `server.host` `127.0.0.1`, `server.fs.allow` for the repository root; configuration passed to the `sveltekit({ … })` plugin as SvelteKit 3 requires), `package.json` `imports` for `#lib/*`, `tsconfig.json` extending `$app/tsconfig`, `src/app.html` (`data-sveltekit-preload-data="false"`), `src/hooks.server.ts` (`NAVIGATION=multi-page` adds `data-sveltekit-reload` to the body with `transformPageChunk`), `src/routes/+layout.ts` (`prerender = true`), `serve.mjs` (from `specs`' `design/spikes/SPIKE-007-sveltekit-embedding/serve.mjs`: page files win over route folders, base stripped), `make-variants.ts` (writes `static/` variants `b`, `mismatch` and `broken` as the Next site does) (FR-028)

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 1 - A site registers a graph and a component queries it (Priority: P1) 🎯 MVP

**Goal**: A registered graph is validated and published as a revision-named file and a descriptor, and a component asks for it, shows a placeholder, then the result.

**Independent Test**: Build the conformance site and open a page that asks for the registered graph; check the placeholder in the server markup, no hydration warning, then the result, the descriptor and the data file.

### Tests for User Story 1 (write first, they must fail)

- [X] T012 [P] [US1] Unit tests in `packages/sveltekit/tests/unit/graphs.test.ts` (covers FR-004, FR-012, scenario 9): an id that breaks ADR-003's id rule, duplicate ids, a lifetime not listed, a source that is not a function, malformed indexes, each failing with a message that names the graph and the problem
- [X] T013 [P] [US1] Unit tests in `packages/sveltekit/tests/unit/route.test.ts` (covers FR-005, FR-006, FR-007, FR-008, FR-009, FR-010): `entries()` lists a descriptor and a revision-named data file per graph; evaluating twice, it fails naming the graph for a source whose output changes; `GET` answers an unlisted id, a stale revision and a path without `/relate/` as 404; the descriptor's data location carries the base derived from the request URL, with and without a base; the revision equals `revisionOf` of the canonical text and does not depend on key or item order; in development (`NODE_ENV` development) each `GET` evaluates the source
- [X] T014 [P] [US1] Unit tests in `packages/sveltekit/tests/unit/catalog.test.ts` (covers FR-011): the catalog is plain data (`JSON.stringify` round trip equals input) with ids, lifetimes and indexes and no locations
- [X] T015 [P] [US1] Unit tests in `packages/sveltekit/tests/unit/locations.test.ts` (covers FR-024): the location builder calls `resolve()` with `/relate/<id>/descriptor.json` and returns what it returns (a stubbed `$app/paths`)
- [X] T016 [P] [US1] Build tests in `packages/sveltekit/tests/build/registered.test.ts` using `build-site.ts`, for `adapter-static` and `adapter-node` and with `BASE=/docs` (covers FR-005, FR-006, FR-008, FR-009, FR-010, FR-012, SC-002, SC-006, scenarios 1 to 6, 8, 9): the data file and descriptor exist under `relate/<id>/`, the descriptor's revision is the data file's, its counts and indexes are the document's and its data location carries the base; two builds give one revision; a changed property gives another; a source that throws, a source that is not deterministic, an invalid document and a duplicate id each fail the build (exit 1) naming the graph and the first problem; the Node output serves the files (200), another revision and another id answer 404, in research V-4 and V-5's forms
- [X] T017 [US1] Playwright test `packages/sveltekit/tests/browser/registered.spec.ts` in three browsers, both outputs (covers FR-017, FR-026, FR-016, SC-001, SC-008, scenarios 2, 7, 10): `/page-1` of the conformance site renders its links and status placeholder in the server markup, reports no hydration warning, then shows the result; the descriptor and the data file are published and anything undeclared is 404; the index named in the declaration is the only index (`SHOW INDEXES`); the binary and the worker load from the site's own files in the production builds and in `vite dev`

### Implementation for User Story 1

- [X] T018 [US1] Implement `packages/sveltekit/src/server/graphs.ts`: the declaration check (id rule through the core's descriptor validator, duplicates, lifetime values, indexes), and a per-call evaluation of a source through `@relate/web/build`'s `evaluate` (FR-004, FR-012)
- [X] T019 [US1] Implement `packages/sveltekit/src/server/route.ts` from `specs/005-sveltekit-adapter/verify/app/src/lib/route.ts`: `createGraphRoute(graphs)` returns `entries` (two independent evaluations per graph, failing on a difference; the two names per graph) and `GET` (base from the request; descriptor and revision-named data file; 404 for anything unlisted; development evaluates on each call); the development switch reads `process.env.NODE_ENV`, not `$app/environment` (FR-005 to FR-010)
- [X] T020 [P] [US1] Implement `packages/sveltekit/src/server/catalog.ts` and `src/server/index.ts` (re-exports `createGraphRoute`, `catalog`, types) (FR-011)
- [X] T021 [P] [US1] Implement `packages/sveltekit/src/context.js` (context keys and accessors for the catalog, engine URL, navigation and the per-render id record) and `src/locations.js` (`descriptorLocation(id)` using `resolve` from `$app/paths`) (FR-016, FR-024)
- [X] T022 [US1] Implement `packages/sveltekit/src/registry.js` for what US1 needs: browser-only visit clients by id (module state, `createClient` under `client-routing` and `createSiteClient` under `multi-page` as ADR-004 §6 records) and the acquire call a holder makes (FR-019, FR-022); later stories extend it
- [X] T023 [US1] Implement `packages/sveltekit/src/use-graph.svelte.js` (`useGraph`, `useQuery`: reactive `client` and `status`, `rows`, `error`, `generation`; `null` and `idle` on the server and until mounted; acquire in `onMount`, release in its cleanup) and `src/RelateProvider.svelte` (props `catalog`, `engineUrl`, `navigation`; context only; creates nothing), `src/index.js` and `src/index.d.ts`, `src/use-graph.svelte.d.ts` (FR-016, FR-017, FR-026, FR-027)
- [X] T024 [US1] Add to the conformance site: `src/lib/graphs.ts` (the shared graph `example`, 300 `Page` nodes with five links each as the Next site's, lifetime `visit`, an index on `Page.id`; a small graph for the page and inline pages), the route file `src/routes/relate/[id]/[file]/+server.ts` (four lines of ADR-007 §2.2), `src/routes/+layout.server.ts` (the catalog), `src/routes/+layout.svelte` (the provider, with the engine's `?url` import) and `src/lib/RelPage.svelte` plus the pages `page-1`, `page-2`, `blank` and `broken` that reproduce the `data-rel-*` markup of `packages/web/conformance/example-site/rel-page.ts` using only `@relate/sveltekit` (FR-028)
- [X] T025 [US1] Settle research V-9 for the adapter's own source: build the conformance site (static) with the adapter linked from `packages/sveltekit`; if the site's build compiles it, record that in `research.md`; if not, switch the site's `package.json` to pnpm injected dependencies (`dependenciesMeta`), add `conformance-site/scripts/refresh-deps.mjs` (as the Observable site's) and record the form that works as research D-7
- [X] T026 [US1] Run T012 to T017 and make them pass; mark them in this file

**Checkpoint**: A registered graph is published and a component queries it. This is the first usable slice.

---

## Phase 4: User Story 2 - A page carries its own small graph (Priority: P1)

**Goal**: A component writes a validated small graph into a page; a helper asks for it by id and queries it.

**Independent Test**: Build pages with an inline graph, load them, navigate between them and query; build pages with invalid inline graphs and see the render fail.

### Tests for User Story 2

- [X] T027 [P] [US2] Unit tests in `packages/sveltekit/tests/unit/graph-data.test.ts` rendering the component with `svelte/server` and a provider context (covers FR-013, FR-014, FR-015, scenarios 3 to 8): the output is one `<script type="application/json" data-relate-graph>`; `<`, `>`, `&`, U+2028 and U+2029 are escaped and the text parses back to the document; `config` indexes appear and without a `config` none do; an invalid document or `config`, an id used twice in one render and an id also registered each throw naming the page and the problem; two separate renders with the same id do not collide (the record is per render)
- [X] T028 [P] [US2] Unit tests in `packages/sveltekit/tests/unit/inline-lookup.test.ts` (covers FR-018, FR-021): with a stubbed `document`, the lookup takes the only match; with several it takes the first whose parent is visible (`checkVisibility()` stubbed); an id in neither the document nor the catalog fails naming it and listing the registered ids; an inline id wins over a registered one
- [X] T029 [P] [US2] Build tests in `packages/sveltekit/tests/build/inline.test.ts` (covers FR-014, SC-006, scenarios 3 to 5): fixture pages with an invalid document, a duplicate id in one render and an id also registered each fail the build (exit 1) naming the page and the problem
- [X] T030 [US2] Playwright test `packages/sveltekit/tests/browser/inline.spec.ts` in three browsers, both outputs (covers FR-013, FR-015, FR-021, SC-003, scenarios 1, 2, 7 to 11): an inline graph loads and answers a query with no descriptor or data request; an index named in `config` is created before the nodes and none otherwise; the document with `</script>`, `<!--` and `&` equals what was written; a reload replays it; navigating `inline-a` to `inline-b` by link and back leaves one inline element and each page queries its own content; two inline graphs on one page are independent clients; the element stays in the document after hydration (research V-3)

### Implementation for User Story 2

- [X] T031 [US2] Implement `packages/sveltekit/src/GraphData.svelte`: props `id`, `document`, `config`, `page`; validation with `checkInline` from `@relate/web/build` on both sides; the same `{@html}` element with `escapeJson` on both sides (research D-3); the per-render id record and the registered ids from the provider's context; failure messages naming the page (FR-013, FR-014)
- [X] T032 [US2] Implement `packages/sveltekit/src/inline.js` (find an inline graph by id: the only match, else the first whose parent is visible; parse; the `config`) and extend `registry.js` and `use-graph.svelte.js`: an inline graph is looked up before the registered graphs, created with no store, keyed by id and element (FR-018, FR-021)
- [X] T033 [US2] Add to the conformance site the pages `inline-a` (an inline graph with `config` indexes) and `inline-b` (another document with the same id and no `config`, whose text holds `</script>`, `<!--` and `&`), and `two-graphs` (two inline graphs with different ids); run T027 to T030 and make them pass

---

## Phase 5: User Story 3 - A graph's lifetime follows the components that use it (Priority: P1)

**Goal**: Visit graphs persist; registered page graphs are shared and destroyed one task after the last holder, so consecutive pages keep them; nothing is created or counted on the server.

**Independent Test**: Navigate among the conformance pages by link, script and history, under both profiles and both outputs, and check for leftover clients, subscriptions and data.

### Tests for User Story 3

- [X] T034 [P] [US3] Unit tests in `packages/sveltekit/tests/unit/registry.test.ts` with a stub client and fake timers (covers FR-019, FR-020, FR-021, FR-022, scenarios 1, 2, 3, 9): two holders share one client; the client is destroyed one task after the last release and not before; an acquire before that task cancels the destroy and keeps the client (consecutive pages); a visit graph is created once per id and never destroyed; an inline graph keyed by a different element is a different client; changing a holder's id releases the old graph and acquires the new; nothing is created when no `window` exists (the server)
- [X] T035 [US3] Playwright test `packages/sveltekit/tests/browser/lifecycle.spec.ts` in three browsers, both outputs and both profiles (covers FR-019, FR-020, FR-022, SC-003, SC-004, scenarios 1 to 9): two holders on one page share a client; leaving `lifetime-a` for a page that does not use the graph destroys its client within a task; `lifetime-a` to `lifetime-b` (the same registered page graph) keeps the client (same instance, one worker); `lifetime-b` to `lifetime-c` (a different one) destroys the first and the second opens its own stored copy; a visit graph keeps one worker and one generation across link clicks, `goto` and history; closing, reloading or following a link that loads a document leaves no worker; subscriptions and scoped data are dropped on departure and made again on arrival; a holder whose id changes switches graphs; the server markup of every page shows no client, worker or count (the placeholder only)

### Implementation for User Story 3

- [X] T036 [US3] Extend `packages/sveltekit/src/registry.js`: registered page graphs shared by holders with a count, created with `createClient` and the stored copy when there is a descriptor, destroyed one task after the count reaches zero with the destroy cancelled by a new acquire; inline graphs by the same rule; all module state touched only after mount (FR-020, FR-022)
- [X] T037 [US3] Extend `packages/sveltekit/src/use-graph.svelte.js`: acquire in `onMount` and release in its cleanup, acquire again when the id changes (an `$effect` only for that), never count in `onDestroy` (FR-022)
- [X] T038 [US3] Add to the conformance site `lifetime-a`, `lifetime-b` (both use the registered page graph `lifetime`) and `lifetime-c` (uses `lifetime-other`), declare both in `lib/graphs.ts`, and a script hook `window.__goto` for navigation by script; run T034 and T035 and make them pass

**Checkpoint**: Lifetimes follow components and pages, and consecutive pages keep a shared graph. The P1 slices are complete.

---

## Phase 6: User Story 4 - The profile, base path and engine location are supplied once (Priority: P2)

**Goal**: The provider supplies the catalog, the engine URL and the profile; every location carries the base path.

**Independent Test**: Build the conformance site for each profile with and without a base path, and check the core's profile and where the descriptor is requested.

### Tests for User Story 4

- [X] T039 [P] [US4] Unit tests in `packages/sveltekit/tests/unit/options.test.ts` (covers FR-025, scenarios 4 and 5): `navigation` and `descriptor` options change only the profile, or only the descriptor location, passed to the core client (a stubbed `createClient`); the default profile is `client-routing`
- [X] T040 [US4] Playwright test `packages/sveltekit/tests/browser/profile.spec.ts` in three browsers (covers FR-016, FR-024, FR-025, scenarios 1 to 7): with no setting the profile is `client-routing`; `multi-page` with the body attribute is passed to the core and the site works; under `base-path-static` every descriptor request includes `/docs` in the browser, the engine URL passed to the provider reaches the core unchanged, and the provider creates no client and starts no worker on the root layout alone (the `blank` page)

### Implementation for User Story 4

- [X] T041 [US4] Implement the options in `packages/sveltekit/src/use-graph.svelte.js` and `src/registry.js` (`options.navigation`, `options.descriptor`) and make the provider's `navigation` default `client-routing`; document both as testing aids in `src/index.d.ts` (FR-016, FR-025); run T039 and T040 and make them pass

---

## Phase 7: User Story 5 - Visit-lifetime graphs outside a component (Priority: P2)

**Goal**: A direct lookup returns a visit graph's client and fails loudly for anything else.

**Independent Test**: Call the direct lookup for a visit graph, a page graph and an inline graph.

- [X] T042 [P] [US5] Unit tests in `packages/sveltekit/tests/unit/direct.test.ts` (covers FR-023, scenarios 1 to 3): `graph(id)` returns the client for a visit graph and the same client on a second call; it throws naming the graph for a page-lifetime id and for an inline id, saying to ask from a component; it throws for an unknown id naming it and listing the registered ids
- [X] T043 [US5] Implement `graph(id, options?)` in `packages/sveltekit/src/use-graph.svelte.js`; add the page `direct` to the conformance site and a Playwright test `packages/sveltekit/tests/browser/direct.spec.ts` in three browsers (covers FR-023): the three outcomes in a browser after the provider has mounted; run T042 and T043 and make them pass

---

## Phase 8: User Story 6 - The adapter is checked against the shared conformance scenarios (Priority: P2)

**Goal**: The core's conformance runner passes against the SvelteKit site in three browsers for both profiles and both outputs.

**Independent Test**: Run the conformance command and the adapter tests; both pass in all three browsers.

### Tests for User Story 6

- [X] T044 [P] [US6] Playwright test `packages/sveltekit/tests/browser/conformance.spec.ts` tagged `@conformance` (covers FR-028, FR-029, SC-005): `runConformance` from `@relate/web/conformance` for each profile and output in each browser against the five builds, with `dataRequests` matching the revision-named data files and the variants `b`, `mismatch` and `broken` selected by the descriptor override as in `packages/nextjs/tests/browser/conformance.spec.ts`; fail on a report with any failure naming the scenario and the browser
- [X] T045 [P] [US6] Playwright test `packages/sveltekit/tests/browser/hydration.spec.ts` in three browsers (covers FR-017, FR-026, SC-008): the server markup of every conformance page holds the placeholder; no hydration warning in the console in production or `vite dev`; the page's text and links work while the instance is loading, recovering (after the trap) and failed (the `broken` page)

### Implementation for User Story 6

- [X] T046 [US6] Add to the conformance site the pages `index` (home), `notes` and the remaining `data-rel-*` behavior in `src/lib/RelPage.svelte` (status, generation, profile, instance, restored, count, updates, failure, last error, notes, `trap` and `timeout` actions, `data-rel-state` on the root, the `variant` and `navigation` query values) and the variants in `static/` (run `make-variants.ts`) (FR-028)
- [X] T047 [US6] Run T044 and T045 and make them pass in all three browsers; where a scenario fails, fix the site or the adapter, and record anything the runner assumes that this framework cannot meet in `research.md`

**Checkpoint**: The adapter passes the shared conformance check.

---

## Phase 9: User Story 7 - A packed package installs and works in a clean project (Priority: P3)

**Goal**: The adapter, core and engine, packed as published, install into a clean SvelteKit 3 project outside the repository, which builds with each output and runs a page.

**Independent Test**: Run the package test; the clean project builds and a loaded page returns a query result.

- [X] T048 [US7] Package test `packages/sveltekit/tests/package/clean-install.test.ts` (covers FR-001, FR-002, FR-031, SC-007, scenarios 1 to 4): pack `@relate/sveltekit`, `@relate/web` and the engine (from `vendor/relate-wasm/pkg`); in a temporary directory outside the repository create a SvelteKit 3 project, install the three tarballs with SvelteKit, Svelte, Vite and both adapters; write a declaration module, the route file, the layout load, the provider and a page with a registered graph and an inline graph; build with the static output and with the Node output; serve each and load the page in Chromium; assert both counts, the binary and the worker placed with no workaround, the packed manifest's peers (`@sveltejs/kit`, `svelte`, `@relate/web`, `@relate/relate-wasm`) and no runtime dependency, no file mentioning the repository's layout, and that the package's Svelte source and rune module were compiled by the site (the helpers work); also start `vite dev` in the project and load the page (research V-2); record the result for ADR-007 §6

---

## Phase 10: User Story 8 - Open items are checked and the decision is amended (Priority: P2)

**Goal**: ADR-007 §6 states what the implementation found.

- [X] T049 [US8] Development-server tests in `packages/sveltekit/tests/build/dev.test.ts` (covers FR-006, FR-032, scenario 3): under `vite dev` the files are served, editing a source changes the descriptor's revision and serves the new data file, a request for the old revision answers 404, a source that throws answers an error status, and an unknown id answers 404; record the outcome
- [X] T050 [US8] On-demand and reload checks in `packages/sveltekit/tests/browser/on-demand.spec.ts` (covers FR-032, scenarios 4 and 6): a page rendered on demand by the Node output hydrates a holder with no warning in three browsers; with `data-sveltekit-reload` on the body every link loads a document and an inline element is found; record whether the client leaves the server-written inline element alone on hydration (the element stays: research V-3) and the page's size with an inline graph (the document in the page twice), as single runs
- [X] T051 [US8] Compare each planning check (V-1 to V-9) with what the implementation tests showed. Amend `design/adr/ADR-007-sveltekit-adapter.md` §6 with a dated entry for each item in §4 that implementation checked (the endpoint under the Node output, a throwing source, the development server, hydration on demand, the `$app/paths` import, `data-sveltekit-reload`, the packed install, the inline element on hydration) and for RFC-001 §7.5 (settled: static and Node output; edge and serverless open); update `design/adr/README.md` if the status line changes (covers FR-032, SC-009, scenarios 1 to 8)

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T052 [P] Write `packages/sveltekit/README.md`: use in five steps (declaration module, route file, layout load, provider with the catalog and the engine's `?url` import, a component with `useQuery`), lifetimes, the placeholder-first rule, inline graphs and their doubled bytes, the base path, outputs, the SvelteKit 3 and Svelte 5 requirement, the workspace note (`server.fs.allow`), and the unmeasured costs
- [X] T053 [P] Update `CLAUDE.md` "Project state" and the Commands list with the SvelteKit package and its scripts, and the planning list of integrations (SvelteKit done)
- [X] T054 Run the full suite: `pnpm -r build`, `pnpm test:unit`, `pnpm test:browsers`, `pnpm test:conformance`, `pnpm test:package`, `pnpm test:trace`, then every `test:astro-*`, `test:next-*`, `test:observable-*` and `test:sveltekit-*` script; first check no leftover server holds a test port; note any flake in `research.md` (run once; the one failure, a core Firefox test of the stored copy, passed on three reruns and in a second full browser run)
- [X] T055 Run `pnpm test:sveltekit-trace` and make it report every FR and SC covered by a passing tagged test (FR-034); mark `spec.md` status Implemented and re-check `checklists/requirements.md`
- [X] T056 Run `quickstart.md` start to finish and fix any step that does not work as written (its commands ran as the suite above; the clean-install test covers the by-hand steps in a project outside the repository; not run on a clean checkout)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. Within Phase 2: T007 to T010 are independent of each other; T011 needs T006.
- US1 → US2 → US3 (the P1 chain; each extends `registry.js` and `use-graph.svelte.js`). T025 (does the adapter's linked source compile in the site) needs T023 and T024 and gates every browser task after it.
- US4 and US5 need US1 to US3. US6 needs US1 to US5 (all conformance pages). US7 needs the final `package.json` and exports. US8's T049 and T050 need US1 to US3 and the conformance site; T051 needs everything else.
- Polish after everything.

## Parallel Opportunities

- Phase 1: T002, T003, T004 together.
- Phase 2: T007, T008, T010 together.
- Within each story, the [P] unit and build tests on different files together; implementation tasks on `server/` and the Svelte and JavaScript modules that do not share files (for example T020 and T021) together.
- US4, US5 and US7's drafting can overlap once US3 is complete; they touch different test files.

## Implementation Strategy

- **MVP**: Phases 1 to 5 (US1 to US3): publish a registered graph, carry an inline graph, tie lifetimes to components. Stop and run the conformance subset (T017, T030, T035) before going on.
- **Incremental**: add US4 and US5 (small), then the conformance runner (US6), then the package test (US7), then the open-item checks and the ADR amendment (US8). Merge to `main` only when everything is done and the user agrees.
- The first task that tests an assumption of the plan is T025 (does the adapter's linked Svelte source compile in the workspace site); if not, the fallback is written there. Every check that differs from `research.md` stops work: amend ADR-007 §6, then continue.

## Requirement Coverage

| Requirements | Tasks |
|---|---|
| FR-001, FR-002 | T001, T010, T048 |
| FR-003 | T010, T048 |
| FR-004, FR-012 | T012, T016, T018 |
| FR-005 to FR-010 | T013, T016, T019 |
| FR-011 | T014, T020 |
| FR-013, FR-014, FR-015 | T027, T029, T030, T031 |
| FR-016 | T017, T021, T040, T023 |
| FR-017, FR-026, FR-027 | T017, T023, T045 |
| FR-018, FR-021 | T028, T030, T032, T034 |
| FR-019, FR-020, FR-022 | T034, T035, T036, T037 |
| FR-023 | T042, T043 |
| FR-024 | T015, T021, T040 |
| FR-025 | T039, T040, T041 |
| FR-028, FR-029 | T011, T044, T046 |
| FR-030 | T013, T016, T029, T035, T027 (the named test groups) |
| FR-031 | T048 |
| FR-032 | T049, T050, T051 |
| FR-033 | T010 |
| FR-034 | T009, T055 |
| SC-001 | T017 |
| SC-002 | T016 |
| SC-003, SC-004 | T030, T035 |
| SC-005 | T044 |
| SC-006 | T016, T029 |
| SC-007 | T048 |
| SC-008 | T017, T045 |
| SC-009 | T051, T010 |
