---
description: "Task list for application graphs in the core package"
---

# Tasks: Application Graphs in the Core Package

**Input**: Design documents from `/specs/006-application-graphs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-009 (accepted 2026-11-08, amended 2026-11-09 in §6) on ADR-001 to ADR-003 and SPIKE-008. Planning decisions D-1 to D-9 and risks R-1 to R-4 are in research.md.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers-app: FR-…, SC-…` comment (not `// covers:`, which belongs to specification 001); `test:application-trace` fails for any untagged requirement (FR-029).

**Organization**: Tasks are grouped by user story. US1 to US4 are P1 and together are the MVP; they run in order because each extends `lifecycle.ts` and the client branch the one before starts. US5 to US7 are P2. The lifecycle modules take an `Engine`, so their tests run in Node against the real engine in memory (research P-2); only what needs a store (locks, `opfs://`, termination) is tested in the browsers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root. `packages/web` is the only package that changes (FR-027): do not edit `packages/astro`, `packages/nextjs`, `packages/observable`, `packages/sveltekit`, the content cache (`src/worker/stored-copy.ts`, `src/profiles/`), the conformance site or `vendor/`.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- Every behaviour whose finding amends ADR-009 is written into ADR-009 §6 as a dated entry in the task that finds it.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test configuration, scripts, trace check

- [X] T001 Create `packages/web/vitest.application.config.ts` (include `tests/application/unit/**/*.test.ts`, environment `node`) and `packages/web/playwright.application.config.ts` (copy of `playwright.config.ts` with `testDir: "tests/application/browser"`, ports 5176 for the harness server and no example-site server, the same three projects, JSON report to `reports/application-playwright.json`); do not edit `vitest.config.ts` or `playwright.config.ts`
- [X] T002 Add scripts to `packages/web/package.json`: `test:application` (`vitest run --config vitest.application.config.ts --reporter=default --reporter=json --outputFile.json=reports/application-vitest.json`), `test:application-browsers` (`playwright test --config playwright.application.config.ts`), `test:application-trace` (`tsx tests/application/trace/check-trace-application.ts`); add the same three to the root `package.json` as `pnpm --filter @relate/contrib-web …`, as the adapters have
- [X] T003 [P] Create `packages/web/tests/application/trace/check-trace-application.ts`, modelled on `packages/web/tests/trace/check-trace.ts`: read `specs/006-application-graphs/spec.md` for `**FR-nnn**` and `**SC-nnn**` ids, read `// covers-app: …` tags from `tests/application/**/*.{test,spec}.ts`, and (unless `--static`) require every tagged file to pass in `reports/application-vitest.json` and `reports/application-playwright.json`; fail naming each untagged id (FR-029)
- [X] T004 [P] Create the browser harness skeleton `packages/web/tests/application/browser/harness/{vite.config.ts,index.html,harness.ts}`: a Vite root importing the built core from `dist`, `worker.format: "es"`, `optimizeDeps.exclude: ["@relate/relate-wasm"]`, `server.fs.allow` the repository root (as `tests/browser/harness/vite.config.ts`); `harness.ts` exposes `window.app` with `createClient`, `inRanges` and a `make(options)` that stores the client on `window.client`, and sets `document.documentElement.dataset.harness = "ready"`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Constants, types, the engine seam, protocol shapes, failure handling. No behaviour changes without an `application` option.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Edit `packages/web/src/config.ts`: add `APP_STORE_PREFIX = "app-"`, `APP_NAME_PATTERN = /^[A-Za-z0-9_-]{1,60}$/`, `MARKER_LABEL = "_RelateApplication"`, `MARKER_FORMAT = 1`, `WAIT_RETRY_MS = 1000`; leave `STORE_PREFIX`, `STORE_RETRY` and every existing export unchanged
- [X] T006 [P] Create `packages/web/src/application/types.ts` with the public types of [contracts/application-api.md](contracts/application-api.md) and [data-model.md](data-model.md): `ApplicationOptions`, `MigrationStep`, `RangeStep` (`{ kind: "ranges", label, property, step, statement }`), `StorageStatus` (`kind`: `durable` | `memory` | `waiting`; `reason`: `unavailable` | `locked` | `error`; `persisted`: boolean | null), `ExportEnvelope`, `LossKind` (`integer-beyond-2^53` | `whole-number-float` | `date` | `duration` | `point` | `empty-list` | `node-without-string-id`), `LossReport`
- [X] T007 Edit `packages/web/src/errors.ts`: add the reason `export-loss` to `Reason`; edit `packages/web/src/client/types.ts`: add `application?: ApplicationOptions` to `ClientOptions` (with `graph` becoming optional, checked at creation), widen `Diagnostic.reason` with `store-unmarked`, `store-newer`, `import-interrupted`, `store-unreadable`, `unavailable`, `migration-failed`, add `storage`, `resetApplication`, `exportApplication`, `importApplication`, `requestPersistence`, `storageEstimate` to `Client`, and add the `storage` event to `Events` in `packages/web/src/client/events.ts`. Existing members and event payloads unchanged (FR-001)
- [X] T008 Edit `packages/web/src/worker/engine.ts`: make `store` take the prefix (`Engine.store(name, prefix = STORE_PREFIX)`, so existing calls are unchanged), add `Engine.fromDb(db: RelateDb)` (a seam for tests, not exported from the package), and add `release()` that calls the database's `free()` and marks the wrapper dead; keep the trap handling and `StorageLockedError` as they are
- [X] T009 [P] Edit `packages/web/src/worker/protocol.ts` per [contracts/worker-protocol.md](contracts/worker-protocol.md): an `ApplicationInit` shape on `InitMessage` (`application`: `name`, `version`, `intent` `"open"` | `"reset"`, `seed` `{ document }` or `{ dataUrl, descriptor? }`, `indexes`, `migrations`, `onUnavailable`, `onError`, `whenLocked`), messages `export-application`, `import-application`, `storage`, `application-exported`, and the new `InitFailReason` members; existing messages unchanged
- [X] T010 [P] Edit `packages/web/src/client/failure.ts` so that `attemptFailed` gives up at once (as it does for `unsupported`) for `store-unmarked`, `store-newer`, `import-interrupted`, `store-unreadable`, `unavailable` and `migration-failed`, without counting them as attempts towards `FAILURE_LIMIT` (D-3); edit `packages/web/src/client/diagnostic.ts` with wording for each new reason (name what was found, say the store is unchanged, name `resetApplication()` as the way out for the first four; for `migration-failed` include the message the worker gave)
- [X] T011 [P] Create `packages/web/tests/application/unit/helpers.ts`: `realEngine()` initialises `@relate/relate-wasm` from `node_modules/@relate/relate-wasm/relate_bg.wasm` bytes (once) and returns `Engine.fromDb(new RelateDb())`; `query(engine, statement, params)` returns the parsed envelope and throws on `error`
- [X] T012 [P] Unit tests for the foundations in `packages/web/tests/application/unit/foundations.test.ts`: `failure.ts` gives up at once for each new reason and still allows three attempts for `trap` (existing test file `tests/unit/failure.test.ts` stays unchanged and passing); `diagnosticMessage` words each new reason and mentions `resetApplication` for the first four; `Engine.store` default prefix is `rel-` (assert through the URI the engine is opened with, using a stub)

