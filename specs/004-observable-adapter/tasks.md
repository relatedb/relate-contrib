---
description: "Task list for the @relate/observable adapter"
---

# Tasks: Observable Framework Adapter for Embedding the Graph Database

**Input**: Design documents from `/specs/004-observable-adapter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-006 (accepted; reviewed and amended 2026-11-08) and builds on ADR-001 to ADR-005. Planning decisions D-1 to D-6 are in research.md and need no ADR amendment.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers: FR-…, SC-…` comment; `test:observable-trace` fails for any untagged requirement (FR-029).

**Organization**: Tasks are grouped by user story. Dependencies decide the phase order, not story numbers: the results layer (US4) has no browser dependency and the opened graph (US1) returns it, so US4 is built first. US4, US1, US2 and US3 are P1 and together are the MVP. The conformance site's shell is created in Phase 2 and each story adds the pages it needs.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root; `packages/observable` is the package of the plan. Fixtures from the planning checks are in `specs/004-observable-adapter/verify/` and are the starting point for the matching tasks.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- Framework prints cell errors in the page, not in the build (research V-5): a Playwright test that expects a cell's output must also fail on any `.observablehq--error` element.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package, tooling, scripts

- [X] T001 Create `packages/observable/package.json`: name `@relate/observable`, `type: module`, `private: true`, `files` listing `dist` only (the conformance site is not published), exports `.`, `./loader` and `./results` (types and default under `dist`), peer dependencies `@observablehq/framework ^1.13`, `@relate/web`, `@relate/relate-wasm`, runtime dependency `esbuild`; dev dependencies `@observablehq/framework`, `@playwright/test`, `@types/node`, `@relate/web` (`workspace:*`), `tsx`, `typescript`, `vitest`; scripts `build`, `typecheck`, `test:observable`, `test:observable-browsers`, `test:observable-conformance`, `test:observable-package`, `test:observable-trace` as the Next package names them (FR-001)
- [X] T002 [P] Create `packages/observable/tsconfig.json` (strict, ES2022, declaration files, `outDir` `dist`, includes `src/**/*.ts`; the browser entry and the results entry must not reference Node types)
- [X] T003 [P] Create `packages/observable/vitest.config.ts` for `tests/unit` and `tests/build`, and `packages/observable/vitest.package.config.ts` for `tests/package`
- [X] T004 [P] Create `packages/observable/playwright.config.ts`: projects `chromium`, `firefox`, `webkit`; one web server that builds `conformance-site` (`observable clean && observable build`) and serves `dist` with `serve.mjs`; tags `@conformance` and `@figures` as in the Next config
- [X] T005 Add to the root `package.json` the scripts `test:observable`, `test:observable-browsers`, `test:observable-conformance`, `test:observable-package` and `test:observable-trace` (each `pnpm --filter @relate/observable …`), per `quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Loader utilities, the conformance site's shell with its injected packages, test helpers, the traceability check and the scope guard

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 [P] Unit tests in `packages/observable/tests/unit/loader-resolve.test.ts` (covers FR-004, research D-1): package resolution uses the working directory, not the adapter's location (a fixture project with its own `node_modules` copy of a stub package is found from that directory); a failure writes the message to standard error and exits non-zero (run as a process)
- [X] T007 Implement `packages/observable/src/loader/resolve.ts` (resolve a package or a package subpath from `process.cwd()` with `createRequire`) and `src/loader/fail.ts` (write a message naming the graph or file to standard error and exit 1); make T006 pass
- [X] T008 Create the conformance site shell in `packages/observable/conformance-site/`: `package.json` (private; dependencies `@relate/observable` and `@relate/web` as `workspace:*` with `dependenciesMeta` `injected: true`, `@relate/relate-wasm: "*"`, `@observablehq/framework`), `observablehq.config.js` (`root: "docs"`, `pages: []`, `toc: false`), `serve.mjs` (static file server for `dist`, content types for `.wasm` and `.js`), `docs/lib/` and `docs/data/` folders; add `packages/observable/conformance-site` to `pnpm-workspace.yaml`; run `pnpm install` (FR-022, FR-024)
- [X] T009 Settle research D-4: after `pnpm --filter @relate/web build`, edit a file in `packages/web/dist`, run `pnpm install --offline --frozen-lockfile`, and check whether the site's injected copy changes. Record the result in `research.md` D-4 (single run). If it does not refresh, write `packages/observable/conformance-site/scripts/refresh-deps.mjs` that packs the two packages and unpacks them over the injected copies, and use it as the site's `pretest`; otherwise `pretest` runs the install
- [X] T010 [P] Write the build-test helper `packages/observable/tests/helpers/framework-site.ts`: copies a fixture project folder to `packages/observable/.tmp/<name>`, gives it real copies of `@relate/web` and `@relate/relate-wasm` and links to `@observablehq/framework` and `esbuild` as in `specs/004-observable-adapter/verify/README.md`, runs `observable clean` and `observable build` with Framework's telemetry off, returns the output path, exit status and captured output; and `tests/helpers/engine.ts` (initialize the engine in Node from the binary's bytes, run a statement, return the parsed envelope)
- [X] T011 [P] Write the browser helpers `packages/observable/tests/browser/fixtures.ts`: start and stop the static server, per-browser page helpers, a counter of live workers (an init script that wraps `Worker` to count creations and `terminate` calls), a check that fails on any `.observablehq--error` element
- [X] T012 Write the traceability check `packages/observable/tests/trace/check-trace.ts` as the Next package's, reading ids from `specs/004-observable-adapter/spec.md` and the reports `vitest.json`, `package.json`, `playwright.json` and `conformance.json` (FR-029)
- [X] T013 [P] Scope guard test `packages/observable/tests/unit/scope.test.ts` (covers FR-028): no file under `packages/web/src`, `packages/astro/src` or `packages/nextjs/src` differs between commit `5ad5466` (the plan) and the working tree; the browser entry and the results entry import no `node:` module and no `esbuild`; the package never imports the engine's binary (FR-002)

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 4 - Query results feed Framework's components (Priority: P1)

**Goal**: A tagged template returns rows that Framework's components accept, columns in written order, with the engine's entities readable in a table and convertible to nodes and links.

**Independent Test**: Run queries through the tagged template against the real engine in Node; later (T032) feed the rows to a chart, an input and a table in a browser.

### Tests for User Story 4 (write first, they must fail)

- [X] T014 [P] [US4] Unit tests in `packages/observable/tests/unit/normalize.test.ts` against the real engine (the spike's fourteen tests, rewritten; covers FR-018, User Story 4 scenarios 1, 3, 4, 7, 8): a scalar, a node, a relationship, a path (alternating array), an empty result (column types `ANY`, columns kept) and an error envelope (reduced, no column types); rows keyed in column order whatever the engine returns; entities flattened with a readable text form; the engine's tagged entities kept on `rows`
- [X] T015 [P] [US4] Unit tests in `packages/observable/tests/unit/graph.test.ts` against the real engine (covers FR-019, scenario 6): `toGraph` collects nodes and relationships including those inside paths, drops a relationship whose endpoint is not in the result, and gives `{ nodes: [], links: [] }` for scalars only
- [X] T016 [P] [US4] Unit tests in `packages/observable/tests/unit/cypher.test.ts` against the real engine (covers FR-020, FR-021, SC-007, scenarios 2, 4, 5, 7): each interpolation is a bound parameter (`p0`, `p1`) and a hostile string matches nothing and changes no statement text; the result is an array of flattened rows with `columns`, `columnTypes`, `stats` and `elapsedMs` attached and the normalized result non-enumerable; an engine error rejects with the engine's message; an empty result is an empty array that still carries its columns

### Implementation for User Story 4

- [X] T017 [US4] Implement `packages/observable/src/results/normalize.ts` from `design/spikes/SPIKE-001-observable-framework-wasm/observable-graph/docs/components/normalize.js`, typed, with the engine's current envelope fields (`columns`, `columnTypes`, `rows`, `stats`, `elapsed_ms`, `error`) and the reorder by `columns`; `src/results/graph.ts` (`toGraph`); `src/results/cypher.ts` (`makeCypher`); `src/results/index.ts` (FR-018 to FR-020)
- [X] T018 [US4] Run T014 to T016 until they pass; where the current engine's shapes differ from the spike's, record the difference in `research.md` (single run) and keep the tests as the contract

**Checkpoint**: The results layer is done and tested without a browser.

---

## Phase 4: User Story 1 - A site places the engine and queries a graph held in a cell (Priority: P1) 🎯 MVP

**Goal**: Two loaders place the engine and the worker; a cell opens a graph from a document and queries it, with the page's other cells working while it loads.

**Independent Test**: Build a page that opens a graph from an object held in a cell, load it in each browser, check the rows and that the engine and worker were requested from the site's own published files.

### Tests for User Story 1 (write first, they must fail)

- [ ] T019 [P] [US1] Build tests in `packages/observable/tests/build/placement.test.ts` using `framework-site.ts` (covers FR-003, FR-004, FR-005, User Story 1 scenarios 1, 2, 6): the loader scripts run as processes; `engine()` output equals the installed binary's bytes; `worker()` output is one ES module with no bare import specifier and contains the engine's glue and the core's worker; a build publishes both under hashed names, the worker's file served as `text/javascript`; the preview server serves the same locations
- [ ] T020 [P] [US1] Unit tests in `packages/observable/tests/unit/open-graph-input.test.ts` (covers FR-012, FR-014): `open` with a stubbed core `createClient` and stub attachments passes the engine location, `navigation: "multi-page"` and a `workerFactory` that constructs a module worker from the worker attachment's location; a document input given as an object passes it through, given as an attachment reads it; `indexes` pass to the core unchanged
- [ ] T021 [US1] Playwright test `packages/observable/tests/browser/open.spec.ts` in three browsers (covers FR-011, FR-014, SC-001, SC-008, scenarios 1 to 5): on the conformance site's `document` page the call returns before ready, the page's other cells render while `ready` is pending, `ready` resolves and a query returns the expected rows; the requests for the binary and the worker are to published `_file` locations; an invalid document gives status `failed` with a diagnostic naming the first problem and `ready` rejects; an unreachable worker location rejects `ready` after the core's three attempts while the other cells still work

### Implementation for User Story 1

- [ ] T022 [US1] Implement `packages/observable/src/loader/index.ts` `engine()` and `worker()` (FR-003, FR-004, D-1): the first writes the bytes of `@relate/relate-wasm/relate_bg.wasm` resolved from the site's root; the second bundles the site's `@relate/web/worker` entry with esbuild (`bundle`, `format: "esm"`, `platform: "browser"`, in memory) and writes the text; failures go through `fail.ts`
- [ ] T023 [US1] Implement `packages/observable/src/attachments.ts` (resolve an attachment's published location, and its content when asked, once per page, keyed by attachment name, D-3) and `src/open.ts` for document inputs: create the core's client with `createClient`, `navigation: "multi-page"`, `engineUrl` and a `workerFactory`; `ready` from the client's status events; `query`, `cypher` (from the results entry) and `graph`; export `open` from `src/index.ts` (FR-011, FR-012, FR-014, FR-017, FR-021)
- [ ] T024 [US1] Add to the conformance site the loaders `docs/data/relate.wasm.js` and `docs/data/relate-worker.js.js` (from the verify fixtures, calling the helpers) and the page `docs/document.md`: one graph from an object held by a cell and one from a data attachment, each with a table of query rows and the `data-rel-*` status markup; a page `docs/blank.md` that opens nothing (covers FR-015's no-start rule via T031)
- [ ] T025 [US1] Build the package (`pnpm --filter @relate/observable build`), refresh the site's injected copies (T009), run T019 to T021 and make them pass

**Checkpoint**: A site places the engine and the worker and queries a graph held in a cell. This is the first usable slice.

---

## Phase 5: User Story 2 - A site publishes a graph from a source and a page restores it by revision (Priority: P1)

**Goal**: A source module and two loaders publish a validated document and a descriptor; a page opens them as a pair, and a later page restores the stored copy while the revision is unchanged.

**Independent Test**: Build the conformance site, open a page with a descriptor-and-data graph, check the descriptor and the data file, then open a second page with the same graph and see the stored copy used.

### Tests for User Story 2 (write first, they must fail)

- [ ] T026 [P] [US2] Build tests in `packages/observable/tests/build/graph-loaders.test.ts` (covers FR-006, FR-007, FR-008, FR-009, SC-002, SC-005, scenarios 1 to 4): the document's text equals `canonicalText` from `@relate/web/build` and the descriptor's revision equals `revisionOf` of it, with counts and indexes; two builds from the same content in different key and item order give the same revision; changing one property changes it; an invalid document, a malformed id and a source that throws each fail the build with a message naming the graph and the first problem's path
- [ ] T027 [P] [US2] Build tests in `packages/observable/tests/build/freshness.test.ts` (covers FR-010, scenario 5, ADR-006 §2.2): build twice, editing a source between them, with `observable clean` before each: the revision changes; without a clean the second build keeps the first output (research V-4); a source that returns different content on each call gives a document and a descriptor whose revisions disagree, which the core's `checkAgreement` reports
- [ ] T028 [P] [US2] Unit tests in `packages/observable/tests/unit/open-descriptor.test.ts` (covers FR-013, scenario 6): with a descriptor attachment and a data attachment, `open` reads the descriptor, replaces `data.url` with the data attachment's location whatever its content hash, and passes a descriptor (not a location) to the core with the per-page profile
- [ ] T029 [US2] Playwright test `packages/observable/tests/browser/descriptor.spec.ts` in three browsers (covers FR-013, scenarios 6 to 8): the conformance site's `page-1` opens the example graph from its descriptor and data pair and shows 300 pages; only the declared index exists; `page-2` then restores from the stored copy without a request for the data file

### Implementation for User Story 2

- [ ] T030 [US2] Implement `packages/observable/src/loader/graph.ts` and export `document(id, source)` and `descriptor(id, source, options)` from the loader entry (FR-006 to FR-009): id check by the core's rule, call the source, validate with `@relate/web/validate`, write canonical text, or the descriptor built with `descriptorOf` with `data.url` set to `data/<id>.graph.json`; failures through `fail.ts`; extend `src/open.ts` for descriptor-and-data inputs (FR-012, FR-013)
- [ ] T031 [US2] Add to the conformance site `docs/lib/example.js` (the 300-page document of variant `a`, as the Astro site's), `docs/data/example.graph.json.js` and `docs/data/example.descriptor.json.js`, and pages `docs/page-1.md` and `docs/page-2.md` that open the pair; run T026 to T029 and make them pass

**Checkpoint**: A source publishes a graph with a revision and a stored copy is restored.

---

## Phase 6: User Story 3 - A client's lifetime follows its cell (Priority: P1)

**Goal**: A client ends with the cell that opened it or with the page; a page can open several independent graphs.

**Independent Test**: Open a graph in a cell that reads an input, move the input 20 times and count live workers; close the page.

### Tests for User Story 3 (write first, they must fail)

- [ ] T032 [P] [US3] Unit tests in `packages/observable/tests/unit/open-lifetime.test.ts` with a stubbed core client (covers FR-015, FR-016, scenarios 1, 2, 6, D-3): the client is destroyed when `invalidation` resolves and on `pagehide`; no worker or client exists before `open` is called; `pageshow` with `persisted` set reloads the document once and without it does nothing; three opens on one page resolve each attachment's location once
- [ ] T033 [US3] Playwright test `packages/observable/tests/browser/lifetime.spec.ts` in three browsers (covers FR-015, FR-016, SC-003, SC-008, scenarios 1 to 5): on the `rerun` page, moving the input 20 times leaves exactly one live worker, and after the page is closed none; with the open call in a cell that reads no input, the same client, worker and generation persist across input changes; on `two-graphs`, a trap in one graph's instance replaces it and leaves the other's generation unchanged; following a link to a page that opens nothing leaves no worker; `blank` creates none

### Implementation for User Story 3

- [ ] T034 [US3] Extend `packages/observable/src/open.ts`: destroy on `invalidation` and on `pagehide`; reload once on `pageshow` with `persisted`; no work before `open` is called; per-page attachment map shared by every open (FR-015, FR-016, D-3)
- [ ] T035 [US3] Add to the conformance site the pages `docs/rerun.md` (a range input read by a cell that opens a graph, and a variant that opens in a cell reading no input) and `docs/two-graphs.md` (two independent opens, a button that runs the trapping statement against one); run T032 and T033 and make them pass

**Checkpoint**: Clients end with their cells and pages, and several graphs coexist. The P1 slices are complete.

---

## Phase 7: User Story 5 - The adapter is checked against the shared conformance scenarios (Priority: P2)

**Goal**: The core's conformance runner passes against the Framework site in three browsers under the per-page profile, and the adapter's own behaviors have their own tests.

**Independent Test**: Run the conformance command and the adapter tests; both pass in all three browsers.

### Tests for User Story 5

- [ ] T036 [P] [US5] Playwright test `packages/observable/tests/browser/components.spec.ts` in three browsers (covers FR-020, SC-007, User Story 4's browser path): on the `queries` page rows from the tagged template, with a value interpolated from a select and a range input, feed a table, a chart and a select; the displayed numbers equal the document's; a hostile string typed in a search box returns no rows and changes no statement text
- [ ] T037 [US5] Playwright test `packages/observable/tests/browser/conformance.spec.ts` tagged `@conformance` (covers FR-022, FR-023, SC-004): `runConformance` from `@relate/web/conformance` with `profile: "multi-page"` in each browser against the built site, with `dataRequests` matching the example graph's hashed data files and the variants `b`, `mismatch` and `broken` selected by the `variant` query parameter as in `packages/astro/tests/browser/conformance.spec.ts`; the scenarios that need a retained instance are not run; fail on a report with any failure naming the scenario
- [ ] T038 [P] [US5] Test `packages/observable/tests/unit/site-deps.test.ts` (covers FR-024, scenario 3): the conformance site's `package.json` declares `@relate/observable` and `@relate/web` with `injected: true`, and its installed `node_modules/@relate/observable` and `node_modules/@relate/web` are not symlinks to a directory under `packages/`

### Implementation for User Story 5

- [ ] T039 [US5] Add to the conformance site `docs/lib/rel-page.js` (the `data-rel-*` markup and behavior of `packages/web/conformance/example-site/rel-page.ts` built on `open`: status, generation, profile, instance, restored, count, updates, failure, last error, notes, `trap` and `timeout` actions, `data-rel-state` on the root) and the pages `docs/index.md` (home), `docs/notes.md`, `docs/broken.md` (a graph whose data location does not exist), reading the `variant` and `navigation` query parameters; make `page-1` and `page-2` use it (FR-022)
- [ ] T040 [US5] Add to the conformance site the variants `docs/variants/{descriptor-b,graph-b,descriptor-mismatch,descriptor-broken}.json` (written by a `make-variants` script, as the Astro site's) and the lookup of literal attachments by variant (research D-6); add `docs/queries.md` with the tagged template feeding `Inputs.table`, `Plot` and `Inputs.select`
- [ ] T041 [US5] Run T036 to T038 and make them pass in all three browsers; where a scenario fails, fix the site or the adapter, and record anything the runner assumes that this framework cannot meet in `research.md`

**Checkpoint**: The adapter passes the shared conformance check.

---

## Phase 8: User Story 6 - A packed package installs and works in a clean project (Priority: P2)

**Goal**: The adapter, core and engine, packed as published, install into a clean Framework project outside the repository, which builds and runs a page.

**Independent Test**: Run the package test; the clean project builds and a loaded page returns a query result.

- [ ] T042 [US6] Package test `packages/observable/tests/package/clean-install.test.ts` (covers FR-001, FR-026, SC-006, scenarios 1 to 3, User Story 7 scenario 4): pack `@relate/observable`, `@relate/web` and the engine (the engine from `vendor/relate-wasm/pkg`) into tarballs (prefixes follow the package names); in a temporary directory outside the repository create a Framework 1.x project, install the three tarballs, add the four loaders and a page that opens a graph and queries it, run `observable clean && observable build`, serve `dist`, load the page in Chromium and read the query result; assert the binary and the worker are published once each under hashed names, the page requests no other location for them, the packed manifest declares the engine and the core as peer dependencies with `esbuild` as its only runtime dependency, and no file mentions the repository's layout; record the result for ADR-006 §6
- [ ] T043 [US6] Run T042 once with the adapter installed from tarballs and once after changing the engine's version string in its `package.json` copy and rebuilding with a clean: the worker bundle and the binary still pair (the freshness rule of ADR-006 §2.2); record both runs in `research.md`

---

## Phase 9: User Story 7 - Open items are checked and the decision is amended (Priority: P2)

**Goal**: ADR-006 §6 states what the implementation found.

- [ ] T044 [US7] Preview-server tests in `packages/observable/tests/build/preview.test.ts` (covers FR-027, scenario 2): start `observable preview` on a fixture, edit a graph source and check whether the descriptor and document follow without a clean, then save the loader script and check again; check how a failing loader shows (in the page or only in the terminal); record the outcome
- [ ] T045 [US7] Compare each planning check (V-1 to V-8) with what the implementation tests showed. Amend `design/adr/ADR-006-observable-adapter.md` §6 with a dated entry for each item in §4 that implementation checked (loader cache after an engine upgrade, preview-server behavior, headless browsers running cells, installing as a published package) and for RFC-001 §7.7 (settled for this framework: loaders place the binary and the worker); update `design/adr/README.md`'s status line for ADR-006 if it changes (covers FR-027, scenarios 1 to 5)

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T046 [P] Write `packages/observable/README.md`: use in five steps (install, the four loaders, the clean-before-build scripts, the open call, a cell with `await db.ready`), the cell rules (no `await` in a loop, no variable named `document`, open in a cell that reads no input), what the build can and cannot catch (research V-5), the symlink rule for workspace sites (V-6), and the unmeasured costs
- [ ] T047 [P] Update `CLAUDE.md` "Project state" and the Commands list with the Observable package and its scripts, and the planning list of integrations (Observable done)
- [ ] T048 Run the full suite: `pnpm -r build`, `pnpm test:unit`, `pnpm test:browsers`, `pnpm test:conformance`, `pnpm test:package`, `pnpm test:trace`, then every `test:astro-*`, `test:next-*` and `test:observable-*` script; run each browser suite twice and note any flake in `research.md`
- [ ] T049 Run `pnpm test:observable-trace` and make it report every FR and SC covered by a passing tagged test (FR-029); mark `spec.md` status Implemented and re-check `checklists/requirements.md`
- [ ] T050 Run `quickstart.md` start to finish on a clean checkout and fix any step that does not work as written

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. Within Phase 2: T006 before T007; T008 before T009; T010 and T011 need the package from Phase 1; T012 and T013 are independent.
- US4 → US1 → US2 → US3 (the P1 chain; `open` returns the results layer, the descriptor path extends `open`, the lifetime extends it again). US5 needs US1 to US4. US6 needs the final `package.json` and the loaders. US7's T044 needs the loaders; T045 needs everything else.
- Polish after everything.

## Parallel Opportunities

- Phase 1: T002, T003, T004 together.
- Phase 2: T006 beside T008; T010, T011, T012, T013 together.
- Within each story, the [P] test tasks on different files together; US4's three unit-test files together.
- US6 and US7's T044 can run beside US5 once US3 is complete; they touch different test files.

## Implementation Strategy

- **MVP**: Phases 1 to 6 (US4, US1, US2, US3): the results layer, placement of the engine and worker, a published graph with a revision, lifetimes tied to cells. Stop and run the browser subset (T021, T029, T033) before going on.
- **Incremental**: add the conformance check (US5), then the package test (US6), then the preview checks and the ADR amendment (US7). Merge to `main` only when everything is done and the user agrees.
- The first task that tests an assumption of the plan is T009 (does pnpm refresh an injected copy); if the answer is no, the fallback is written there, not discovered later. Every check that differs from `research.md` stops work: amend ADR-006 §6, then continue.

## Requirement Coverage

| Requirements | Tasks |
|---|---|
| FR-001, FR-002 | T001, T013, T042 |
| FR-003 to FR-005 | T019, T022 |
| FR-006 to FR-010 | T026, T027, T030 |
| FR-011 to FR-014 | T020, T021, T023, T028, T029 |
| FR-015 to FR-017 | T032, T033, T034 |
| FR-018 to FR-021 | T014 to T018, T036 |
| FR-022 to FR-024 | T008, T037, T038, T039 |
| FR-025 | T014 to T016, T019, T026, T032 (the named test groups) |
| FR-026 | T042 |
| FR-027 | T044, T045 |
| FR-028 | T013 |
| FR-029 | T012, T049 |
| SC-001 to SC-009 | T021 (SC-001, SC-008), T026 and T027 (SC-002, SC-005), T033 (SC-003), T037 (SC-004), T042 (SC-006), T016 and T036 (SC-007), T045 and T013 (SC-009) |
