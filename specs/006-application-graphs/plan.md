# Implementation Plan: Application Graphs in the Core Package

**Branch**: `spec/006-application-graphs` (spec directory `006-application-graphs`) | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-application-graphs/spec.md`

## Summary

Add an application mode to `createClient` in `packages/web`: one named, durable, versioned graph in the visitor's browser, seeded once, migrated by ordered statements, honest about whether it is stored, and exportable. All lifecycle logic (the marker state machine, migrations, export, import) runs in the worker that already owns the engine; the page-side client validates options, relays a `storage` status, and gives up at once on failures a retry cannot change. Nothing outside `packages/web` changes, and the existing tests pass unchanged (FR-027).

Planning checked two things early because they could have changed ADR-009 (P-1 to P-4 in [research.md](research.md)). One did: the engine's `columnTypes` describes a column from one row, so it cannot detect a property whose type differs across nodes. Detection reads each value with `valueType()` and `toString()` instead, which finds every loss kind in ADR-009 §2.5. The ADR is amended for this (ADR-009 §6, 2026-11-09). The browser-only items (reopen sequence, retry duration, index persistence) stay for implementation, as the spec says.

## Technical Context

**Language/Version**: TypeScript 7 (as the core), Node 24 for unit tests, ES2022 browser target, a dedicated module worker.

**Primary Dependencies**: none new. The engine is the existing peer `@relate/relate-wasm` (0.16.1 in `node_modules`); dev tools are the core's (`vitest`, `@playwright/test`, `tsx`).

**Storage**: the engine's origin-private store `opfs://app-<name>` through `RelateDb.open`; no other browser storage. The content cache (`rel-<id>` stores and the stored-copy file) is untouched.

**Testing**: Vitest in Node for the pure parts and for the lifecycle modules run against the real engine in memory (P-2 shows the engine initialises in Node); Playwright in Chromium, Firefox and WebKit for everything that needs the store (durability, locks, recovery states, restore time); a trace check over the spec's FR and SC ids.

**Target Platform**: desktop Chromium, Firefox, WebKit, as the core. Mobile, power loss and quota exhaustion are unmeasured (spec Assumptions).

**Project Type**: library (the existing workspace package `@relate/web`).

**Performance Goals**: one comparison, SC-007: restoring an application store is no slower than restoring a content store of the same size. Recorded with method and environment, single runs labelled so. No other threshold.

**Constraints**: query results stay the engine's envelope, unaltered; no main-thread instance; options and migrations cross `postMessage`, so they are plain data (no functions); migration and seed statements are the author's and carry no visitor timeout (spec clarification); the engine is used through its package interface only.

**Scale/Scope**: about twelve new source files and edits to seven existing ones in `packages/web/src`, five test groups, one harness page. No new package.

## Constitution Check

*Gate: before Phase 0. Re-checked after Phase 1 design (same result).*

| Principle | Check | Result |
|-----------|-------|--------|
| I. Decisions Before Code | Implements ADR-009 (accepted, reviewed 2026-11-08) on ADR-001 to ADR-003 and SPIKE-008. The one statement planning found wrong (typed detection by `columnTypes`) is recorded in ADR-009 §6 before tasks, not decided here. Decisions D-1 to D-9 are choices inside the ADR's stated freedoms (helper syntax, message shapes), listed in research.md. | Pass |
| II. Core First, Thin Adapters | The change is in the core; adapters are untouched. Their application helpers are a later feature (spec out of scope). | Pass |
| III. The Page Works Without the Graph | The client is `loading` while `waiting` or failed; `storage` and `diagnostic` give pages the text for a placeholder; nothing renders from the instance. SC-009 and US4 scenario 9 test a page whose text and links stay usable. | Pass |
| IV. Faults Are Contained | The instance stays in the worker. Visitor statements (`run`) keep their timeout. Seed and migration statements are the author's, are not visitor-supplied, and are written to survive interruption (bounded, rerunnable); this is recorded in the spec's clarifications, not an exception to the principle. A worker replaced after a fault reopens the same store through the same steps. | Pass |
| V. Specified Behavior Is Tested and Measured | Every FR and SC gets a test tagged `covers-app:` and the trace check fails on an untagged one. Durability across power loss, quota exhaustion, large-store migration time and the SPIKE-008 write stalls are labelled unmeasured; restore times are recorded as single runs. | Pass |
| VI. The Engine Stays Upstream | Used through `RelateDb` (`open`, `execute`, `reset`, `free`). Missing calls (checkpoint, size, snapshot export) are listed for upstream and not worked around; export reads through Cypher, which is the public interface. | Pass |

