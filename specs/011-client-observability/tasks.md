# Tasks: A Page Can Observe a Core Client

**Input**: `/specs/011-client-observability/` (spec.md, plan.md, research.md, data-model.md, contracts/client-api.md)
**Implements**: ADR-001, amendment 2026-11-27. Tests are required (constitution V); tags are `covers-obs:`.

## Phase 1: Setup

- [X] T001 Add the Vitest config `packages/web/vitest.observability.config.ts` (include `tests/observability/unit/**/*.test.ts`) and scripts `test:observability`, `test:observability-browsers`, `test:observability-trace` in `packages/web/package.json`, plus the root script in `package.json`
- [X] T002 [P] Write `packages/web/tests/observability/unit/fake-worker.ts`: a `Worker` stand-in that answers the client's messages from a real in-memory engine (`Engine.fromDb`), including `statements` messages
- [X] T003 [P] Write the trace check `packages/web/tests/observability/trace/check-trace-observability.ts` (every FR and SC of this spec has a passing test tagged `covers-obs:`), modelled on `tests/application/trace/check-trace-application.ts`

## Phase 2: Foundation (blocks all stories)

- [X] T004 Create `packages/web/src/client/statements.ts`: the write rule (`isWrite(stats)`), parameter capture (4 KiB cut, marker, encode error), and `StatementEvent` building from an envelope (data-model.md)
- [X] T005 Extend `packages/web/src/client/events.ts`: `statement` and `revision` payloads; `Emitter.on` takes an optional `{ params }` option stored per listener, with `wants(event, option)` so a payload is built only when needed
- [X] T006 Extend `packages/web/src/worker/protocol.ts`: `StatementsMessage`, `ObserveMessage`, `InitMessage.observe`, `ReadyMessage.engine`
- [X] T007 Extend `packages/web/src/worker/engine.ts`: a static internal tap and a quiet `version()` that runs `CALL dbms.components()` outside the tap (research R2)

## Phase 3: User Story 1, statement events (P1)

- [X] T008 [P] [US1] Unit tests `tests/observability/unit/statements.test.ts` for the write rule and parameter capture (FR-003, FR-004, SC-004)
- [X] T009 [P] [US1] Unit tests `tests/observability/unit/statement-event.test.ts` with the fake worker and real engine: read, write, error, `run`, subscription re-run, no listener builds nothing, throwing listener, params opt-in (FR-001 to FR-005, SC-001)
- [X] T010 [US1] Thread `origin` through `execute` in `packages/web/src/client/client.ts`; report the event at the `result` and `error` messages; subscription runner passes `subscription`
- [X] T011 [US1] Worker: set and clear the tap around `init`, `scopedAdd`, `scopedDrop` and `importApp` in `packages/web/src/worker/worker.ts`; send `statements` before the terminal message; handle `observe`; page handles `statements` (internal events) and sends `observe` when the `statement` listener count crosses zero, and `observe` in init
- [X] T012 [US1] Unit tests for internal statements (load, seed, migration, import, scoped) in `tests/observability/unit/internal-statements.test.ts` (FR-002)

## Phase 4: User Story 2, revision (P1)

- [X] T013 [P] [US2] Unit tests `tests/observability/unit/revision.test.ts` (FR-006 to FR-008, SC-002): write, read, failed statement, internal writes, restart at 0 on replacement, subscription behaviour unchanged
- [X] T014 [US2] `client.revision` and the `revision` event in `client.ts`: reset at ready, apply init writes, page-sent statements step by one, internal jobs one event per job (research R4)

## Phase 5: User Story 3, client info (P2)

- [X] T015 [P] [US3] Unit tests `tests/observability/unit/info.test.ts` (FR-009, FR-010, SC-005): null before ready, three kinds, engine version, re-available after replacement, engine null when absent
- [X] T016 [US3] `client.info` in `client.ts` and `types.ts`; worker puts `engine` on `ready` (wrap `send` in `worker.ts`)

## Phase 6: Browsers, engine canary, docs, measurement

- [X] T017 [P] Playwright spec `tests/observability/browser/observe.spec.ts` against the real worker in Chromium, Firefox and WebKit: events and revision for a scripted sequence, info for the three kinds (SC-001, SC-002, SC-005); config `playwright.observability.config.ts`
- [X] T018 [P] Add to `tests/unit/engine-assumptions.test.ts` the behaviour used: `dbms.components()` returns a `Relate` row with a version, and stats counters move on a write
- [X] T019 [P] Cost check `tests/observability/unit/cost.test.ts`: the page-side rule against a statement's round trip, and the worker's tap over a 5,000-page load; figures in research.md R7 (SC-003, one environment)
- [X] T020 [P] Document the additions, the write rule and its limit, and the params opt-in in `packages/web/README.md` (FR-012); a changeset for `@relate/contrib-web` (a patch, as the package is below 1.0)
- [X] T021 Wire the new commands into `.github/workflows/full.yml` (web suite scripts), `scripts/release/checks-for.ts` if it lists suites, and the root `CLAUDE.md` command list
- [X] T022 Run the whole set: `pnpm -r build`, `pnpm test:unit`, `pnpm test:observability`, `pnpm test:observability-trace`, the core's existing suites; fix regressions (FR-011, SC-006)

## Dependencies

T001 to T007 first. US1 (T008 to T012), then US2 (T013, T014) and US3 (T015, T016) can follow in either order once T010 and T011 exist. Phase 6 after the stories. Tests precede their implementation tasks within a story.

## Implementation strategy

MVP is US1 (the event). Then the revision, then info, then browsers, canary, docs and measurement. Stop and report if a change to an existing test is needed.
