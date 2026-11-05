---
description: "Task list for the @relate/web-next adapter"
---

# Tasks: Next.js Adapter for Embedding the Graph Database in Next.js Sites

**Input**: Design documents from `/specs/003-next-adapter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-005 (accepted, amended 2026-11-05) and builds on ADR-001 to ADR-004. Planning decisions D-1 (Web Crypto), D-2 (inline check and escaping move) and D-4 (inline lookup by visibility) are approved and recorded in ADR-005 §6.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers: FR-…, SC-…` comment; `test:next-trace` fails for any untagged requirement (FR-034).

**Organization**: Tasks are grouped by user story. US1 to US3 are P1 and together are the MVP; they run in order because US3 extends the client that US1 and US2 start. The shared build code moves into the core in Phase 2 because the server entry needs it. The conformance site is created in Phase 2 and each story adds the pages it needs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US9) from spec.md
- Paths are relative to the repository root; `packages/next` is the package of the plan. Fixtures from the planning checks are in `specs/003-next-adapter/verify/` and are the starting point for the matching tasks.
- Use `bash` for `.specify` scripts; they fail under `sh`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package, tooling, scripts

- [ ] T001 Create `packages/next/package.json`: name `@relate/web-next`, `type: module`, `private: true`, `files` listing `dist` only (the conformance site is not published), exports `.`, `./server` and `./client` (types and default under `dist`), peer dependencies `next ^16`, `react ^19`, `related-web-core`, `@neo4j-labs/cypherlite-wasm`; dev dependencies `@playwright/test`, `@types/node`, `@types/react`, `next`, `react`, `react-dom`, `related-web-core` (`workspace:*`), `tsx`, `typescript`, `vitest`; scripts `build`, `typecheck`, `test:next`, `test:next-browsers`, `test:next-conformance`, `test:next-package`, `test:next-trace` as the Astro package names them (FR-001)
- [ ] T002 [P] Create `packages/next/tsconfig.json` (strict, ES2022, JSX `react-jsx`, declaration files, `outDir` `dist`, includes `src/**/*.ts` and `src/**/*.tsx`)
- [ ] T003 [P] Create `packages/next/vitest.config.ts` for `tests/unit` and `tests/build`, and `packages/next/vitest.package.config.ts` for `tests/package`
- [ ] T004 [P] Create `packages/next/playwright.config.ts`: projects `chromium`, `firefox`, `webkit`; web servers that build `conformance-site` with `NAVIGATION=multi-page` and `NAVIGATION=client-routing`, each as a production server (`next start`) and as an export served as static files (`EXPORT=1`), each into its own output directory; one more server with `CACHE_COMPONENTS=1`; tags `@conformance` and `@figures` as in the Astro config
- [ ] T005 Add to the root `package.json` the scripts `test:next`, `test:next-browsers`, `test:next-conformance`, `test:next-package` and `test:next-trace` (each `pnpm --filter @relate/web-next …`), per `quickstart.md`
- [ ] T006 Run `pnpm install`, confirm `next` 16.4.x and `related-web-core` resolve for `packages/next`, and run `pnpm --filter related-web-core build`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared build code in the core (FR-026 to FR-028, D-1, D-2), the conformance site's shell, test helpers and the traceability check

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Core build subpath