## Delivery order (risk first)

Tasks follow this order; each step ends with the tests of its stories passing and any finding written as a dated ADR-009 amendment.

1. **Foundations**: constants, option validation, public types, engine seam (store prefix, close), protocol additions, failure reasons that give up at once. No behaviour change without `application`.
2. **Marker and recovery** (US1, US2): marker statements, the classifier, first run, `seeding` recovery, `import-interrupted`, `store-unmarked`, `store-newer`, `resetApplication`.
3. **Storage status** (US4): `storage` and its event, waiting on a locked store, memory modes, `store-unreadable`, `requestPersistence`, `storageEstimate`, `pagehide`.
4. **Migrations** (US3): the runner, `inRanges`, resume, diagnostics.
5. **Export and import** (US5): typed reads (P-1), the envelope, the validate-first import.
6. **Browser measurements** (US6): durability under termination and tab close, restore comparison, two clients.
7. **Open items and amendments** (US7): reopen sequence, retry duration, index persistence, engine gap list; README; trace check.

## Project Structure

### Documentation (this feature)

```text
specs/006-application-graphs/
├── plan.md              # This file
├── research.md          # Phase 0: planning checks P-1 to P-4, decisions D-1 to D-9, risks
├── data-model.md        # Phase 1: marker, states, options, storage status, envelope, loss report
├── quickstart.md        # Phase 1: how to run each check
├── contracts/           # Phase 1: application-api.md, worker-protocol.md, export-envelope.schema.json
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/web/
├── src/
│   ├── config.ts                     # + APP_STORE_PREFIX, APP_NAME_PATTERN, MARKER_LABEL, WAIT_RETRY_MS (edit)
│   ├── errors.ts                     # reasons for the new failures (edit)
│   ├── index.ts                      # exports application types and inRanges (edit)
│   ├── application/                  # page-side, no worker code
│   │   ├── types.ts                  # ApplicationOptions, StorageStatus, ExportEnvelope, LossReport, steps
│   │   ├── options.ts                # validate name, version, migrations map, seed; throws at creation
│   │   ├── ranges.ts                 # inRanges(): a plain-data range step for a migration list
│   │   └── storage.ts                # storage property holder and its change event
│   ├── client/
│   │   ├── client.ts                 # application branch in prepare/start; delegates to application.ts (edit)
│   │   ├── application.ts            # resetApplication, export/import calls, pagehide, persistence calls
│   │   ├── failure.ts                # give up at once for the lifecycle failure reasons (edit)
│   │   ├── diagnostic.ts             # wording for the new reasons (edit)
│   │   └── types.ts                  # Client gains storage and the application calls (edit)
│   └── worker/
│       ├── protocol.ts               # init for application mode, storage, export, import messages (edit)
│       ├── worker.ts                 # dispatch to the lifecycle module (edit)
│       ├── engine.ts                 # store(name, prefix), close(), fromDb for tests (edit)
│       ├── store.ts                  # openStore takes a prefix; waiting loop is separate (edit)
│       └── application/
│           ├── marker.ts             # read and write the marker with fixed statements
│           ├── classify.ts           # (marker, node count, version, format) -> action; pure
│           ├── lifecycle.ts          # open, first run, recovery, migrate, ready; reports storage
│           ├── migrate.ts            # runs a migration list; expands range steps
│           ├── transfer.ts           # exportApplication typed reads, importApplication
│           └── losses.ts             # loss kinds from valueType and toString reads
├── tests/
│   ├── application/
│   │   ├── unit/                     # options, classify, ranges, marker, migrate, losses, transfer (real engine in Node)
│   │   ├── browser/                  # Playwright specs and harness page for the three browsers
│   │   └── trace/check-trace-application.ts
│   └── (existing tests unchanged)
└── README.md                         # application mode section (edit)
package.json (packages/web)           # scripts: test:application, test:application-browsers, test:application-trace
package.json (root)                   # the same scripts, as the adapters have
```

**Structure Decision**: the feature lives in the existing core package. Page-side code is in `src/application/` and `src/client/`, worker-side code in `src/worker/application/`, so that the worker bundle shares nothing with the page except types. The tests sit in `tests/application/` with their own tag (`// covers-app:`), because the existing trace check reads specification 001 and its `FR-n` ids would collide with this specification's.

## Complexity Tracking

No constitution violations. `client.ts` is 356 lines; the application branch is kept to `prepare` and `start` and the rest goes to `client/application.ts`, so the existing file does not grow into a second client.
