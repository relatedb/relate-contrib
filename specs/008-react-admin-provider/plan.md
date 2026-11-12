# Implementation Plan: A react-admin Data Provider and Local-First Demo

**Branch**: `spec/008-react-admin-provider` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-react-admin-provider/spec.md`

## Summary

Build ADR-008 in two parts: a package `@relate/react-admin` whose `createDataProvider(client, schema)` turns react-admin's list, read and write calls into parameterised statements over a core client, and an unpublished Vite and React demo, `demos/react-admin`, whose records persist in an application graph (ADR-009, ADR-010). The package depends on a narrow slice of the core's client (`query`, `status`, `diagnostic`), so its contract tests run against the real engine in Node and the demo's browser tests run the same provider through the real client, worker and store.

The engine behaviours the ADR listed as "to confirm" were probed during planning ([research.md](research.md), [probes/](probes/)), and the probes changed three decisions: the engine enforces per-label uniqueness constraints and the package creates one on each resource's `id` (which also supplies the lookup index, replacing the `schemaIndexes` of the ADR's review amendment); the ADR's relationship replacement deletes the old relationship when the target is missing, so writes match every target first; and a plain reference fill duplicates rows when a node has two relationships of the type, so the fill uses `head(collect())`. SKIP and LIMIT accept parameters, so the interpolation fallback is not needed. The remaining items to confirm are small and have early tasks.

## Technical Context

**Language/Version**: TypeScript (ESM), as the other packages; Node 24 for unit tests.

**Primary Dependencies**: `react-admin` ^5 and `@relate/web` as peers of the package (types only at run time); the demo pins `react-admin` to an exact 5.x (5.15.6 at planning), with React, Vite and the peers react-admin names. `@relate/relate-wasm` as a dev dependency for the contract tests.

**Storage**: the demo's application graph, store `react-admin-demo` (ADR-009), catalog entry per ADR-010. The package stores nothing.

**Testing**: Vitest in Node against the real engine (in-process client, research R11) for the package; Playwright in Chromium, Firefox and WebKit over the demo's built preview; a package install test as for the other packages; a `covers-ra:` trace check.

**Target Platform**: desktop Chromium, Firefox, WebKit (WebKit in a persistent profile), as the core's tests.

**Project Type**: a library package plus an unpublished application (a workspace app under `demos/`).

**Performance Goals**: a list costs at most two statements; every resource's `id` carries a uniqueness constraint that owns the lookup index (SC-009; index use is not asserted, research R8). Time to first lists on screen from a clean checkout is measured once and labelled single-run (SC-004).

**Constraints**: every sort and filter name is declared; every value is a parameter (FR-006); the provider never retries; the package imports no engine code and references no repository path (FR-031); no change to the core unless an early task shows one is needed.

**Scale/Scope**: the demo has 6 companies, 50 people and 10 projects; lists page at the react-admin default.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Decisions Before Code | ADR-008 is accepted (parents RFC-005, RFC-006; builds on ADR-009, ADR-010). Where planning found the ADR incomplete (the constraint in place of `schemaIndexes`, the order of matching in writes, the fill form), the amendment is a task, written before the statements are built. | Pass |
| II. Core First, Thin Adapters | No adapter is involved. The package uses the core's client through its exported types only; the demo is a consumer like any application. | Pass |
| III. The Page Works Without the Graph | The demo's shell, navigation and the storage notice render before the client is ready; list regions show react-admin's loading state, and a failed client shows the failure message instead of a blank page (FR-034). | Pass |
| IV. Faults Are Contained | The provider throws 503 on a failed client and relies on the core's worker replacement; a visitor-typed filter cannot run a statement the schema did not allow; the provider passes a timeout to every statement, because `Client.query()` has none of its own (research R16, FR-033). | Pass |
| V. Specified Behavior Is Tested and Measured | Every MUST has a `covers-ra:` test (FR-030). Figures (SC-004, SC-009) are single runs, labelled. The engine assumptions become tests (R2). | Pass |
| VI. The Engine Stays Upstream | Only openCypher forms the engine already accepts; the constraints and statements are forms the engine already supports; nothing is worked around. | Pass |

No violations; the Complexity Tracking table is empty.

*Re-check after design*: the narrow client interface (R1) and the contract's statement forms add no dependency beyond the core's types. Still a pass.

## Project Structure

### Documentation (this feature)

```text
specs/008-react-admin-provider/
├── plan.md              # This file
├── research.md          # Phase 0: decisions, engine findings, items to confirm
├── data-model.md        # Phase 1: schema, record, errors, demo data
├── quickstart.md        # Phase 1: how to run each check
├── probes/              # Phase 0: scripts that ran the engine assumptions
├── contracts/
│   ├── provider-api.md  # the package's exports and calls
│   └── statements.md    # the statement forms
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
packages/react-admin/            # new: @relate/react-admin
├── package.json                 #   peers react-admin ^5, @relate/web; scripts test:react-admin, ...-package, ...-trace
├── src/
│   ├── schema.ts                #   Schema types, validation, ensureSchema (the constraints)
│   ├── filter.ts                #   filter and sort translation: names checked, values coerced and bound
│   ├── statements.ts            #   the statement forms of contracts/statements.md
│   ├── record.ts                #   envelope rows to records (fill, nulls)
│   ├── errors.ts                #   ProviderError, envelope and client failure mapping
│   ├── provider.ts              #   createDataProvider: the nine calls
│   └── index.ts
├── tests/
│   ├── unit/                    #   contract tests over an in-process client with the real engine; engine assumptions
│   ├── helpers/                 #   the in-process ProviderClient over RelateDb
│   ├── package/                 #   pack, install in a clean project, run a list call
│   └── trace/check-trace.ts     #   covers-ra tags
├── vitest.config.ts
├── vitest.package.config.ts
├── tsconfig.json
└── README.md