- [ ] T007 [P] Unit tests for the build subpath in `packages/core/tests/unit/build.test.ts` (covers FR-026, FR-007): `canonicalText` gives one text for different key, node and link order and drops a carried `revision`; `revisionOf` is 12 hex digits and equals the revisions pinned in `packages/astro/tests/unit/canonical.test.ts`; `prepare` rejects an invalid document naming the owner, the graph and the first problem's path; `descriptorOf` joins the base path without a doubled slash; `checkInline` rejects an invalid document or `config`, a duplicate id and an id also registered, naming the page; `escapeJson` escapes `<`, `>`, `&`, U+2028 and U+2029
- [ ] T008 Create `packages/core/src/build/{canonical,prepare,descriptor,inline,index}.ts` per `contracts/core-build-subpath.md` by moving the code from `packages/astro/src/sources.ts` and `packages/astro/src/inline.ts`: hash with `globalThis.crypto.subtle.digest` so `revisionOf` and `prepare` are asynchronous (D-1); the owner name is a parameter of the error text (D-2); import nothing but the core's validators; fix the final signatures and update `contracts/core-build-subpath.md` to match
- [ ] T009 Add the `./build` export to `packages/core/package.json` and its entry to the core's build; rebuild with `pnpm --filter related-web-core build`; run T007 until it passes
- [ ] T010 Switch the Astro adapter to the subpath (FR-027): in `packages/astro/src/{sources.ts,inline.ts,routes/files.ts,GraphData.astro}` remove the local copies, import from `related-web-core/build`, add `await` at the changed call sites; in `packages/astro/tests/unit` add `await` where the tests call the async functions, changing no expectation
- [ ] T011 Run `pnpm test:astro`, `pnpm test:astro-browsers`, `pnpm test:astro-conformance`, `pnpm test:astro-package`, `pnpm test:astro-trace` and `pnpm test:unit`; all pass with no changed expectation (covers FR-027, SC-009). Add a test in `packages/core/tests/unit/build.test.ts` that imports the subpath in a browser-like environment and in Node and asserts it pulls in no `node:` module (covers FR-026, User Story 6 scenario 1)

### Conformance site and helpers

- [ ] T012 Create the conformance site shell in `packages/next/conformance-site/`: `package.json` (private, depends on `@relate/web-next` and `related-web-core` by workspace), `next.config.mjs` (`NAVIGATION`, `EXPORT` → `output: "export"`, `CACHE_COMPONENTS` → `cacheComponents: true`, `distDir` chosen by the variables, `withRelatedWeb`), `tsconfig.json`, `serve.mjs` (static file server for the export output, with the base path if set), `make-variants.ts` (writes `public/` variants `b`, `mismatch` and `broken` descriptors and data as the Astro site does) (FR-029)
- [ ] T013 [P] Create `packages/next/conformance-site/app/layout.tsx` and `app/gw-page.tsx`: the document shell and the `data-gw-*` markup of `packages/core/conformance/example-site/gw-page.ts` (nav links to home, page-1, page-2, notes, broken, blank, status, generation, profile, instance, restored, count), a root layout that renders the provider once the adapter exists
- [ ] T014 [P] Create `packages/next/conformance-site/lib/graphs.ts`: source modules returning the variant `a` document (300 `Page` nodes, five links each, as `packages/astro/conformance-site` does) for the shared graph and a small document for page and inline graphs
- [ ] T015 [P] Write the test helpers: `packages/next/tests/helpers/build-site.ts` (runs `next build` on a small fixture app copied into a temporary directory inside the workspace, V-6, with the bundler chosen by a parameter, returns the output path, exit status and captured output), `packages/next/tests/helpers/engine-url.ts`, and `packages/next/tests/browser/fixtures.ts` (start and stop the servers, per-browser page helpers, a counter of worker creations and destructions)
- [ ] T016 Write the traceability check `packages/next/tests/trace/check-trace.ts` and wire `test:next-trace`: read every FR and SC id from `specs/003-next-adapter/spec.md`, collect `// covers:` tags from `packages/next/tests` and from `packages/core/tests/unit/build.test.ts`, and fail naming any id with no passing tagged test

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 1 - A site registers a graph and a component queries it (Priority: P1) 🎯 MVP

**Goal**: A registered graph is validated and published as a revision-named file and a descriptor, and a component asks for it, shows a placeholder, then the result.

**Independent Test**: Build the conformance site and open a page that asks for the registered graph; check the placeholder, the result, the descriptor and the data file.

### Verify first

- [ ] T017 [US1] Re-run the planning checks V-1 (route factory under both bundlers, export and server) and V-7 (non-deterministic source fails the build) from `specs/003-next-adapter/verify/` against the installed Next and the real `createGraphRoute`, once T022 exists; record any difference in `research.md` (covers FR-005, FR-009, User Story 9 scenario 3)

### Tests for User Story 1 (write first, they must fail)

