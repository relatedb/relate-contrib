# Implementation Plan: The relate-phaser Package, Extracted from the Path Explorer

**Branch**: `spec/009-relate-phaser-package` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-relate-phaser-package/spec.md`

## Summary

Build ADR-012 as a package, `@relate/relate-phaser` (`packages/phaser`): a statement queue (`Bridge`), a generic reply cache (`ReplyCache<S>`), a throwaway client, and a version watcher with a thin Phaser scene helper. The package is extracted from the path explorer, and the demo is changed to consume it, so the demo's 202 unit tests are the first check of the extraction.

Planning read the demo's code and the core's client against the ADR, and found three places where the ADR's wording needs a concrete shape ([research.md](research.md)): the demo's `act` takes a closure, not a statement; the core runs generation listeners after the client is `ready`, once for the first instance too; and the demo's scene must order other work around its redraw. None changes a decision of ADR-012; each is settled in research as a refinement the contract records.

## Technical Context

**Language/Version**: TypeScript (ESM), as the other packages; Node 24 for unit tests.

**Primary Dependencies**: peers `@relate/web` (types, `GraphError`, `createClient`) and `phaser` (optional; the scene helper is structural and imports no Phaser value). The package imports no engine code (constitution VI) and references no repository path.

**Storage**: none. The package stores nothing; the demo's application graph and its throwaway graph are unchanged.

**Testing**: Vitest in Node against the real engine for the queue and cache (the demo's engine helper, moved into the package's test helpers); a fake client with an emitter for generation and status paths; one Playwright run (Chromium, Firefox, WebKit) over the demo that traps the engine and checks the board is rebuilt; a package install test as for the other packages; a trace check tagged `covers-ph:`.

**Target Platform**: desktop Chromium, Firefox and WebKit, as the core's tests; Node for unit tests.

**Project Type**: a library package plus a change to an existing workspace demo.

**Performance Goals**: the queue adds no more than one macrotask per statement over calling the client directly (not asserted as a figure; SC-001 and SC-005 are about order and redraw count). No measurement is claimed.

**Constraints**: the package is below 1.0 and unstable (FR-001); it ships no statements, seeding or drawing (FR-002); it does not retry (FR-003); the demo's game logic and its 202 tests are unchanged apart from import paths and the cache's use (FR-015, FR-016).

**Scale/Scope**: the package is a few hundred lines; the demo's `GameState` keeps its game logic and wraps a `ReplyCache` instead of owning the pending marker and version.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Decisions Before Code | ADR-012 is accepted (parents RFC-008, RFC-005; builds on ADR-001, ADR-009, ADR-011). Planning found its wording incomplete in three places (closure-shaped `act`, generation start-up, ordering in the scene); research R1, R4 and R6 settle each as a refinement of wording the ADR already states, so no amendment is needed and the contract records the shapes. If implementation finds a refinement that changes a decision, the ADR is amended first. | Pass |
| II. Core First, Thin Adapters | The package wraps the core's client through its exported types and adds no hosting, fault or data decisions; recovery is the core's replacement plus a reload. | Pass |
| III. The Page Works Without the Graph | The cache holds a usable state while the client is `loading`, `recovering` or `failed`: the previous state stays, and `status` tells the game to show a message instead of a blank board (FR-010, FR-011). | Pass |
| IV. Faults Are Contained | The package adds no statement that a visitor supplies; it never retries; a trapped instance is replaced by the core and the cache reloads. | Pass |
| V. Specified Behavior Is Tested and Measured | Every MUST has a `covers-ph:` test (FR-017), including the fault and recovery paths: a rejected reload, `lost`, `failed`, and a real trapped engine in the browser run. No speed claim is made. | Pass |
| VI. The Engine Stays Upstream | The package uses the client only; nothing is patched around the engine. | Pass |

No violations; the Complexity Tracking table is empty.

*Re-check after design*: the contract adds no dependency beyond the core's types and no hosting behaviour. Still a pass.

## Project Structure

### Documentation (this feature)

```text
specs/009-relate-phaser-package/
├── plan.md              # This file
├── research.md          # Phase 0: what the code and the core do, and the refinements
├── data-model.md        # Phase 1: the entities and their states
├── quickstart.md        # Phase 1: how to run each check
├── contracts/
│   └── package-api.md   # the package's exports
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
packages/phaser/                 # new: @relate/relate-phaser
├── package.json                 #   0.1.0, private until the first release; peers @relate/web and phaser (optional)
├── src/
│   ├── errors.ts                #   StatementError
│   ├── bridge.ts                #   Bridge: the statement queue
│   ├── cache.ts                 #   ReplyCache<S>: state, version, pending key, status, act, reload
│   ├── throwaway.ts             #   createThrowawayClient
│   ├── watch.ts                 #   versionWatch, watchCache
│   └── index.ts
├── tests/
│   ├── unit/                    #   queue, cache, throwaway, watcher; real engine and a fake client
│   ├── helpers/                 #   the in-process engine (moved from the demo), a fake client
│   ├── package/                 #   pack, install in a clean project, run an action
│   └── trace/check-trace.ts     #   covers-ph tags
├── vitest.config.ts
├── vitest.package.config.ts
├── tsconfig.json
└── README.md

demos/phaser-path-explorer/      # changed
├── src/game/bridge.ts           #   removed (imports move to the package)
├── src/game/state.ts            #   GameState wraps a ReplyCache; game logic unchanged
├── src/game/MapScene.ts         #   redraw gated by versionWatch
├── src/main.ts                  #   Bridge.forClient, createThrowawayClient, reload on generation
├── tests/bridge.test.ts         #   moves to the package
└── tests/browser/               #   new: Playwright, a trapped engine rebuilds the board
```

**Structure Decision**: a new package beside the others, `packages/phaser`, with the repository's usual layout (`src`, `tests/{unit,helpers,package,trace}`, a README); the demo is edited in place, with one new browser test directory.

## Complexity Tracking

No violations to justify.
