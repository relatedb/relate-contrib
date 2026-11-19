---
description: "Task list for the relate-phaser package and the path explorer's adoption of it"
---

# Tasks: The relate-phaser Package, Extracted from the Path Explorer

**Input**: Design documents from `/specs/009-relate-phaser-package/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/package-api.md, quickstart.md. Implements ADR-012 (accepted 2026-11-18) on ADR-001, ADR-009 and ADR-011. Decisions R1 to R10 are in research.md.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers-ph: FR-…, SC-…` comment naming the requirements it checks.

**Organization**: Tasks are grouped by user story. US1 to US3 are P1 and together are the MVP. US1 and US2 build the package and run in order (the cache uses the queue); US3 adopts both in the demo. US4 and US5 add the throwaway client and the version watcher to the package and to the demo. US6 and US7 finish the package's checks and README.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root. The core (`packages/web`) does not change (spec Assumptions): do not edit it. The demo's game logic (statements, scoring, robots, signposts, drawing, undo) does not change.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- A finding that changes ADR-012 is written into it as a dated amendment in the task that finds it.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The workspace project, its configuration, its test helpers and the trace check

- [X] T001 Create `packages/phaser/package.json` (`name` `@relate/contrib-phaser`, `version` `0.1.0`, `private` true, `type` module, `sideEffects` false, `exports` `.` pointing at `dist/index.js` and `dist/index.d.ts`, `peerDependencies` `@relate/contrib-web` `*` and `phaser` `^4.0.0` with `peerDependenciesMeta` marking `phaser` optional; `devDependencies` as `packages/react-admin/package.json` has them for `@relate/relate-wasm`, `@relate/contrib-web`, `@types/node`, `tsx`, `typescript`, `vitest`; scripts `build`, `typecheck`, `test:phaser`, `test:phaser-package`, `test:phaser-trace` written like react-admin's), plus `packages/phaser/tsconfig.json`, `vitest.config.ts` and `vitest.package.config.ts` copied from `packages/react-admin` with the names changed (FR-001, research R10)
- [X] T002 [P] Create `packages/phaser/tests/trace/check-trace.ts`, modelled on `packages/react-admin/tests/trace/check-trace.ts`: read `specs/009-relate-phaser-package/spec.md` for `**FR-nnn**` and `**SC-nnn**`, read `// covers-ph:` tags from the test files of the package and of the demo's browser tests, require the tagged files to pass in `reports/` (FR-017)
- [X] T003 [P] Create `packages/phaser/tests/helpers/engine.ts` (the in-process engine, a query function over the real WebAssembly build in Node, as `demos/phaser-path-explorer/tests/helpers/engine.ts` and `packages/react-admin/tests/helpers/in-process-client.ts` do; research R2) and `packages/phaser/tests/helpers/fake-client.ts` (a client double with `query`, `status`, `generation`, `on("status", …)` and `onGeneration` and methods that emit a status change, a new generation and a `lost` rejection; research R3)
- [X] T004 Create `packages/phaser/src/index.ts` as an empty export, run `pnpm install` and `pnpm --filter @relate/contrib-phaser typecheck` to confirm the workspace resolves the package; fix configuration until it does

---

## Phase 2: Foundational

**Purpose**: Nothing blocks the stories beyond Phase 1. The error type is built with its first user in US1.

---

## Phase 3: User Story 1 - The queue (Priority: P1) 🎯 MVP

**Goal**: Statements go to the engine in order without the frame loop waiting, and a rejection says whose fault it was.

**Independent Test**: build a queue over the in-process engine, push statements without awaiting, and check results, order, errors and counts.

### Tests

- [X] T005 [US1] Create `packages/phaser/tests/unit/bridge.test.ts` (`// covers-ph: FR-003, FR-004, FR-005, FR-006, SC-001`): port `demos/phaser-path-explorer/tests/bridge.test.ts` (order of three, `pending`, a refused statement then a later one, `idle`), and add: 1,000 statements pushed without awaiting leave the engine's state in the order pushed (SC-001); an engine error rejects with `StatementError` carrying the message; a `GraphError` reason `lost`, `timeout` and `failed` from a fake client passes through unchanged; `Bridge.forClient` behaves as the query-function form; `onSettle` is called once when the queue empties and an unsubscribed listener is not called; a listener that throws does not stop the queue; no retry after a rejection (spec US1 scenarios 1 to 6, edge cases)

### Implementation

- [X] T006 [US1] Create `packages/phaser/src/errors.ts` (`StatementError`, extends `Error`, same message as the engine's) and `packages/phaser/src/bridge.ts` (`Bridge` moved from `demos/phaser-path-explorer/src/game/bridge.ts`, with `forClient`, `onSettle`, `idle` built on settle notification rather than polling, `GraphError` passed through and an envelope error turned into `StatementError`; contract `contracts/package-api.md` "Queue"; research R9) and export both from `src/index.ts` (FR-003 to FR-006)
- [X] T007 [US1] Run `pnpm --filter @relate/contrib-phaser test:phaser` until T005 passes; the Queue entity in `data-model.md` (`Queue.pending`) is the count the tests assert

**Checkpoint**: the queue works and is tested alone.

---

## Phase 4: User Story 2 - The cache (Priority: P1)

**Goal**: A cache the frame loop reads and replies keep current, with a pending marker, rollback, reload after a new generation, and a status that follows the client.

**Independent Test**: build a cache over a trivial state and the in-process engine; run actions, force a rejection and drive a generation and statuses with the fake client.

### Tests

- [X] T008 [US2] Create `packages/phaser/tests/unit/cache.test.ts` (`// covers-ph: FR-007, FR-008, FR-009, FR-010, FR-011, FR-012`): a commit bumps `version` by one (`data-model.md` `Cache.version`); an action with an optimistic change shows it at once and holds `pending` (`Cache.pending`) until its reply is committed; a second action queues behind the first and its optimistic part applies when its turn comes; a rejected action runs its undo, returns `{ ok: false, error }`, throws nothing and moves the version; a new generation runs the load once and commits the patch in one step, and the first ready does not load twice (research R4); an action rejected with `lost` is rolled back and not repeated; a rejected reload keeps the previous state and the client's status; `status` (`Cache.status`, the four values) starts from the client's and follows its `status` event; in `failed` an action resolves at once with `GraphError` reason `failed` and queues nothing; `destroy` stops following; two caches over one client are independent; a throwing `commit` patch leaves the state unchanged and the error reaches the caller (spec US2 scenarios 1 to 8, edge cases)

### Implementation

- [X] T009 [US2] Create `packages/phaser/src/cache.ts` (`ReplyCache<S>`: state, `version`, `pending`, `status`, `loadedGeneration` per `data-model.md` Cache; `start`, `commit`, `act` in the closure shape of research R1, `reload` that applies the game's load patch in one commit, a generation listener that catches its own errors, `destroy`; the contract's `CacheClient` is the narrow client interface of research R3) and export it from `src/index.ts`. It contains no undo, no snapshot across actions, no knowledge states and no statements (FR-007 to FR-012; contract "Cache")
- [X] T010 [US2] Run `pnpm --filter @relate/contrib-phaser test:phaser` until T008 passes

**Checkpoint**: the queue and the cache work and are tested in the package.

---

## Phase 5: User Story 3 - The path explorer runs on the package (Priority: P1)

**Goal**: The demo's queue and generic cache mechanism are replaced by the package; its game logic is unchanged; it rebuilds its board after an engine replacement.

**Independent Test**: the demo's unit tests pass as before, and a browser run that traps the engine sees the board rebuilt.

### Tests

- [X] T011 [US3] Create `demos/phaser-path-explorer/playwright.config.ts` and `demos/phaser-path-explorer/tests/browser/recovery.spec.ts` (`// covers-ph: FR-015, FR-016, SC-002, SC-006`), modelled on `demos/react-admin/playwright.config.ts` and its browser tests: three projects, a built preview; the test plays one move, sends a statement of about a thousand nested parentheses through the dev hook the demo exposes (`window.__bridge`, which the demo already sets in development; the test config builds with it enabled or uses the dev server), waits for the client to return to `ready`, and checks the board matches the graph and the move was not repeated (SC-002); it also starts the splash's demo world beside the saved game, reloads, and checks the saved game's data is unchanged and the demo's is gone (SC-006). Add `@playwright/test` to the demo's `devDependencies`, the script `test:phaser-browsers` to the demo's `package.json` and `reports/` to its ignored paths

### Implementation

- [X] T012 [US3] Add `"@relate/contrib-phaser": "workspace:*"` to `demos/phaser-path-explorer/package.json` `dependencies` and build the package so the demo resolves it (`pnpm -r build` or the filter build)
- [X] T013 [US3] In `demos/phaser-path-explorer`, move `tests/bridge.test.ts` into the package (its cases are in T005, so delete the demo's copy), point `tests/helpers/engine.ts`, `tests/state.test.ts`, `src/demo.ts` and `src/main.ts` at `Bridge` and `Envelope`/`QueryFn` from `@relate/contrib-phaser`, and delete `src/game/bridge.ts` so no copy of the queue remains (FR-015, SC-003)
- [X] T014 [US3] In `demos/phaser-path-explorer/src/game/state.ts`, make `GameState` own a `ReplyCache<GameState>` whose state is the game state itself: `version` and `pending` read from the cache, `touch()` is `cache.commit(() => {})`, and `act` delegates to `cache.act` with the demo's message, `applied` flag and one-level undo snapshot kept around it; `load()` becomes the cache's load function so one reload rebuilds the board. Game logic, statements and `MapScene`'s use of the public fields are unchanged (FR-015, FR-016; research R1, R5)
- [X] T015 [US3] In `demos/phaser-path-explorer/src/main.ts`, build the queue with `Bridge.forClient(client)` for the real game, start the cache, and keep it following the client so a new generation rebuilds the board; keep the dev hooks. Run `pnpm --filter phaser-path-explorer test` and confirm all 202 tests that passed before still pass (SC-003), then `pnpm --filter phaser-path-explorer test:phaser-browsers` until T011's recovery case passes

**Checkpoint**: the demo runs on the package and recovers from an engine replacement.

---

## Phase 6: User Story 4 - The throwaway client (Priority: P2)

**Goal**: A second graph from a seed document that never touches saved data.

**Independent Test**: create a throwaway client beside an application client in the browser run, reload, and compare.

### Tests

- [X] T016 [P] [US4] Create `packages/phaser/tests/unit/throwaway.test.ts` (`// covers-ph: FR-013`): the call passes `graph: { document }` and `store: false` to `createClient` (observed through an injected `workerFactory` or a stubbed `createClient`); an options object with an `application` key throws `TypeError` before any client is made; the type check refuses `application`, `graph` and `store` (a `// @ts-expect-error` line); the result is an ordinary client (spec US4 scenarios 1 and 2; research R8)

### Implementation

- [X] T017 [US4] Create `packages/phaser/src/throwaway.ts` (`createThrowawayClient`, per contract "Throwaway client") and export it
- [X] T018 [US4] In `demos/phaser-path-explorer/src/main.ts`, build the splash's demo world with `createThrowawayClient` in place of the direct `createClient` call (FR-015); T011's second case (SC-006) covers it in the browser

**Checkpoint**: the throwaway client exists and the splash's demo world uses it.

---

## Phase 7: User Story 5 - The version watcher and scene helper (Priority: P2)

**Goal**: A scene redraws only when something changed.

**Independent Test**: drive a scene double's update event and count redraws.

### Tests

- [X] T019 [P] [US5] Create `packages/phaser/tests/unit/watch.test.ts` (`// covers-ph: FR-014, SC-005`): `versionWatch` reports false with no commit, true once for one or several commits, then false; `watchCache` over a scene double (an object with `events.on`/`off` that tests emit "update" and "shutdown" on) calls `redraw` once per change and not otherwise; 600 updates with commits on 5 give 5 redraws (SC-005); after "shutdown" it calls nothing and has removed its listeners; a cache whose version never changes never redraws (spec US5 scenarios 1 to 4, edge cases)

### Implementation

- [X] T020 [US5] Create `packages/phaser/src/watch.ts` (`versionWatch` with no Phaser dependency, and `watchCache` built on it with a structural scene type and the `"update"` and `"shutdown"` event names; contract "Scene helper"; research R6) and export both
- [X] T021 [US5] In `demos/phaser-path-explorer/src/game/MapScene.ts`, replace the explicit `this.drawn !== this.state.version` comparison in `update()` with a `versionWatch` over the state's cache, keeping the order of the night, the robots, the finale and the redraw as it is; run `pnpm --filter phaser-path-explorer test` and the browser run again

**Checkpoint**: the watcher is tested and the demo uses it without reordering a frame.

---

## Phase 8: User Story 6 - Install and checks (Priority: P2)

**Goal**: The package installs cleanly and is checked with the rest of the workspace.

**Independent Test**: pack, install in a clean project with the core and Phaser, build, run an action, and run the trace check.

### Tests

- [X] T022 [US6] Create `packages/phaser/tests/package/clean-install.test.ts` (`// covers-ph: FR-001, FR-002, SC-004`), modelled on `packages/react-admin/tests/package/clean-install.test.ts`: pack the package, install it with `@relate/contrib-web` and `phaser` into a clean temporary project, build a page that creates a queue and a cache and runs one action (the README's first example, so the check also confirms the README's code runs; SC-004's fifteen-minute figure is a reader check, labelled unmeasured and not asserted), and assert the manifest's version is below 1.0, `@relate/contrib-web` and `phaser` are peers and neither is bundled, and the installed package lists no statements, seeding or drawing among its exports

### Implementation

- [X] T023 [US6] Add the root scripts to `package.json`: `test:phaser`, `test:phaser-browsers`, `test:phaser-package` and `test:phaser-trace` (filtered to `@relate/contrib-phaser` and, for the browsers, `phaser-path-explorer`), and add each to the aggregate `test:units`, `test:browsers-all`, `test:packages-all` and `test:traces-all`; add the four commands and the package and demo layout to `CLAUDE.md` (FR-017)
- [X] T024 [US6] Run `pnpm test:phaser-trace` and fix any requirement or success criterion without a passing tagged test, then `pnpm test:phaser-package`

---

## Phase 9: User Story 7 - Documentation (Priority: P3)

**Goal**: The README says what the package does and what stays in the game.

**Independent Test**: read the README alone and list what it provides and leaves out.

- [X] T025 [US7] Create `packages/phaser/README.md` (`// covers-ph` is not available in Markdown, so T022 and T024 check its example and its required headings): lead with the frame loop in front of an asynchronous engine; show the queue, the cache, the throwaway client and the scene helper with the example T022 runs; state what stays in the game (statements, seeding, partial reads with the path explorer as the reference and not enforced, hex drawing); state the limits of the first release (unstable below 1.0, sized for turn-sized actions, several graphs per game open, per ADR-012 4 and RFC-008 7.5 and 7.6) (FR-018)
- [X] T026 [US7] Add to `packages/phaser/tests/package/clean-install.test.ts` an assertion that the README contains the headings the task names and the example's code block (`// covers-ph: FR-018`)

---

## Phase 10: Polish and Cross-Cutting Concerns

- [X] T027 [P] Add a dated amendment to `design/adr/ADR-011-phaser-path-explorer.md` saying the bridge and the generic cache mechanism now live in `@relate/contrib-phaser` (ADR-012) and that its 2.6 stands as the behaviour they implement; update `demos/phaser-path-explorer/README.md` to point at the package
- [X] T028 [P] Update `design/rfc/RFC-008-phaser-integration-package.md` open questions 7.1, 7.3 and 7.4 with a pointer to ADR-012's resolution, and leave 7.2, 7.5 and 7.6 open
- [X] T029 Run the full set once: `pnpm -r build`, `pnpm test:phaser`, `pnpm --filter phaser-path-explorer test`, `pnpm test:phaser-browsers`, `pnpm test:phaser-package`, `pnpm test:phaser-trace`, and `pnpm test:units` to confirm no other package changed; follow `quickstart.md` scenarios 1 to 6 and record any figure with its method and environment, labelled as a single run
- [X] T030 Set the spec's `**Status**` to Implemented and the commit or PR text cites ADR-012

---

## Dependencies and Execution Order

- Phase 1 first. US1, then US2 (the cache uses the queue). US3 needs US1 and US2. US4 and US5 need the package built (US1, US2) and can run in parallel with each other; their demo tasks (T018, T021) need US3. US6 needs US1 to US5 for a meaningful install test; US7 needs the package's final exports. Polish last.
- [P] tasks within a phase touch different files: T002 and T003 in Phase 1; T016 and T019 (a new test file each) once the package builds; T027 and T028 in Polish.

### Parallel example

After T010: run T016 and T019 together (different test files), then T017 and T020 together (different source files).

## Implementation Strategy

- **MVP**: US1 to US3, which is a working queue and cache and a demo running on them with its 202 tests passing and a recovery test.
- Then US4 and US5 (the two small helpers and their demo adoption), then US6 and US7 (checks and README), then Polish.
- Stop at any checkpoint: the package and the demo stay working at each.