- [ ] T018 [P] [US1] Unit tests in `packages/next/tests/unit/graphs.test.ts`: a name that breaks ADR-003's id rule, duplicate names, a lifetime not listed, `page` with no descriptor rules per `data-model.md`, each failing with a message naming the problem (covers FR-004, FR-012, SC-006)
- [ ] T019 [P] [US1] Unit tests in `packages/next/tests/unit/route.test.ts`: `generateStaticParams` lists a descriptor and a revision-named data file per graph; `GET` answers an undeclared name or file as 404; a requested revision that is not the evaluation's revision throws in production build mode and answers 404 in development (D-3); evaluation is memoized per process in production and repeated per request in development (D-5) (covers FR-005, FR-006, FR-009)
- [ ] T020 [P] [US1] Unit tests in `packages/next/tests/unit/catalog.test.ts`: the catalog is plain data (`JSON.stringify` round trip equals input) with names, descriptor locations including the base path, lifetimes and indexes (covers FR-010, FR-011)
- [ ] T021 [P] [US1] Build tests in `packages/next/tests/build/registered.test.ts` using `build-site.ts`, each under Turbopack and webpack and for server build and export: the data file and descriptor exist under `related-web/<name>/…`, the descriptor's revision, counts and data location are right, an invalid document fails the build naming the path of the first problem, a source with random content fails with a revision mismatch naming the graph, equal content in different order gives one revision, a base path appears in the descriptor location (covers FR-005 to FR-010, SC-002, SC-006)
- [ ] T022 [US1] Playwright test `packages/next/tests/browser/registered.spec.ts` in three browsers, production server and export: `/page-1` of the conformance site renders its links and status placeholder in the server markup, reports no hydration warning, then shows the query result; a missing route file makes the core report `failed` and the page's own failure message shows (covers FR-016, FR-017, SC-008, User Story 1 scenarios 1 and 2)

### Implementation for User Story 1

