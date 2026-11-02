---
description: "Task list for the graph-web core package"
---

# Tasks: Core Package for Embedding the Graph Database in Web Pages

**Input**: Design documents from `/specs/001-core-package/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required. The specification states that every MUST has an automated test (FR-030) and the constitution requires it (principle V), so each story starts with tests that fail before the implementation. Tag every test with a `// covers: FR-…, SC-…` comment; `test:trace` reads the tags.

**Organization**: Tasks are grouped by user story. Phases 3 and 4 run in dependency order, not number order: User Story 2 (data validation and loading) comes before User Story 1 (the client) because the client calls the loader. Both are P1 and together are the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root; `packages/core` is the package of the plan

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Workspace, vendored engine, tooling configuration

- [X] T001 Create the root `package.json` (private; scripts `build:wasm`, `build`, `test`, `test:unit`, `test:browsers`, `test:conformance`, `test:package`, `test:trace`; `pnpm.overrides` resolving `@neo4j-labs/cypherlite-wasm` to `link:vendor/cypherlite-wasm/pkg`) and `pnpm-workspace.yaml` listing `packages/*`
- [X] T002 Add the engine as a git submodule at `vendor/cypherlite` (remote `git@github.com:neo4j-labs/cypherlite.git`, pinned to a commit that builds the browser package) and record the commit, why it was chosen, and the access requirement in `vendor/README.md`
- [X] T003 [P] Create `.gitignore` covering `node_modules`, `dist`, `vendor/cypherlite-wasm/pkg`, `test-results` and `playwright-report`
- [X] T004 Write `scripts/build-wasm.sh`: build the browser package from `vendor/cypherlite` into `vendor/cypherlite-wasm/pkg` following research R7 (release build, `wasm-bindgen-cli` at the version the checkout's lockfile pins, `wasm-opt`, the `wasm32-unknown-unknown` target), make sure `trap.js` and `opfs.js` sit beside `cypherlite.js`, and stop with a clear message when a tool is missing
- [X] T005 Create `packages/core/package.json` (name `graph-web-core`, `type: module`, exports `.`, `./validate`, `./worker`, `./conformance`; `peerDependencies` on `@neo4j-labs/cypherlite-wasm`; `@playwright/test` as an optional peer; no `dependencies`; dev dependencies `typescript`, `vitest`, `@playwright/test`, `vite`, `ajv`) per plan.md
- [X] T006 [P] Create `tsconfig.base.json` at the root and `packages/core/tsconfig.json` (strict, ES2022, declaration files, `outDir` `dist`)
- [X] T007 [P] Create `packages/core/vitest.config.ts` for `packages/core/tests/unit`
- [X] T008 [P] Create `packages/core/playwright.config.ts` with projects `chromium`, `firefox` and `webkit`, serving `packages/core/tests/browser/harness` through Vite
- [X] T009 [P] Create `packages/core/conformance/example-site/vite.config.ts` (multi-page build; imports the engine binary with the `?url` pattern from the engine README)
- [X] T010 Run `pnpm install` and `pnpm run build:wasm`, confirm `vendor/cypherlite-wasm/pkg` holds `cypherlite.js` and `cypherlite_bg.wasm`, and run `pnpm exec playwright install chromium firefox webkit`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, configuration, protocol, engine wrapper, fixtures, browser harness and the traceability check that every story uses

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T011 Define the shared types in `packages/core/src/data/types.ts` (`GraphDocument`, `GraphNode`, `GraphLink`, `PropertyValue`, `Descriptor`) exactly as in `specs/001-core-package/contracts/client-api.md` and `data-model.md`
- [X] T012 [P] Define `Reason` and `GraphError` in `packages/core/src/errors.ts` per `contracts/client-api.md` (`trap`, `timeout`, `lost`, `stopped`, `failed`, `unsupported`, `worker-error`)
- [X] T013 [P] Define the constants in `packages/core/src/config.ts`: failure limit 3, store retry from 100 ms backing off to 500 ms for at most 5000 ms, batch size 1000, visitor timeout default 10000 ms, store name prefix `gw-`, stored-copy directory `graph-web`
- [X] T014 Define the message types of `contracts/worker-protocol.md` in `packages/core/src/worker/protocol.ts` (`init`, `query`, `scoped-add`, `scoped-drop`, `ready`, `init-failed`, `store-retry`, `result`, `error`)
- [X] T015 Write the engine wrapper `packages/core/src/worker/engine.ts`: initialise with the `engineUrl` option, open in memory or `CypherliteDb.open("opfs://gw-<id>")`, `execute(statement, paramsJson)` returning the envelope text unaltered, `reset()`, and a dead flag set at the first trap (using `isWasmTrap`) after which every call answers as a trap
- [X] T016 [P] Create the valid and invalid data-document corpus in `packages/core/tests/fixtures/documents/valid/` and `packages/core/tests/fixtures/documents/invalid/` (one file per rule of `data-model.md`; each invalid file has a sidecar `<name>.expect.json` holding the expected path, for example `nodes[3].properties.id`)
- [X] T017 [P] Create the valid and invalid descriptor corpus in `packages/core/tests/fixtures/descriptors/valid/` and `packages/core/tests/fixtures/descriptors/invalid/` with the same sidecar convention (rules: `version`, `id` pattern, `revision`, `data.url`, `data.nodes`, `data.links`, `indexes`, reserved `shape` and `embeddings`)
- [X] T018 [P] Write `packages/core/tests/fixtures/generate-graph.ts` producing a document and descriptor for N pages with 5 links per page (1,000, 5,000 and 20,000) for the loader and timing tests
- [X] T019 Create the browser harness `packages/core/tests/browser/harness/index.html` and `harness.ts`: loads the core from `src/`, passes `engineUrl` and options from the query string, and exposes the client on `window` so tests can drive it
- [X] T020 Write the smoke test `packages/core/tests/browser/smoke.spec.ts`: the engine initialises in a worker in each browser project and answers `RETURN 1 AS n`
- [X] T021 Write the traceability check `packages/core/tests/trace/check-trace.ts` and the `test:trace` script: read every requirement and success-criterion id from `specs/001-core-package/spec.md`, collect `// covers: FR-…, SC-…` tags from `packages/core/tests`, and fail naming any id with no tagged passing test (SC-005)

**Checkpoint**: Foundation ready - user story work can begin

---

## Phase 3: User Story 2 - Graph data is checked and loaded from one standard document (Priority: P1)

**Goal**: Validate a data document and a descriptor, and load a valid graph exactly as described, or reject it with the path of the first problem and load nothing.

**Independent Test**: Run the validator and loader over the fixture corpus and check the outcomes and the resulting graphs (spec US2; SC-006).

### Tests for User Story 2 (write first; they must fail before implementation)

- [X] T022 [P] [US2] Unit test `packages/core/tests/unit/validate.test.ts`: every valid document passes; every invalid document is rejected with the sidecar's path; parity with `contracts/graph-data.schema.json` via `ajv`; a `scope` key in `properties` is rejected when `scoped` is true. Tag `// covers: FR-013, FR-014, FR-018, SC-006`
- [X] T023 [P] [US2] Unit test `packages/core/tests/unit/descriptor.test.ts`: `validateDescriptor` over the descriptor corpus with parity to `contracts/graph-descriptor.schema.json`, and `checkAgreement` rejecting a differing `revision` or differing node or link counts. Tag `// covers: FR-013, FR-037, FR-039, SC-006`
- [X] T024 [P] [US2] Unit test `packages/core/tests/unit/encode.test.ts` for the parameter encoder: a whole number is an integer and any other number a float; an array with any fractional item is written with every item as a float (`[0.0,1.0,0.5]`); an all-whole array stays integers; a value written `2.0` is an integer. Tag `// covers: FR-019`
- [X] T025 [US2] Browser test `packages/core/tests/browser/loader.spec.ts`: load the fixtures and check nodes, labels (two, none), properties, the `id` property, relationship types and properties, a self-link and repeated links; only the named indexes exist and exist before the nodes; a scoped load adds `scope` to every created node; a descriptor/data mismatch loads nothing. Tag `// covers: FR-015, FR-016, FR-017, FR-018, FR-019, FR-039, SC-006`

### Implementation for User Story 2

- [X] T026 [US2] Implement the data-document validator in `packages/core/src/data/validate.ts`, reporting the path of the first problem and enforcing verbatim: `version` "required, integer, `1`"; `nodes[]` each with `id` "(non-empty string, unique in the document)", `labels` "(non-empty strings, may be empty)", `properties` "(no `id` key; no `scope` key when a load is scoped)"; `links[]` each with `source` and `target` "(ids of nodes in the document)", `type` "(non-empty string)"; a property value is "string, finite number, boolean, or a non-empty array of one of those kinds"; unknown keys are errors
- [X] T027 [US2] Implement `validateDescriptor` and `checkAgreement` in `packages/core/src/data/descriptor.ts` enforcing verbatim: `version` "required, integer, `1`"; `id` "required, 1 to 48 characters from `A-Z a-z 0-9 _ -`"; `revision` "required non-empty string"; `data.url` required; `data.nodes`, `data.links` "required non-negative integers"; `indexes[]` "optional `{label, property}` pairs of non-empty strings"; `shape` and `embeddings` rejected; `checkAgreement` compares a document's `revision` and counts with the descriptor's
- [X] T028 [P] [US2] Implement the parameter encoder in `packages/core/src/worker/encode.ts` that writes the parameters as JSON text, writing a number array that contains any fractional item with every item as a float
- [X] T029 [US2] Implement the loader in `packages/core/src/worker/loader.ts`: validate before any statement; create only the indexes named by the descriptor (or the caller without one) before the nodes; run the two fixed statements of research R2 in batches of 1000, keeping a map from document `id` to element id for one load; add `scope` to every created node when a scope is given; check agreement with the descriptor; leave the instance empty when anything is rejected
- [X] T030 [US2] Create the Node-only entry `packages/core/src/validate.ts` re-exporting `validate`, `validateDescriptor` and `checkAgreement` with no browser APIs, and wire it as the `./validate` export in `packages/core/package.json`
- [X] T031 [US2] Make the US2 tests pass (`pnpm --filter graph-web-core test:unit` and `test:browsers -- loader`) in Chromium, Firefox and WebKit

---

## Phase 4: User Story 1 - A page queries its graph and stays responsive (Priority: P1) 🎯 MVP

**Goal**: A page creates a client, renders at once with placeholders, and receives results when the graph is ready, without freezing.

**Independent Test**: Load a several-thousand-node graph into the harness page, register a query, and measure responsiveness during the load and the time to the first result (spec US1; SC-001, SC-002).

### Tests for User Story 1 (write first)

- [X] T032 [P] [US1] Unit test `packages/core/tests/unit/status.test.ts` for the status machine: `loading` to `ready`, generation starts at 1 and increases only when a replacement is ready. Tag `// covers: FR-002`
- [X] T033 [P] [US1] Unit test `packages/core/tests/unit/subscriptions.test.ts`: a subscription runs when ready and again after a replacement, results after `unsubscribe` are dropped, `onGeneration` listeners run before subscriptions re-run. Tag `// covers: FR-004, FR-005`
- [X] T034 [P] [US1] Unit test `packages/core/tests/unit/events.test.ts`: `status`, `replaced` and `timing` events reach a listener, and with no listener no event work is done and nothing leaves the page. Tag `// covers: FR-036, SC-012`
- [X] T035 [US1] Browser test `packages/core/tests/browser/client.spec.ts`: the first render completes before the instance is ready and links work; status goes `loading` to `ready`; a query resolves with the engine's envelope unaltered; the `engineUrl` option is used and no vendored path appears in the built package. Tag `// covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007`
- [X] T036 [US1] Browser test `packages/core/tests/browser/timing.spec.ts`: during a 20,000-node load the longest unresponsive interval stays under 50 ms (a hard gate); load times for 5,000 and 20,000 pages are recorded through the `timing` event, compared with `packages/core/tests/baselines/<browser>-<environment>.json`, and the run fails above twice the baseline; the first run on a new environment writes the baseline. Tag `// covers: FR-030, FR-031, SC-001, SC-002`

### Implementation for User Story 1

- [X] T037 [P] [US1] Implement the status machine in `packages/core/src/client/status.ts` (`loading`, `ready`, `recovering`, `failed` and the generation counter)
- [X] T038 [P] [US1] Implement the subscription registry in `packages/core/src/client/subscriptions.ts` and the `onGeneration` listeners
- [X] T039 [P] [US1] Implement the typed event emitter in `packages/core/src/client/events.ts` with no work when nothing listens
- [X] T040 [US1] Implement the worker entry `packages/core/src/worker/worker.ts`: handle `init` (descriptor or document, no store yet) by calling the loader, post `ready` with `init`, `open`, `load` and `total` timings, and answer `query` with the envelope text
- [X] T041 [US1] Implement `createClient` in `packages/core/src/client/client.ts`: start the worker (`workerFactory` or `new Worker(new URL("../worker/worker.js", import.meta.url), {type: "module"})`), resolve `data.url` against the descriptor or page URL, expose `generation`, `status`, `query`, `subscribe`, `onGeneration`, `on` and `destroy`, and send `paramsJson` as text
- [X] T042 [US1] Export the public API from `packages/core/src/index.ts` and the worker entry as the `./worker` export in `packages/core/package.json`
- [X] T043 [US1] Make the US1 tests pass in Chromium, Firefox and WebKit and write the first baselines into `packages/core/tests/baselines/`

---

## Phase 5: User Story 3 - The page recovers when the graph fails (Priority: P1)

**Goal**: A crash, a timeout, a worker error or a load that cannot complete is contained: the instance is replaced, subscriptions re-run, and after three failed attempts the status is `failed` with the links and text still usable.

**Independent Test**: Inject each fault (a crashing statement, a runaway statement, a killed worker, an unreachable data location) and watch status, generation and subscriptions (spec US3; SC-004, SC-010).

### Tests for User Story 3 (write first)

- [X] T044 [P] [US3] Unit test `packages/core/tests/unit/failure.test.ts`: attempts count from the initial load; a fault from `ready` is not an attempt; three failures in a row give `failed`; `ready` resets the count; `retry` resets it; no worker support gives `failed` with reason `unsupported` and no attempt. Tag `// covers: FR-009, FR-033, SC-010`
- [X] T045 [P] [US3] Create the fault helpers `packages/core/tests/browser/harness/faults.ts`: a trap statement of about a thousand nested parentheses, a runaway three-way cartesian `count(*)` on a 1,000-page document, a `workerFactory` that returns a worker which throws on a marked message, and a descriptor whose `data.url` is unreachable
- [X] T046 [US3] Browser test `packages/core/tests/browser/faults.spec.ts`: a trap marks the instance dead at the first trap, replaces the worker, increases the generation and re-runs subscriptions with no page reload; a timeout rejects with `timeout`; a call in flight rejects with `lost`; a worker error replaces the worker; an unreachable data location ends in `failed` after exactly three attempts with links usable and the failure wording shown; `retry` starts again; recovery completes within load or restore time plus one second; `replaced` events carry the reason. Tag `// covers: FR-008, FR-009, FR-033, FR-034, FR-036, SC-004, SC-010`
- [X] T047 [P] [US3] Browser test `packages/core/tests/browser/several-clients.spec.ts`: two clients on one page have separate workers, generations and failure counts, and one client's crash leaves the other unaffected. Tag `// covers: FR-035`

### Implementation for User Story 3

- [X] T048 [P] [US3] Implement the failure counter in `packages/core/src/client/failure.ts` (attempt and failure rules of `data-model.md`; the count of failures in a row is 0 to 3)
- [X] T049 [US3] In `packages/core/src/worker/worker.ts` answer every call after the first trap as a trap without touching the engine, and post `init-failed` with `invalid-document`, `invalid-descriptor`, `mismatch`, `store` or `unsupported` as the reason
- [X] T050 [US3] In `packages/core/src/client/client.ts` terminate and replace the worker on a trap, a timeout or a worker error; reject in-flight calls with `lost`; apply per-call timeouts; stop replacing at three failures and set `failed`; reject calls with `failed` while `failed`; implement `retry`; keep every client independent of any module-level state
- [X] T051 [P] [US3] Implement the diagnostic and `failureMessage()` in `packages/core/src/client/diagnostic.ts`: the last reason, the failure count and the engine's error text, with wording that suggests reporting a `failed` status as an issue at the configurable `issueUrl`, and sends nothing
- [X] T052 [US3] Make the US3 tests pass in Chromium, Firefox and WebKit

---

## Phase 6: User Story 4 - A site with client-side routing keeps one graph across navigation (Priority: P2)

**Goal**: With the `persistent` profile one worker and one instance live for the visit; page-scoped data is added on arrival and removed on departure.

**Independent Test**: In the harness site with a minimal navigation script, move between pages by link, history and script, and check the worker, generation and page data (spec US4; SC-009).

### Tests for User Story 4 (write first)

- [X] T053 [US4] Browser test `packages/core/tests/browser/persistent.spec.ts`: over ten navigations (link click, history back and forward, script) the worker and generation are unchanged; a view's scoped data is removed on departure and other views' data is untouched; data is added again after a replacement before subscriptions re-run; a navigation during a query or during loading ignores the departed page's result; a full reload starts a new worker; a configuration naming `multi-page` on a site with a router uses `multi-page`; with a descriptor and a store a matching revision restores instead of replaying. Tag `// covers: FR-020, FR-025, FR-026, FR-028, SC-009`

### Implementation for User Story 4

- [X] T054 [P] [US4] Implement view scopes and `addScoped` and `dropScope` in `packages/core/src/client/scope.ts` and the `scoped-add` and `scoped-drop` handling in `packages/core/src/worker/worker.ts` (a scope identifies a page view, not a page; dropping is a detach-delete of the nodes with that `scope`)
- [X] T055 [US4] Implement the `persistent` profile in `packages/core/src/profiles/persistent.ts`: one client in module state, created on first call, surviving route changes
- [X] T056 [US4] Implement `createSiteClient` in `packages/core/src/profiles/index.ts` choosing the profile from the `navigation` option (`client-routing` or `multi-page`; the configured value decides) and defaulting `store` per profile
- [X] T057 [P] [US4] Create the minimal navigation script for the harness site in `packages/core/tests/browser/harness/router.ts` (history API, link interception, programmatic navigation) used by the persistent tests and the example site
- [X] T058 [US4] Make the US4 tests pass in Chromium, Firefox and WebKit

---

## Phase 7: User Story 5 - A multi-page site restores its graph on every page (Priority: P2)

**Goal**: With the `per-page` profile each page starts its own worker and restores from the store, falling back to replay when the store is empty, locked or stale, and the stored copy of the descriptor decides staleness.

**Independent Test**: In the harness as separate pages, visit pages in sequence, change the descriptor's revision, hold the store from a second page, empty the store, and leave pages while scoped data exists (spec US5; SC-003, SC-007, SC-013).

### Tests for User Story 5 (write first)

- [X] T059 [P] [US5] Unit test `packages/core/tests/unit/store-retry.test.ts` for the retry schedule: starts at 100 ms, backs off to 500 ms, gives up at 5000 ms in total. Tag `// covers: FR-012`
- [X] T060 [US5] Browser test `packages/core/tests/browser/stored-copy.spec.ts`: the stored copy is removed before a reset and written last (an interrupted load leaves none); a matching revision restores with no request for the data document; a store with fewer nodes than `data.nodes` is treated as stale; no bookkeeping node is in the graph; a graph without a descriptor never uses a store. Tag `// covers: FR-023, FR-037, FR-038, SC-013`
- [X] T061 [US5] Browser test `packages/core/tests/browser/per-page.spec.ts`: restore from a matching store; a changed revision resets the store and shows only the new data; a store held by a second page falls back to memory within five seconds plus the replay time; a worker ended mid-query is covered by the retry; two graphs with different `id`s keep separate stores; a start-up sweep removes leftover scoped data and a hidden page removes its own view's data. Tag `// covers: FR-021, FR-022, FR-024, FR-027, SC-007`
- [X] T062 [P] [US5] Extend `packages/core/tests/browser/timing.spec.ts` with the restore of a 5,000-page graph (target 0.55 s, regression rule of FR-031). Tag `// covers: SC-003`

### Implementation for User Story 5

- [X] T063 [P] [US5] Implement the store open with the bounded retry in `packages/core/src/worker/store.ts` (`opfs://gw-<id>`; retry from 100 ms to 500 ms for at most 5000 ms, then continue in memory with no stored copy written), posting `store-retry` messages
- [X] T064 [P] [US5] Implement the stored copy in `packages/core/src/worker/stored-copy.ts`: read, write and remove a file `graph-web/<id>.json` at the origin-private root with a synchronous access handle, outside the engine's `cypherlite/` directory
- [X] T065 [P] [US5] Implement the start-up sweep (remove every node with a `scope` property) in `packages/core/src/worker/sweep.ts`
- [X] T066 [US5] Extend the `init` handling in `packages/core/src/worker/worker.ts` with the start-up of `contracts/worker-protocol.md` (open store, read stored copy, restore on equal `revision` without fetching the data, sweep, compare the node count with `data.nodes`, otherwise remove the copy, reset if not empty, fetch, validate, check agreement, create indexes, load, write the copy last)
- [X] T067 [US5] Implement the `per-page` profile in `packages/core/src/profiles/per-page.ts`: a new client per page, store on by default when a descriptor is given, and departure from `pagehide` that drops the page view's scoped data
- [X] T068 [US5] Make the US5 tests pass in Chromium, Firefox and WebKit (in a browser without the file access the store needs, check the replay fallback instead)

---

## Phase 8: User Story 6 - Statements typed by a visitor can be stopped (Priority: P2)

**Goal**: A visitor-typed statement ends at a timeout or when the visitor stops it, and the graph returns.

**Independent Test**: Run a statement that does not finish, once with a timeout and once with a stop action, and check that the page and the graph recover (spec US6).

### Tests for User Story 6 (write first)

- [ ] T069 [US6] Browser test `packages/core/tests/browser/visitor.spec.ts`: `run()` applies the default timeout (configured short in the test) and fails with `timeout`; `stop()` fails the call with `stopped`, replaces the instance and re-runs the page's subscriptions; no statement ever runs on the main thread. Tag `// covers: FR-010, FR-011`

### Implementation for User Story 6

- [ ] T070 [US6] Implement `run()` returning `{result, stop}` in `packages/core/src/client/client.ts`, applying `visitorTimeoutMs` (default 10000) when no timeout is given, with `stop()` terminating and replacing the worker and emitting `replaced` with the reason `stopped`
- [ ] T071 [US6] Make the US6 tests pass in Chromium, Firefox and WebKit

---

## Phase 9: User Story 7 - An adapter author checks an adapter against a shared example site (Priority: P3)

**Goal**: The package ships an example site and a conformance check that every adapter must pass, under both profiles.

**Independent Test**: Run the conformance check against the example site hosted without any framework adapter, under both profiles (spec US7; SC-008).

### Tests for User Story 7 (write first)

- [ ] T072 [US7] Browser test `packages/core/tests/browser/conformance.spec.ts`: `runConformance` passes for the example site under `client-routing` and `multi-page`, and a deliberately broken variant (subscriptions not re-run after a replacement) fails scenario C-04 with the behavior named in the report. Tag `// covers: FR-029, SC-008, SC-011`
- [ ] T073 [P] [US7] Package test `packages/core/tests/package/clean-install.test.ts`: `pnpm pack` the core, install the tarball in a clean temporary project outside the repository with the engine installed beside it, bundle a page with Vite, and check it works with the binary URL passed as an option. Tag `// covers: FR-032`

### Implementation for User Story 7

- [ ] T074 [P] [US7] Create the example data in `packages/core/conformance/example-site/`: `descriptor.json`, `graph.json` (a few hundred pages with links, produced by a script `make-example.ts` using the fixture generator), and `broken-descriptor.json` whose `data.url` is unreachable
- [ ] T075 [US7] Create the plain example pages in `packages/core/conformance/example-site/`: an index, several content pages that each run a per-page query and show the shared graph's page count, a page that adds and drops scoped data, and a page using the broken descriptor; use `createSiteClient` and the router script for `client-routing`
- [ ] T076 [US7] Define the scenarios C-01 to C-11 of `contracts/conformance.md` in `packages/core/conformance/scenarios.ts` (framework-neutral, driven by page behavior alone)
- [ ] T077 [US7] Implement `runConformance`, `exampleDescriptor` and `exampleDocument` in `packages/core/conformance/run.ts` (Playwright as an optional peer) and wire the `./conformance` export and the `test:conformance` script in `packages/core/package.json`
- [ ] T078 [US7] Update scenario C-03 in `specs/001-core-package/contracts/conformance.md` to use the unreachable data location instead of a crashing document, and update the example-site description there
- [ ] T079 [US7] Make the US7 tests pass in Chromium, Firefox and WebKit

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Results, documentation and the checks that span stories

- [ ] T080 [P] Write `packages/core/README.md` (install, the engine peer dependency and binary URL, the two profiles, the descriptor and data formats, the `failed` state, the supported browsers measured)
- [ ] T081 Update the Commands and Architecture sections of `CLAUDE.md` with the pnpm workspace layout, the scripts of T001 and the `packages/core` structure
- [ ] T082 Record the browser and worker measurements of loading (1,000, 5,000 and 20,000 pages) and of restore in `design/adr/ADR-002-graph-data-format.md` section 4 and `design/adr/ADR-003-graph-descriptor.md` section 4, replacing the Node-only figures and the unverified items they settle
- [ ] T083 Decide how continuous integration reaches the private engine submodule (credentials, or a cached engine build) and document the decision in `vendor/README.md`
- [ ] T084 Run `pnpm test`, `pnpm --filter graph-web-core test:conformance`, `test:package` and `test:trace` and confirm every requirement and success criterion has a passing test (SC-005)
- [ ] T085 Run the scenarios of `specs/001-core-package/quickstart.md` end to end and correct the quickstart where the commands differ
- [ ] T086 Check the work against the constitution (principles I to VI) and note the result in `specs/001-core-package/plan.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup and blocks every story.
- **User Story 2 (Phase 3)** depends on Foundational. It must finish before User Story 1, because the client calls the loader (T029).
- **User Story 1 (Phase 4)** depends on Phase 3 (the loader) and Foundational. Phases 3 and 4 together are the MVP: a graph that loads and answers queries without freezing the page.
- **User Story 3 (Phase 5)** depends on Phase 4 (it extends the worker T040 and the client T041).
- **User Story 4 (Phase 6)** depends on Phase 5 (replacement and `lost` handling) and uses the scoped loading of Phase 3 (T054).
- **User Story 5 (Phase 7)** depends on Phase 3 (descriptor checks and loading) and Phase 5 (failure handling); it extends the `init` handling of the worker (T066).
- **User Story 6 (Phase 8)** depends on Phase 5 (it relies on replacing the worker).
- **User Story 7 (Phase 9)** depends on Phases 4 to 7, since the conformance check drives both profiles.
- **Polish (Phase 10)** depends on all stories.

### Within Each User Story

- Tests are written first and must fail before the implementation.
- Types and pure modules before the worker, the worker before the client, the client before the profiles.
- Make the story's tests pass in all three browsers before moving on.

### Parallel Opportunities

- In Phase 1, the `.gitignore` and the three configuration files can be written at the same time as each other once the root files exist.
- In Phase 2, the types, errors, configuration and fixture tasks touch different files and can run together; the harness (T019) and the traceability check (T021) are independent of each other.
- In each story, the tests marked [P] touch different files and can run together, and so can the [P] implementation modules.
- After Phase 5, Phases 6, 7 and 8 can proceed in parallel by different people, since they add different files (`persistent.ts`, `per-page.ts` with the store modules, and `run()`); the shared edits to `worker.ts` and `client.ts` must be merged in the order the phases finish.

## Parallel Example: User Story 2

```text
# Launch the unit tests together:
Task: "Unit test validate.test.ts in packages/core/tests/unit/validate.test.ts"
Task: "Unit test descriptor.test.ts in packages/core/tests/unit/descriptor.test.ts"
Task: "Unit test encode.test.ts in packages/core/tests/unit/encode.test.ts"

# Then the independent implementation modules:
Task: "Parameter encoder in packages/core/src/worker/encode.ts"
Task: "Node-only entry in packages/core/src/validate.ts"
```

## Implementation Strategy

### MVP first (Phases 1 to 4)

1. Complete Setup and Foundational.
2. Complete User Story 2, then User Story 1.
3. Stop and validate: a graph of several thousand nodes loads in a worker, the page stays responsive, and a query returns the engine's envelope unaltered, in all three browsers.

### Incremental delivery

1. Add User Story 3: faults are contained; the failure state and `retry` exist.
2. Add User Story 4 or 5, depending on which site the first adapter targets. The Observable and Astro adapters need both.
3. Add User Story 6 when a page with a query box needs it.
4. Add User Story 7 before the first adapter, so it can be checked against the example site.

## Notes

- [P] tasks touch different files and have no dependency on an incomplete task.
- The `[Story]` label maps a task to its user story; Setup, Foundational and Polish tasks have none.
- Every test carries a `// covers:` tag so `test:trace` can prove SC-005.
- The engine is vendored from a private repository; Phase 1 needs access to it.
- Commit after each task or logical group, citing the ADR number in the message.