**Checkpoint**: `pnpm --filter @relate/contrib-web typecheck` and the existing `pnpm test:unit` pass.

---

## Phase 3: User Story 1 - A page opens a durable graph that is seeded once (Priority: P1) 🎯 MVP

**Goal**: `createClient({ application })` opens `app-<name>`, loads the seed once, never over stored data.

**Independent Test**: create an application client in the harness, write a record, reload, read it back without the seed loaded again.

### Tests for User Story 1 (write first; they fail before the implementation)

- [X] T013 [P] [US1] Unit tests in `packages/web/tests/application/unit/options.test.ts` (`// covers-app: FR-001, FR-002, FR-003`): name must match `[A-Za-z0-9_-]{1,60}` (60 accepted, 61 and empty and `a/b` and `a b` throw, message names the rule); `version` must be a positive integer (0, -1, 1.5, "2" throw); `graph` and `application` together or neither throw; a missing `seed` throws naming it; `migrations` keys must be consecutive integers from 2 to `version`, none above `version`, none for 1, throwing with the key in the message; a range step without `$from` or `$to`, with a `step` that is not a positive integer, or with `label` `_RelateApplication` throws; nothing is created (no worker factory call) when creation throws
- [X] T014 [P] [US1] Unit tests in `packages/web/tests/application/unit/marker.test.ts` and `first-run.test.ts` (`// covers-app: FR-005, FR-006, FR-007`) against `realEngine()`: the marker statements write and read one node labelled `_RelateApplication` with `format` 1, `version` and `state`; first run on an empty engine writes `seeding`, loads the seed (including a descriptor's indexes, or `indexes` for a plain document), and ends with `state` `ready` set by the last statement (assert order by wrapping `execute` and recording statements); a seed containing the label `_RelateApplication` is rejected by `prepare` naming the label before any statement runs; a query returns the marker as an ordinary node with the engine's envelope unaltered
- [X] T015 [P] [US1] Browser spec `packages/web/tests/application/browser/first-run.spec.ts` (`// covers-app: FR-001, FR-003, FR-004, SC-001`) in all three browsers: empty origin → `ready` and seed queryable; write a record, reload → the record is there, the seed is not loaded again (count of seed nodes unchanged) and a changed seed in the reloaded page has no effect; two names on one origin do not see each other's data; the same with `navigation` `client-routing` and `multi-page`; indexes named in the seed exist after the first run and after a reload (`SHOW INDEXES` returns each once)

### Implementation for User Story 1

- [X] T016 [P] [US1] Create `packages/web/src/application/options.ts`: `validateApplication(options)` implementing every rule tested in T013 (quote the rules in error messages: the name pattern, "a positive integer", the offending migration key); returns the normalised options with defaults `onUnavailable: "memory"`, `onError: "fail"`, `whenLocked: "wait"`
- [X] T017 [P] [US1] Create `packages/web/src/worker/application/marker.ts`: `readMarkers(engine)` (count and the one marker's `format`, `version`, `state`), `writeMarker(engine, { version, state })` (create if absent, else set; fixed statements, label from `MARKER_LABEL`), and `setState`, `setVersion`; the marker has no `id` property
- [X] T018 [US1] Create `packages/web/src/worker/application/lifecycle.ts` with `openApplication(engine, init)`: classify only the cases first run (empty store: no node, no index, as `isEmpty` in `sweep.ts`) and `ready` at the same version; first run writes `seeding`, calls `prepare` and `loadGraph` from `loader.ts` (rejecting a seed with the marker label before any write), creates the indexes, then sets `ready` as the last statement; returns `{ restored }`
- [X] T019 [US1] Edit `packages/web/src/worker/worker.ts`: when `init.application` is present, take the application path (new function in a new file `packages/web/src/worker/application/init.ts` called from `worker.ts`): load the engine, open `opfs://app-<name>` through `Engine.store(name, APP_STORE_PREFIX)` with the existing bounded retry, call `openApplication`, send `storage` `durable` then `ready`; do not run `sweepScoped` or touch the stored-copy file in application mode; the existing descriptor path is unchanged
- [X] T020 [US1] Create `packages/web/src/client/application.ts` and edit `packages/web/src/client/client.ts`: in `createClient`, call `validateApplication` before constructing (throwing at creation); in `prepare()` add an application branch that resolves the seed as today (fetch a descriptor URL, validate the descriptor, make `dataUrl` absolute, or take an inline document) and returns the application init; keep the application-specific code in `client/application.ts` so `client.ts` grows by the branch only
- [X] T021 [US1] Edit `packages/web/src/index.ts` to export the application types (`ApplicationOptions`, `MigrationStep`, `RangeStep`, `StorageStatus`, `ExportEnvelope`, `LossReport`, `LossKind`); run T013 to T015 until green in Chromium, Firefox and WebKit

**Checkpoint**: a page opens a durable seeded graph; the MVP's first slice works.

---

## Phase 4: User Story 2 - A store in an unexpected state is never silently erased (Priority: P1)

**Goal**: every store state is recovered or refused by name, with the stored data left alone; `resetApplication()` is the only other discard.

**Independent Test**: build each state in a test (interrupted first run, interrupted import, deleted marker, newer marker) and open it.

### Tests for User Story 2

- [X] T022 [P] [US2] Unit tests in `packages/web/tests/application/unit/classify.test.ts` (`// covers-app: FR-007, FR-008, FR-009`): the full table of [data-model.md](data-model.md) (no marker + empty → first-run; no marker + data → `store-unmarked`; `seeding` → reset-and-seed; `importing` → `import-interrupted`; `ready` with `format` above 1 → `store-newer`; `ready` with `version` above the code's → `store-newer`; `ready` below → migrate; `ready` equal → open; two markers → `store-unreadable` "more than one marker"), and that no action other than `reset-and-seed` ever resets
- [X] T023 [P] [US2] Unit tests in `packages/web/tests/application/unit/recovery.test.ts` (`// covers-app: FR-007, FR-008, FR-009, SC-003`) against `realEngine()`: a store whose first run stopped after `seeding` (build it by running `openApplication` with a seed that fails validation after the marker is written, or by writing the marker directly) is reset, reseeded and ends `ready`; an `importing` marker fails `import-interrupted` and a node count taken before and after is equal; data with no marker (including after `MATCH (m:_RelateApplication) DELETE m`) fails `store-unmarked` with the data unchanged; a `ready` marker at `version` 5 against code at 3, and at `format` 2 against code at 1, fail `store-newer` with the data unchanged; none of the failing paths issues a write statement (record statements and assert)
- [X] T024 [P] [US2] Browser spec `packages/web/tests/application/browser/recovery.spec.ts` (`// covers-app: FR-007, FR-008, FR-009, FR-010, SC-003`) in all three browsers: build each state in a real `app-<name>` store through a first client, then open with a second client and assert `status` `failed`, `diagnostic.reason`, `failureMessage()` wording, and the data intact; `resetApplication()` on each failed client ends `ready` with the seed loaded and no data from before; a reload of a `ready` store resets nothing (a record written by the visitor survives); after `retry()` on `store-unmarked` the client fails again without writing; a worker replaced by a trap in `ready` reopens the same store and keeps the visitor's record (FR-010)

### Implementation for User Story 2

- [X] T025 [P] [US2] Create `packages/web/src/worker/application/classify.ts`: `classify({ markers, nodeCount, hasIndexes, version, format })` returning `first-run`, `reset-and-seed`, `open`, `migrate`, or a failure `{ fail: reason, message }`, exactly per the table in [data-model.md](data-model.md); pure, no engine access
- [X] T026 [US2] Edit `packages/web/src/worker/application/lifecycle.ts` to use `classify`: `reset-and-seed` calls `engine.reset()` then first run; failures return the failure without any write; `migrate` is handled in US3 (until then it throws "migrations are not implemented" so the test of US3 fails first); write the failure messages quoted in T023
- [X] T027 [US2] Edit `packages/web/src/worker/application/init.ts` to send `init-failed` with the lifecycle reason and message (no `storage` change, no further writes), and to honour `intent: "reset"` by calling `engine.reset()` and running first run after opening
- [X] T028 [US2] Edit `packages/web/src/client/application.ts` and `client.ts`: implement `resetApplication()` (D-6): throw on a client not in application mode; terminate the current worker, reject pending calls with `lost`, mark `loading`, start a worker with `intent: "reset"`, resolve when `ready` and reject with the failure if it fails; `retry()` after a lifecycle failure starts a normal open; run T022 to T024 until green

**Checkpoint**: US1 and US2 together: a seeded durable graph that is never silently erased.

---

## Phase 5: User Story 3 - A new release carries stored data forward (Priority: P1)

**Goal**: migrations run in order, are resumable, and the helper makes bulk steps rerunnable.

**Independent Test**: seed at version 1, open with code at version 3 and two migrations, compare with an interrupted and resumed run.

### Tests for User Story 3

- [X] T029 [P] [US3] Unit tests in `packages/web/tests/application/unit/migrate.test.ts` (`// covers-app: FR-011, FR-012, SC-004`) against `realEngine()`: store at 1, code at 3 with entries for 2 and 3 → statements run in order, the marker's `version` is set to each target as the last statement of its step and ends 3, visitor data kept; a failing statement in step 3 leaves the marker at 2 and the failure names version 3 and the statement text; running again after fixing the entry resumes at 3 only; a marker at the code's version runs nothing (record statements); an entry that adds an index with `CREATE INDEX IF NOT EXISTS …` leaves the index in `SHOW INDEXES`
- [X] T030 [P] [US3] Unit tests in `packages/web/tests/application/unit/ranges.test.ts` (`// covers-app: FR-013, SC-004`) against `realEngine()`: `inRanges` returns the plain `{ kind: "ranges", … }` object and survives `structuredClone`; a step over 25 nodes with `step: 10` runs three windows `[from, to)` with inclusive lower and exclusive upper bound and updates each node exactly once; interrupting after the second window (throw from a wrapped `execute`) and running again finishes the rest with no node updated twice (the author's filter `AND n.v2 IS NULL`) and none skipped; the marker node is never matched even when it carries the property; an empty label (no nodes) runs no window and succeeds; negative and zero minimum values are covered
- [X] T031 [P] [US3] Browser spec `packages/web/tests/application/browser/migrate.spec.ts` (`// covers-app: FR-011, FR-012, FR-013, SC-004`) in all three browsers: seed 2,000 nodes at version 1 through a first client, open with code at version 3; and the interrupted variant: terminate the worker (through `workerFactory` returning a worker the test terminates) during a range step of a version-3 entry after the marker reached 2, reload, and compare the final graph (all nodes and properties, sorted) with an uninterrupted run on a second store — identical; a failing statement shows `failed` with `migration-failed` and the page's `failureMessage()` names version and statement

### Implementation for User Story 3

- [X] T032 [P] [US3] Create `packages/web/src/application/ranges.ts`: `inRanges({ label, property, step, statement })` returning the plain `RangeStep` (D-2), validating `statement` contains `$from` and `$to`, `step` a positive integer, `label` not `_RelateApplication`, `property` a non-empty name; export it from `packages/web/src/index.ts`
- [X] T033 [US3] Create `packages/web/src/worker/application/migrate.ts`: `migrate(engine, from, to, migrations)` runs versions `from + 1` to `to`; for each statement string `run` it; for a range step read `min` and `max` of the property over the label (excluding the marker label) and run the statement with `{ from, to }` parameters for each window of `step` up to and including the window containing `max`; after a version's steps call `setVersion(target)` as the final statement; a failing statement throws `MigrationError` carrying the version and the statement text (the range step reports its statement with the window); seed and migration statements run with no visitor timeout (spec clarification)
- [X] T034 [US3] Edit `packages/web/src/worker/application/lifecycle.ts` so `migrate` calls `migrate.ts`, reports `init-failed` `migration-failed` with the message on error (the store stays at the last completed version), and a `ready` marker at the code's version runs nothing; run T029 to T031 until green

**Checkpoint**: a release can change the schema without losing data.

---

## Phase 6: User Story 4 - The page learns whether the data is really stored (Priority: P1)

**Goal**: `storage`, waiting on a locked store, the memory modes, `store-unreadable`, persistence calls, `pagehide`.

**Independent Test**: two tabs of the application (the second waits, then proceeds); a context with no store (memory).

### Tests for User Story 4

- [X] T035 [P] [US4] Unit tests in `packages/web/tests/application/unit/storage.test.ts` (`// covers-app: FR-014, FR-017, FR-018`): the storage holder starts `{ kind: "waiting", persisted: null }`, emits `storage` only when `kind`, `reason` or `persisted` changes, never emits for an equal value, and a client in `memory` ignores a later `durable` report (FR-017); `requestPersistence` calls the supplied `persist` function only when invoked, resolves `false` when it is absent or throws, and updates `persisted`; `storageEstimate` returns `{ usage, quota }` with `null` for missing fields; constructing a client calls neither `persist` nor `persisted` before the worker reports (a stub `navigator.storage` records calls)
- [X] T036 [P] [US4] Unit tests in `packages/web/tests/application/unit/open-store.test.ts` (`// covers-app: FR-015, FR-016`) with a fake engine factory: a store that throws `StorageLockedError` N times then opens → waits per `retryWaits`, then every `WAIT_RETRY_MS` (inject `sleep`), sends `waiting`/`locked` once, then `durable`; with `whenLocked: "memory"` returns a memory engine with reason `locked` after the bounded retry and never calls `Engine.store` again; no `getDirectory` → `unavailable` (memory or fail by option); any other open error → `store-unreadable` (fail) or memory with reason `error` (with `onError: "memory"`); memory modes load the seed on every start and issue no store write
- [X] T037 [P] [US4] Browser spec `packages/web/tests/application/browser/storage.spec.ts` (`// covers-app: FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, SC-005, SC-009`) in all three browsers: a second tab (a second page in one browser context) while the first holds the store → `status` `loading`, `storage` `{ kind: "waiting", reason: "locked" }`, a `query` made meanwhile is pending (neither resolved nor rejected after 3 s), the second tab never writes (the first tab's node count does not change), and after the first tab closes the second proceeds to `ready`, `storage` `durable`, the pending query resolves, and a `storage` event fired; `whenLocked: "memory"` → `memory`/`locked` and nothing written; a context with `navigator.storage.getDirectory` removed (init script, including in the worker through `workerFactory`) → `memory`/`unavailable` with the seed, and `failed` with `onUnavailable: "fail"`; an open error simulated by corrupting the store directory through the origin-private file API → `store-unreadable` with the engine's message and the store unchanged, or `memory`/`error` with `onError: "memory"` (record the error texts each browser gives for the "no store" and "damaged" contexts in `reports/application-open-errors.json`, research R-1); the core never calls `navigator.storage.persist` at startup (spy) and `requestPersistence()` calls it once and does not delay `ready`; `storageEstimate()` returns numbers; while `loading`, `waiting` and `failed` a page with its own text and links keeps them and shows its placeholder (the harness page renders a region from `status`; assert text and links present and region text)
- [X] T038 [P] [US4] Browser spec `packages/web/tests/application/browser/pagehide.spec.ts` (`// covers-app: FR-019`) in all three browsers: a multi-page site navigating from page A to page B (full document loads) — page B reaches `ready` within the retry without a `waiting` report, because page A ended its worker on `pagehide`; a page restored from the back-forward cache (Chromium and Firefox, where the harness can trigger it; label WebKit's result as observed) restarts its client and reaches `ready`

### Implementation for User Story 4

- [X] T039 [P] [US4] Create `packages/web/src/application/storage.ts`: the holder of `StorageStatus` and its change emitter (T035), plus `requestPersistence(persist)` and `storageEstimate(estimate)` wrappers that take the browser functions as parameters so tests can stub them; edit `client/events.ts` if not done in T007 so `on("storage", …)` is typed
- [X] T040 [US4] Create `packages/web/src/worker/application/open-store.ts` replacing the direct open in `init.ts`: feature-detect `navigator.storage.getDirectory` (absent or throwing → `unavailable`), open `app-<name>` with `retryWaits()`, then with `whenLocked: "wait"` loop `sleep(WAIT_RETRY_MS)` and retry until it opens, sending `storage` `waiting`/`locked` once; `"memory"` → `Engine.memory()` with reason `locked`; any non-lock error → `store-unreadable` or memory with reason `error`; `unavailable` → memory or `init-failed` `unavailable`; memory modes run `first-run` with the seed on every start (no marker needed beyond the in-memory one) and never open a store; edit `init.ts` to use it and to send `storage` `durable` before `ready`
- [X] T041 [US4] Edit `packages/web/src/client/application.ts`: apply worker `storage` messages to the holder (adding `persisted` from `navigator.storage.persisted()` when it exists, asked once per report and never `persist()`), expose `storage`, `on("storage")`, `requestPersistence()` and `storageEstimate()` on the client; keep `status` `loading` while `waiting`; make no call to `persist` anywhere outside `requestPersistence`
- [X] T042 [US4] Edit `packages/web/src/client/application.ts` and `client.ts` for `pagehide` (D-7): in application mode add a `pagehide` listener that terminates the worker and rejects nothing visible to the page (marks the client released, ignores later worker messages); add a `pageshow` listener that, when `event.persisted`, starts the client again through the ordinary start; remove both listeners in `destroy()`; run T035 to T038 until green

**Checkpoint**: the MVP (US1 to US4) is complete: a durable, seeded, migrated, honest application graph.

---

## Phase 7: User Story 5 - A visitor can take a copy of the data out and bring it back (Priority: P2)

**Goal**: export with a loss report, validate-first import.

**Independent Test**: export a carriable graph, import into a reset store, export again, compare; export each loss kind and check the report.

### Tests for User Story 5

- [X] T043 [P] [US5] Unit tests in `packages/web/tests/application/unit/losses.test.ts` (`// covers-app: FR-021, SC-006`) against `realEngine()`, one case per kind plus the combined cases from research P-1: `9007199254740993` and `-9007199254740993` (integer-beyond-2^53; `9007199254740991` is not a loss), `2.0` (whole-number-float; `2.5` is not), a date, a datetime and a duration (`date`, `duration` kinds; counted once per value), a point, `[]` (empty-list; `[1, 2]` is not), a node with a numeric `id`, with no `id` (node-without-string-id, with `droppedLinks` counting its relationships); a property that holds an integer on one node, a string on another and a float on a third is read correctly per value; counts are per value; a graph with no losses returns an empty report; check the open cases of research R-3 (a list holding a whole-number float; a nested map is a loss of what kind) and record the observed behaviour in the test names
- [X] T044 [P] [US5] Unit tests in `packages/web/tests/application/unit/transfer.test.ts` (`// covers-app: FR-021, FR-022, FR-023, SC-006`) against `realEngine()`: export returns the envelope of [contracts/export-envelope.schema.json](contracts/export-envelope.schema.json) (validate with `schemaValidator`/ajv as `tests/unit/helpers.ts` does), skips the marker, includes every node and link of a carriable graph across more than one batch (`> BATCH_SIZE` nodes); rejects with `export-loss` carrying the report when losses exist and `allowLoss` is not `true`, resolves with the report when `true`; export, import into a reset store, export again gives identical documents; import rejects an envelope with another `application.name`, a `version` above the code's, a wrong `format`, or an invalid document, each leaving the store unchanged (node count and marker equal); a valid import validates before writing (no write statement before validation passes), sets `importing`, resets, loads, sets `ready` at the envelope's version and then migrates to the code's version; import does not export first
- [X] T045 [P] [US5] Browser spec `packages/web/tests/application/browser/transfer.spec.ts` (`// covers-app: FR-021, FR-022, FR-023, SC-006`) in all three browsers: through the client, export a graph with every loss kind (reports each kind with its count; rejects without `allowLoss`), export a carriable graph of 5,000 nodes and import it into a second origin-store name, compare documents; terminate the worker during an import of a large document (use a document large enough that the load takes longer than the delay; if the run finishes first, label it so) and reopen → `import-interrupted`, then `resetApplication()` recovers; record the largest export size that completes and the time it took to `reports/application-export.json` (single run, labelled)

### Implementation for User Story 5

- [X] T046 [P] [US5] Create `packages/web/src/worker/application/losses.ts`: `readNodes(engine, batch)` pages with `ORDER BY elementId(n) SKIP $s LIMIT $l` over `MATCH (n) WHERE NOT n:_RelateApplication` returning `labels(n)`, `elementId(n)` and, per key, `valueType(n[k])` and `toString(n[k])` (D-4, research P-1); classify each value into a `LossKind` or none: integers whose `toString` has more than 15 significant digits and an absolute value above 2^53 − 1, floats whose text ends `.0` or has no fraction, `DATE`/`ZONED DATETIME`/`LOCAL DATETIME`/`TIME` types as `date`, `DURATION` as `duration`, `POINT` as `point`, `LIST<NOTHING>` as `empty-list`, and an `id` that is not `STRING`; produce the document property from the exact text where the format can carry it; accumulate `LossReport` by kind (T043 defines the exact rendering of each loss in the document and the README records it)
- [X] T047 [US5] Create `packages/web/src/worker/application/transfer.ts`: `exportApplication(engine, application)` builds the ADR-002 document from `readNodes` and the relationships (`elementId(a)`, `elementId(b)`, `type(r)`, `properties(r)`, paged the same way), omits nodes without a string `id` and relationships that end at them (counting `droppedLinks`), and returns `{ envelope, losses }`; `importApplication(engine, application, envelope)` checks `format`, `application.name`, `version` and runs `prepare` over `document` before any write, then `setState("importing")`, `engine.reset()`, writes the marker `importing` at the envelope's version, `loadGraph`, `setState("ready")`, then `migrate` to the code's version; never exports first
- [X] T048 [US5] Edit `packages/web/src/worker/worker.ts` and `packages/web/src/client/application.ts`: handle `export-application` and `import-application` messages, send `application-exported`/`done`/`error`, and implement `exportApplication({ allowLoss })` (reject with `GraphError("export-loss", …)` carrying the report) and `importApplication(envelope)` on the client; run T043 to T045 until green

**Checkpoint**: the visitor can back up and restore.

---

## Phase 8: User Story 6 - Durability and the browser limits are measured (Priority: P2)

**Goal**: durability, restore comparison, two clients, memory never writing.

**Independent Test**: run the browser suite and read the recorded figures.

### Tests for User Story 6

- [X] T049 [P] [US6] Browser spec `packages/web/tests/application/browser/durability.spec.ts` (`// covers-app: FR-025, SC-002`) in all three browsers: a worker writes `(:Item {id: n})` one statement at a time and reports each acknowledged count through a `SharedArrayBuffer` (as `design/spikes/SPIKE-008-application-graph-store/harness/` does; use that harness as the model); the page terminates the worker after 0.3 to 1.5 s, five cycles per browser, and separately closes the tab, three cycles; after each, reopen the store through an application client and assert the stored ids are `0..n-1` with no gap and `n` at least the acknowledged count; write counts and times per run to `reports/application-durability.json` labelled single run, one machine
- [X] T050 [P] [US6] Browser spec `packages/web/tests/application/browser/restore.spec.ts` (`// covers-app: FR-025, SC-007`) in all three browsers: build an application store and a content store (descriptor with `store: true`) of the same generated graph at 1,000 and 5,000 and 20,000 nodes (`tests/fixtures/generate-graph.ts`), reload each, and record the time to `ready` (`timing` events `open` and `restore`) for each, five runs each, median and all runs in `reports/application-restore.json` with method and environment; the assertion is that the application store's median is no more than the content store's median plus 25 % of it (a tolerance for noise, stated in the test) and the report says single machine; sizes not run are written as `unmeasured`
- [X] T051 [P] [US6] Browser spec `packages/web/tests/application/browser/two-graphs.spec.ts` (`// covers-app: FR-024, FR-017`) in all three browsers: one page with a content client (descriptor, store) and an application client (different names) → two workers, two stores, each ready; a statement through one client cannot see the other's nodes; a client in `memory` mode writes a record and the `app-<name>` directory under the origin-private root is not created (list the root) (FR-017); two application clients with the same name in one page → the second waits on the first (`waiting`/`locked`)

### Implementation for User Story 6

- [X] T052 [US6] Extend the harness `packages/web/tests/application/browser/harness/harness.ts` (and a `durability.worker.ts` beside it, modelled on the SPIKE-008 worker) with the pieces T049 to T051 need: a writer worker, `window.app.makeContent(options)`, an origin-private-root lister, and a tab-closing helper; fix whatever the specs find in the implementation of US1 to US4 (record each fix in the commit message), and run T049 to T051 until green or until a failure is a recorded finding with the numbers (not a retry)

---

## Phase 9: User Story 7 - Open items are checked and the decision is amended (Priority: P2)

**Goal**: each item ADR-009 left for implementation is tested and written into ADR-009.

**Independent Test**: read ADR-009 §6; each item has a dated entry with what was found.

### Tests for User Story 7

- [X] T053 [P] [US7] Browser spec `packages/web/tests/application/browser/open-items.spec.ts` (`// covers-app: FR-026, SC-008`) in all three browsers, writing `reports/application-open-items.json`: (a) reopen sequence after a replaced worker: write through a client, force a trap or `timeout` fault so the client replaces its worker, and record each `storage`/`status` change and the time from the fault to `ready` (in Chromium with a busy worker: run a long synchronous statement then terminate); (b) retry duration in application mode: hold the store with a busy worker for a controlled time, record how long a second client takes from `waiting` to `ready` and whether it did so inside the 5 s bounded retry; (c) index persistence: create the index on first run, reload, `SHOW INDEXES` lists it once and a query planned with it uses it (`EXPLAIN` or the engine's `lastRead` counter after the query), and a migration-added index persists the same way; (d) typed detection re-run in each browser's engine (the engine is the same wasm; record that the per-value read gives the Node results); each result is a single run, labelled so

### Implementation for User Story 7

- [X] T054 [US7] Run T053 (`pnpm test:application-browsers`), read `reports/application-open-items.json` and `reports/application-open-errors.json`, and append a dated entry to `design/adr/ADR-009-application-graphs-in-the-core.md` §6 for each item: the reopen sequence and time in Chromium; the retry duration that works in application mode (and, if it differs from 5 s, change §2.2 step 1 and `STORE_RETRY` use for application mode in `open-store.ts` in the same commit); whether indexes persist; the error texts that separate "unavailable" from "unreadable" in each browser (and any rule change R-1 needs); and the answer on lists and nested values (R-3, with the loss kind added to §2.5 and `LossKind` if one is needed). Do not edit ADR-009 for anything not measured
- [X] T055 [P] [US7] Add to `design/adr/ADR-009-application-graphs-in-the-core.md` §6 (same dated entry style) the list of engine gaps found while implementing, for raising upstream and not worked around: no checkpoint or store-size call in the browser build (RFC-006 7.5), no snapshot export in the browser build (RFC-006 7.12), the unexplained write stalls of SPIKE-008, and any further gap the tasks above met; do not raise them (separate, on the user's say-so)

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T056 [P] Write the application section of `packages/web/README.md` (FR-028): the `application` option with every field and default; the marker and that queries return it; the failure names and what each means and what to do (including `resetApplication()` and that it discards data); the storage status table and the waiting behaviour; `requestPersistence`, `storageEstimate` and why the core never asks; `exportApplication` with the loss kinds and the rendering of each, and `importApplication` and that it does not export first; the rule for migrations (bounded steps, each safe to run again, version written last) with an `inRanges` example whose statement has `$from`, `$to` and an idempotence filter; two clients for content and application graphs; what is unmeasured (power loss, quota, large-store migration time, write stalls)
- [X] T057 [P] Edit `CLAUDE.md` "Project state" and "Commands": add application mode to the core's description and the three `test:application*` scripts, in the style of the adapters' lines; do not change anything else
- [X] T058 Run `pnpm --filter @relate/contrib-web typecheck && pnpm --filter @relate/contrib-web build`, then `pnpm test:application`, `pnpm test:application-browsers` and `pnpm test:application-trace`; fix gaps until all pass and the trace check reports every FR-001 to FR-029 and SC-001 to SC-009 tagged and passing (SC-008 also needs T059)
- [X] T059 Run the existing suites unchanged and confirm they pass: `pnpm test:unit`, `pnpm test:browsers`, `pnpm test:conformance`, `pnpm test:trace`, `pnpm test:package`, `pnpm test:astro`, `pnpm test:next`, `pnpm test:observable`, `pnpm test:sveltekit` (FR-027, SC-008); run `git diff --stat main -- packages/astro packages/nextjs packages/observable packages/sveltekit vendor packages/web/src/profiles packages/web/src/worker/stored-copy.ts packages/web/conformance` and confirm it is empty
- [X] T060 Walk [quickstart.md](quickstart.md) from a clean checkout state (fresh `pnpm install` is not needed; run its numbered checks in order) and fix any command or expectation that is wrong in the quickstart itself; confirm the recorded reports exist under `packages/web/reports/` and each figure is labelled single run
- [X] T061 Update `specs/006-application-graphs/spec.md` status to Implemented only when T058 and T059 are green, and tick every box in `specs/006-application-graphs/checklists/requirements.md` that implementation changed; commit citing ADR-009 (`Implement application graphs in the core (ADR-009)`), on the branch, without merging

---

## Dependencies & Execution Order

- **Phase 1** (T001 to T004) first; T003 and T004 are parallel with each other.
- **Phase 2** (T005 to T012) blocks every story. T005, then T006 to T012 mostly in parallel (T007 needs T006; T008 and T009 need T005).
- **US1 → US2 → US3 → US4** run in order (each extends `lifecycle.ts`, `init.ts` and `client/application.ts`). Within a story, tests come first and fail; implementation follows.
- **US5** needs US1 and US2 (the marker and reset) and US3 (import migrates); **US6** needs US1 to US4; **US7** needs US1 to US6 (it reads their reports); they can overlap after US4 except where a task reads another's output.
- **Phase 10** after everything; T058 and T059 gate T061.

## Parallel Opportunities

- Phase 2: T006, T009, T010, T011 and T012 together after T005.
- US1 tests: T013, T014, T015 together; then T016 and T017 together before T018.
- US2 tests: T022, T023, T024 together; T025 alone before T026.
- US3 tests: T029, T030, T031 together; T032 alone before T033.
- US4 tests: T035 to T038 together; T039 alone before T040.
- US5 tests: T043 to T045 together; T046 alone before T047.
- US6 tests: T049 to T051 together.
- Polish: T056 and T057 together.

## Implementation Strategy

1. **MVP**: Phases 1 and 2, then US1 to US4 in order (the P1 stories). Stop at the US4 checkpoint and run `pnpm test:application` and the browser suite; this is a usable durable application graph.
2. **Increments**: US5 (export and import), US6 (measurements), US7 (the amendments), each ending with its tests green and any finding written into ADR-009 §6 in the same commit.
3. **Risk first inside each story**: the state machine (US2) and the lock behaviour (US4) are where SPIKE-008 found the sharp edges; write their browser specs before their implementations and read the failures before changing the design. A failing spec that records a measured fact is a finding for ADR-009, not a reason to loosen the spec.
4. **Do not**: merge the branch, raise the engine requests, or touch another package without the user saying so.