- [ ] T023 [US1] Implement `packages/next/src/server/graphs.ts`: the declaration check (id rule, duplicates, lifetime values), and per-process evaluation holding a result or an error, built on `related-web-core/build` `prepare` (FR-004, FR-012, D-5)
- [ ] T024 [US1] Implement `packages/next/src/server/route.ts`: `createGraphRoute(graphs)` returns `generateStaticParams` and `GET`; the descriptor and the revision-named data file; 404 for anything undeclared; the revision check of FR-009 (build failure naming the graph in production, 404 for a stale revision in development, D-3); no `.wasm` path in server code (FR-005, FR-006, FR-009)
- [ ] T025 [P] [US1] Implement `packages/next/src/server/catalog.ts` and `packages/next/src/server/index.ts` (re-exports `createGraphRoute`, `catalog`, `GraphData`, types) (FR-011)
- [ ] T026 [P] [US1] Implement `packages/next/src/env.ts` (names of the env values) and `packages/next/src/index.ts`: `withRelatedWeb(nextConfig, { navigation })` sets the base path and profile env values and changes nothing else; default profile `client-routing` (FR-002)
- [ ] T027 [US1] Implement `packages/next/src/client/Provider.tsx` (catalog, engine URL and profile into context in an effect-written module state; no client created, no worker started), `registry.ts` (visit clients in module state, one per name), and `hooks.ts` (`useGraph` and `useQuery` return null or idle on the server and the first client render, then the core's client or the subscribed status, rows and error, passed through unaltered) and `client/index.ts` (FR-016, FR-017, FR-024, FR-025)
- [ ] T028 [US1] Add to the conformance site the route file `app/related-web/[id]/[file]/route.ts` (the three lines of ADR-005 §2.2, with literal `dynamic` and `dynamicParams`), the declaration module registering the shared graph `example` (lifetime `visit`, an index on `Page.id`), the root layout's provider with the catalog as props, and the pages `page-1`, `page-2`, `notes`, `broken`, `blank` with the markup of T013
- [ ] T029 [US1] Run T018 to T022 and make them pass; mark them in this file

**Checkpoint**: A registered graph is published and a component queries it. This is the first usable slice.

---

## Phase 4: User Story 2 - A page carries its own small graph (Priority: P1)

**Goal**: A server component writes a validated small graph into a page; a component asks for it by name and queries it.

**Independent Test**: Build a page with an inline graph, load it and query it; build pages with invalid inline graphs and see the render fail.

### Tests for User Story 2

- [ ] T030 [P] [US2] Unit tests in `packages/next/tests/unit/graph-data.test.ts` (render the server component to markup): the output is one `<script type="application/json" data-related-graph>`; `<`, `>`, `&`, U+2028 and U+2029 are escaped; `config` indexes appear; no descriptor or revision is written (covers FR-013, FR-015)
- [ ] T031 [P] [US2] Build tests in `packages/next/tests/build/inline.test.ts`: an invalid document or `config`, a duplicate id in one render, and an id also registered each fail the build naming the page and the problem (covers FR-014, SC-006, User Story 2 scenarios 3 to 5)
- [ ] T032 [P] [US2] Unit tests in `packages/next/tests/unit/inline-lookup.test.ts` (jsdom or a stubbed document): the lookup takes the only match; with several it takes the first whose parent is visible (`checkVisibility()` stubbed); an id in neither the document nor the catalog throws an error naming the id and the registered ids (covers FR-018, FR-021, D-4)
- [ ] T033 [US2] Playwright test `packages/next/tests/browser/inline.spec.ts` in three browsers: an inline graph loads and answers a query with no descriptor or data request; an index named in `config` is created before the nodes and none otherwise; a reload replays the graph from the page; two inline graphs on one page are independent clients and a fault in one leaves the other working; the server markup has no hydration warning (covers FR-013 to FR-015, SC-008, User Story 2 scenarios 1, 2, 6 to 8)

### Implementation for User Story 2

- [ ] T034 [US2] Implement `packages/next/src/server/GraphData.tsx`: props `id`, `document`, `config`; validate with `checkInline` from the core's build subpath (page name for the message from the request path), duplicate and registered-id checks per render, and write the escaped script element (FR-013, FR-014)
- [ ] T035 [US2] Implement `packages/next/src/client/inline.ts` (the D-4 lookup) and extend `registry.ts`: an inline graph is found first, parsed, and a client is created with no store and keyed by id plus the element, so a new element is a new client; the catalog is consulted next; unknown ids fail naming the registered ones (FR-018, FR-021)
- [ ] T036 [US2] Add to the conformance site the pages `inline` (one inline graph with `config` indexes and one without) and `two-graphs` (two independent graphs), and a few entries of content in `lib/recipes.ts` so `app/recipes/[slug]/page.tsx` builds each page's graph from its own entry
- [ ] T037 [US2] Run T030 to T033 and make them pass; mark them in this file

**Checkpoint**: Both ways of declaring a graph work.

---

## Phase 5: User Story 3 - A graph's lifetime follows the components that use it (Priority: P1)

**Goal**: Page-lifetime graphs are shared by holders and destroyed one task after the last holder leaves; visit-lifetime graphs survive navigation; strict mode and hidden pages behave.

**Independent Test**: In the conformance site, navigate by link, history and script, with strict mode on and off and with `cacheComponents`, and check for leftover clients, subscriptions and data.

### Verify first

- [ ] T038 [US3] Re-run planning check V-4 (hidden earlier pages, default and `cacheComponents: true`) with the real hooks, once T042 exists; record the result in `research.md` and amend ADR-005 §6 if it differs (covers FR-021, User Story 9 scenario 1)

### Tests for User Story 3

- [ ] T039 [P] [US3] Unit tests in `packages/next/tests/unit/registry.test.ts` with a stub core client factory and fake timers: two holders share one client; the last release destroys it one task later (`setTimeout(0)`); a hold, release, hold sequence in one task (strict mode) creates one client and destroys none; a visit client is never destroyed by release; an inline client is destroyed by the same rule (covers FR-019 to FR-021, User Story 3 scenarios 1, 2, 4)
- [ ] T040 [US3] Playwright test `packages/next/tests/browser/lifecycle.spec.ts` in three browsers, both profiles, strict mode on and off, and the `CACHE_COMPONENTS` build: navigation by link, history and script leaves no page-lifetime client, subscription or scoped data from a departed page; exactly one client is created under strict mode; a closed tab, reload or document-leaving link ends the client; page B shows its own inline graph and never page A's (also with a hidden page kept) (covers FR-019 to FR-021, SC-003, User Story 3 scenarios 1 to 9)
- [ ] T041 [US3] Playwright test `packages/next/tests/browser/store.spec.ts` in three browsers: a registered page-lifetime graph with a descriptor restores from its stored copy on the next page when the revision matches, without a second client on the same store; a different page-lifetime graph on the next page opens its own store (covers FR-020, User Story 3 scenarios 5 and 6)
- [ ] T042 [US3] Playwright test in `packages/next/tests/browser/lifecycle.spec.ts` (same file, new case): a `visit` graph under `client-routing` keeps one worker, instance and generation across link, history and script navigation (covers FR-019, SC-004, User Story 3 scenario 7)

### Implementation for User Story 3

- [ ] T043 [US3] Complete `packages/next/src/client/registry.ts`: holders per (kind, key) counted in effects, deferred destroy via `setTimeout(0)` cancelled by a new hold, page clients created by the first holder with `store` enabled when the descriptor is set, scoped data and subscriptions dropped with the holder (FR-019 to FR-021)
- [ ] T044 [US3] Make `hooks.ts` hold and release in an effect and key inline holders by the element found by `inline.ts`, ignoring results for a departed holder (FR-017, FR-021, edge case "page left while a query is in flight")
- [ ] T045 [US3] Add the conformance pages `lifetime-a` and `lifetime-b` (a registered `page`-lifetime graph `small`, and two pages with inline graphs of the same name and different content), a scoped-data page, and a `Lifecycle` panel that exposes client counters to the tests
- [ ] T046 [US3] Run T039 to T042 and make them pass; mark them in this file

**Checkpoint**: The three P1 stories are complete: the MVP.

---

## Phase 6: User Story 4 - The profile, base path and engine location are supplied once (Priority: P2)

**Goal**: One wrapper and one provider make the profile, base path and engine location available; overrides are testing aids.

**Independent Test**: Build the conformance site for each profile with and without a base path and check which profile the core receives and where the descriptor is requested.

### Tests for User Story 4

- [ ] T047 [P] [US4] Unit tests in `packages/next/tests/unit/config.test.ts`: `withRelatedWeb` with no option sets `client-routing`; `multi-page` is passed through; a base path sets the env value; other configuration keys are unchanged; an invalid profile fails naming the allowed values (covers FR-002, User Story 4 scenarios 1 to 3)
- [ ] T048 [US4] Playwright test `packages/next/tests/browser/profile.spec.ts` in three browsers: the page reports the profile the core received for each build; with a base path the descriptor request URL includes it, in export and server forms; the profile override changes only the profile; the descriptor override requests that location and nothing else changes; the engine location passed to the provider reaches the core unchanged (covers FR-002, FR-010, FR-016, FR-023, User Story 4 scenarios 2 to 6)

### Implementation for User Story 4

- [ ] T049 [US4] Implement the override options in `packages/next/src/client/hooks.ts` and `client/index.ts` (`profile`, `descriptor`), documented as testing aids and each changing only its own value (FR-023); make the provider pass the engine URL, base-path-prefixed descriptor and profile to `createClient` unchanged (FR-016)
- [ ] T050 [US4] Add to the conformance site the `profile` and `instance` pages' markup and a base-path build variant (`BASE_PATH`) used by T048
- [ ] T051 [US4] Run T047 and T048 and make them pass; mark them in this file

**Checkpoint**: Configuration works under both profiles and a base path.

---

## Phase 7: User Story 5 - Visit-lifetime graphs outside a component (Priority: P2)

**Goal**: A direct lookup for visit-lifetime graphs, failing loudly for anything else.

**Independent Test**: Call the lookup for a visit graph, a page graph and an inline graph, and check the three outcomes.

### Tests for User Story 5

- [ ] T052 [P] [US5] Unit tests in `packages/next/tests/unit/direct-lookup.test.ts`: a visit graph returns the same client twice; a page-lifetime graph and an inline graph fail with a message that names the graph and says to ask from a component; an unknown name fails naming it and listing the registered names; a call before the provider has mounted fails saying so (covers FR-022, User Story 5 scenarios 1 to 3)
- [ ] T053 [US5] Playwright test `packages/next/tests/browser/direct.spec.ts` in three browsers: on the `direct` page the three outcomes show, and the visit client equals the one a component holds (covers FR-022)

### Implementation for User Story 5

- [ ] T054 [US5] Implement `graph(id)` in `packages/next/src/client/index.ts` over the registry (visit only) with the messages above (FR-022)
- [ ] T055 [US5] Add the `direct` page to the conformance site
- [ ] T056 [US5] Run T052 and T053 and make them pass; mark them in this file

**Checkpoint**: The direct lookup is checked.

---

## Phase 8: User Story 6 - Both adapters produce the same revisions from shared code (Priority: P2)

**Goal**: Show the shared code is shared and produces equal results in both adapters.

**Independent Test**: Run the Astro adapter's existing tests and the core's tests for the subpath (done in T011), plus the cross-adapter comparison.

- [ ] T057 [P] [US6] Test `packages/next/tests/build/same-revision.test.ts`: build the document of the conformance graph with the Next conformance site and read the Astro conformance site's published descriptor for the same document; the revision and the descriptor fields are equal (covers FR-007, SC-002, User Story 6 scenario 2)
- [ ] T058 [US6] Confirm no copy of canonical text, revision, preparation, descriptor or inline-check code remains in `packages/astro/src` or `packages/next/src` (a `grep` check added to `packages/next/tests/unit/no-copies.test.ts`) (covers FR-026, FR-027, User Story 6 scenario 3)

**Checkpoint**: One implementation of the revision rule.

---

## Phase 9: User Story 7 - The adapter is checked against the shared conformance scenarios (Priority: P2)

**Goal**: The core's conformance runner passes against the Next conformance site in every form and browser.

**Independent Test**: Run `pnpm test:next-conformance` and `pnpm test:next-browsers`.

- [ ] T059 [US7] Write `packages/next/tests/browser/conformance.spec.ts` (tagged `@conformance`): run the core's `run.ts` over each served build (both profiles, server and export) with `dataRequests` matchers for the hashed data URLs and the `descriptor` override pointing at the `public/` variants (ADR-004 §6 as `contracts/conformance-site.md` says), reporting to `reports/conformance.json`; the failing check names the scenario and the browser (covers FR-029, FR-030, SC-005, User Story 7 scenarios 1 and 3)
- [ ] T060 [US7] Run the conformance spec in Chromium, Firefox and WebKit for all four builds; fix any adapter or site fault the scenarios find (not the runner, FR-028); record anything that cannot pass in `research.md` and amend ADR-005 §6
- [ ] T061 [P] [US7] Write `packages/next/tests/browser/figures.spec.ts` (tagged `@figures`): record load figures for inline and registered graphs of three sizes in Chromium and Firefox as single runs in `reports/figures.json`, labeled as one environment, no threshold (D-7)
- [ ] T062 [US7] Add a hydration check to the conformance spec: each conformance page renders the same markup on the server and in the browser, with no hydration warning, and its links and placeholder work while the instance loads, recovers or fails (covers SC-008)

**Checkpoint**: The adapter passes the shared scenarios.

---

## Phase 10: User Story 8 - A published package installs and works in a clean project (Priority: P3)

**Goal**: The packed adapter, core and engine install into a clean Next project and run under both bundlers.

**Independent Test**: Run `pnpm test:next-package`.

- [ ] T063 [US8] Write `packages/next/tests/package/clean-install.test.ts` (covers FR-032, SC-007): pack the engine, the core and the adapter into a temporary directory outside the repository; create a clean Next 16 project; install the tarballs (engine as a peer dependency, no reference to the repository's layout); add a declaration module, the route file, the provider and a page that queries the graph, passing `new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url)` as the engine URL; build with Turbopack and with webpack; serve with `next start` and load the page in Chromium; assert a query result and that the worker and `.wasm` were placed with no workaround
- [ ] T064 [US8] Run it and fix any packaging fault (`files`, `exports`, peer ranges) in `packages/next/package.json`; record the run in `research.md`

**Checkpoint**: The packed package works outside the repository.

---

## Phase 11: User Story 9 - Open questions are checked and the decision is amended (Priority: P2)

**Goal**: ADR-005 §6 states what the implementation found.

- [ ] T065 [US9] Development-server tests in `packages/next/tests/build/dev.test.ts`: under `next dev` the files are served, editing a source changes the descriptor's revision and serves the new data file, a request for the old revision answers 404, a source that throws gives an error response naming the graph (covers User Story 1 scenario 8, User Story 9 scenario 2; V-5)
- [ ] T066 [US9] Compare each planning check (V-1 to V-7) with what the implementation tests showed; amend `design/adr/ADR-005-next-adapter.md` §6 with a dated entry for each of the four listed questions and for RFC-001 §7.5 (settled: static export and Node server; open: edge and serverless), and update `design/rfc/RFC-001-web-framework-embedding.md` §7.5 to §7.7 only by pointing at the ADR (covers FR-033, SC-009, User Story 9 scenarios 1 to 4)

---

## Phase 12: Polish & Cross-Cutting Concerns

- [ ] T067 [P] Write `packages/next/README.md`: use in five steps (config wrapper, declaration module, three-line route file, provider with the catalog and engine URL, component), lifetimes, the placeholder-first rule, inline graphs, the base path, output modes and what is out of scope (edge, serverless, pages router), the testing aids
- [ ] T068 [P] Update `CLAUDE.md` "Project state" and the Commands list with the Next package and its scripts; note that the namespace rename of other packages is a separate change
- [ ] T069 Run the full suite: `pnpm -r build`, `pnpm test:unit`, `pnpm test:browsers`, `pnpm test:conformance`, `pnpm test:package`, `pnpm test:trace`, then every `test:astro-*` and `test:next-*` script; run each browser suite twice and note any flake in `research.md` rather than re-running until green
- [ ] T070 Run `pnpm test:next-trace` and make it report every FR and SC covered by a passing tagged test (FR-034); mark `spec.md` status Implemented and re-check `checklists/requirements.md`
- [ ] T071 Run `quickstart.md` start to finish on a clean checkout and fix any step that does not work as written

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. Within Phase 2: T007 before T008, T008 to T009, T009 to T010 and T011; T012 to T016 are independent of the core move except that T015 and T016 need the package.
- US1 → US2 → US3 (the P1 chain; each extends the client registry). US4 to US7 need US1 to US3. US6's code work is in Phase 2; its Phase 8 tasks need the Astro conformance site built. US8 needs US1 to US3 and the final `package.json`. US9 tasks T065 and T066 run last, after the behavior they report on.
- Polish after everything.

## Parallel Opportunities

- Phase 1: T002, T003, T004 together.
- Phase 2: T007 beside T012 to T015.
- Within each story, tasks marked [P] (unit and build tests on different files) together; implementation tasks on `server/` and `client/` files of one story that do not share files (for example T025 and T026) together.
- US4, US5 and US6 can be done in parallel by different people once US3 is complete; they touch different spec files and `hooks.ts` only in US4.

## Implementation Strategy

- **MVP**: Phases 1 to 5 (US1 to US3): publish a registered graph, carry an inline graph, tie lifetimes to components. Stop and run the conformance subset (T022, T033, T040) before going on.
- **Incremental**: add US4 and US5 (small), then the conformance runner (US7), then the package test (US8), then amend the ADR (US9). Merge to `main` only when everything is done, as agreed; the rename of the core and Astro packages follows that merge.
- Each Verify task re-runs a planning check against the real code; if the result differs from `research.md`, stop, amend ADR-005 §6, then continue.