demos/react-admin/            # new: unpublished demo (package react-admin-demo)
├── package.json                 #   pins react-admin; scripts dev, build, preview
├── index.html
├── src/
│   ├── main.tsx                 #   creates the client (application mode), mounts the app
│   ├── App.tsx                  #   react-admin <Admin> and the three resources
│   ├── schema.ts                #   the demo's Schema
│   ├── seed.json                #   generated graph data document
│   ├── resources/               #   companies, people, projects: list, edit, create
│   ├── CompanyPage.tsx          #   a company with its people and projects (getManyReference)
│   ├── StatementPanel.tsx       #   shows what onStatement reported
│   ├── StorageNotice.tsx        #   client.storage, requestPersistence button
│   ├── FailureScreen.tsx        #   the six failure reasons and the confirmed reset (no export: the core cannot export from a failed client)
│   └── ResetControl.tsx         #   exportApplication then confirmed resetApplication
├── scripts/make-seed.ts         #   deterministic seed generator
├── tests/browser/               #   Playwright, three browsers (create, filter, sort, paging, reference, delete, reload, second tab, reset)
├── playwright.config.ts
└── README.md

pnpm-workspace.yaml              # adds demos/*
package.json                     # new scripts joined into test:units, test:browsers-all, test:packages-all, test:traces-all
CLAUDE.md                        # a line for the package and the demo
design/adr/ADR-008-*.md          # an amendments section (results of R2 to R8)
```

**Structure Decision**: the package holds only translation and no interface; the demo holds all interface code and imports the package by workspace link. Statement forms live in one module (`statements.ts`) so the contract and the code agree by review; `filter.ts` is the only place a name is interpolated.

## Phases

1. **Settle the engine assumptions.** Turn the probes into unit tests (`engine assumptions`), run the **Confirm** items (R6 to R8, R10, the reference filter with several ids), and amend ADR-008 with the findings before any statement is fixed. This is User Story 7, and the first group of tasks.
2. **The package.** Schema and `ensureSchema`; reads (`getList` and the filter translation, `getOne`, `getMany`, `getManyReference`); writes (`create`, `update`, `updateMany`, `delete`, `deleteMany`) with the cause reads; errors and the 503 path; `onStatement`. Each with contract tests. User Stories 1 to 3.
3. **The demo.** Workspace entry, seed generator, schema, resources, company page, statement panel; the application client; storage notice, failure screens and reset control. User Stories 4 and 5.
4. **Checks and wiring.** Browser tests in three browsers, the package install test, the trace check, scripts into the aggregate checks, READMEs, `CLAUDE.md`. User Story 6.
5. **Verify and measure.** The full suite; the clean-checkout time (SC-004) and statement counts (SC-009) recorded as single runs.

Phases 2 and 3 can overlap once phase 1 is done: the demo needs the provider's calls to exist, but its shell, seed and storage screens do not.
