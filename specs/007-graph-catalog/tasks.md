---
description: "Task list for the graph catalog in the core package"
---

# Tasks: The Graph Catalog in the Core Package

**Input**: Design documents from `/specs/007-graph-catalog/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-010 (accepted 2026-11-10) on ADR-001, ADR-003, ADR-009 and SPIKE-009 to SPIKE-011. Decisions R1 to R14 are in research.md; R3 and R9 are measured by tasks below before the code that depends on them is finished.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers-cat: FR-…, SC-…` comment (not `// covers-app:`, which belongs to specification 006); `test:catalog-trace` fails for any untagged requirement (FR-027).

**Organization**: Tasks are grouped by user story. US1 to US4 are P1 and together are the MVP; they run in order because each extends `lifecycle.ts` or `worker.ts`. US5 to US7 are P2. The lifecycle modules take an `Engine` and a `Catalog`, so their tests run in Node against the real engine with the in-memory catalog storage (research R1); only what needs the browser (the file, Web Locks, tabs, termination, directory listing) is tested in the browsers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root. `packages/web` is the only package that changes (FR-024): do not edit `packages/astro`, `packages/nextjs`, `packages/observable`, `packages/sveltekit`, the conformance site or `vendor/`.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- A finding that changes ADR-010 is written into it as a dated amendment in the task that finds it.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test configuration, scripts, trace check

- [X] T001 Create `packages/web/vitest.catalog.config.ts` (include `tests/catalog/unit/**/*.test.ts`, environment `node`) and `packages/web/playwright.catalog.config.ts` (copy of `playwright.application.config.ts` with `testDir: "tests/catalog/browser"`, the harness server on port 5177, the same three projects, JSON report to `reports/catalog-playwright.json`); do not edit the existing configs
- [X] T002 Add scripts to `packages/web/package.json`: `test:catalog` (`vitest run --config vitest.catalog.config.ts --reporter=default --reporter=json --outputFile.json=reports/catalog-vitest.json`), `test:catalog-browsers` (`playwright test --config playwright.catalog.config.ts`), `test:catalog-trace` (`tsx tests/catalog/trace/check-trace-catalog.ts`); add the same three to the root `package.json` as `pnpm --filter @relate/web …` and append them to `test:units`, `test:browsers-all` and `test:traces-all`
- [X] T003 [P] Create `packages/web/tests/catalog/trace/check-trace-catalog.ts`, modelled on `tests/application/trace/check-trace-application.ts`: read `specs/007-graph-catalog/spec.md` for `**FR-nnn**` and `**SC-nnn**`, read `// covers-cat: …` tags from `tests/catalog/**/*.{test,spec}.ts`, and (unless `--static`) require every tagged file to pass in `reports/catalog-vitest.json` and `reports/catalog-playwright.json`; fail naming each untagged id (FR-027)
- [X] T004 [P] Create the browser harness `packages/web/tests/catalog/browser/harness/{vite.config.ts,index.html,harness.ts}`, modelled on the application harness: `window.app` exposes `createClient`, `inRanges`, `listGraphs`, `removeGraph`, `resetCatalog` (added as they exist) and a `make(options)` that stores the client on `window.client`; the page shows `status`, `storage` and the listing for the manual check in quickstart.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Constants, types, the file, the storage seam, the `Catalog`, and the two measurements the design depends on. No behaviour changes yet.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Edit `packages/web/src/config.ts`: rename `STORED_COPY_DIR` to `CATALOG_DIR` (`"relate-web"`), add `CATALOG_FILE = "catalog.json"`, `CATALOG_LOCK = "relate-web:catalog"` and `CATALOG_FORMAT = 1`; keep `MARKER_LABEL` and `MARKER_FORMAT` until T028 removes them
- [X] T006 [P] Create `packages/web/src/catalog/types.ts`: `State`, `Entry` (application and cache variants per data-model.md), `CatalogFile`, `ReadResult` (`missing`, `unreadable`, `newer`, or the parsed file), `ListingItem`
- [X] T007 [P] Create `packages/web/src/catalog/file.ts`: `parseCatalog(text)` returning a `ReadResult` per research R6 (unparseable or missing `format`/`graphs` is `unreadable`; `format` above 1 is `newer`); `validateEntry(key, entry)` returning the entry or a reason (kind agrees with the key prefix, `state` known for the kind, application `version` positive integer and `seeded` boolean, `target` present and above `version` exactly when `migrating`, cache `revision` non-empty when `ready`); unknown extra fields are kept
- [X] T008 [P] Create `packages/web/src/catalog/storage.ts` (the `CatalogStorage` seam: `read(): Promise<string | null>`, `replace(text): Promise<void>`, `remove(): Promise<void>`, `withLock<T>(mode: "shared" | "exclusive", fn): Promise<T>`) and `packages/web/src/catalog/memory-storage.ts` (a string and a promise-chain mutex with shared/exclusive semantics)
- [X] T009 Create `packages/web/src/catalog/catalog.ts`: `Catalog` over a `CatalogStorage` and an injectable clock: `read()` (under the shared lock, returns the `ReadResult`), `entry(store)`, `update(store, change)` (under the exclusive lock: read, apply one change, replace; an unreadable or newer file is never overwritten and the call rejects with that reason), `setEntry`, `deleteEntry`, `reset()`; every write sets `updatedAt` from the clock and preserves other entries and unknown fields
- [X] T010 [P] Write `packages/web/tests/catalog/unit/file.test.ts` and `catalog.test.ts` (`// covers-cat: FR-001, FR-002, FR-003`): the parse results for each malformed file, entry validation for each rule, `update` preserving other entries, two interleaved `update` calls over the memory storage losing neither, and an unreadable file not being overwritten
- [X] T011 Measure R3 (research): in `packages/web/tests/catalog/browser/probe.spec.ts`, time `MATCH (n) RETURN count(n)`, `SHOW INDEXES` and a first-row probe on stores of 1,000 and 100,000 nodes in Chromium, Firefox and WebKit; write the result to `packages/web/reports/catalog-probe.json` with method and environment. Result: counts stay at or below 0.1 ms and the first-row probe scales (about 80 ms at 100,000), so the classifier counts (research R3); no ADR amendment
- [X] T012 Measure R9 (research): in `packages/web/tests/catalog/browser/remove-held.spec.ts`, with one tab holding a store, call `removeEntry` on its `relate/<store>` directory from another tab in the three browsers; record whether it fails, with which error name, and whether the held store keeps working; write `packages/web/reports/catalog-remove.json` and, if a browser removes held files, amend ADR-010 §2.5 with the extra step before T046

**Checkpoint**: the file, the seam and the `Catalog` pass their unit tests; R3 and R9 are recorded.

---

## Phase 3: User Story 1 - A graph's bookkeeping lives outside its data (Priority: P1) 🎯 MVP

**Goal**: an application opens, seeds, and reopens using a catalog entry; no bookkeeping node exists; deleting every node ends as `store-lost`.

**Independent Test**: open an application client, count all nodes, write a record, reload, count again, read the entry.

### Tests for User Story 1 ⚠️ write first, they must fail

- [X] T013 [P] [US1] Write `packages/web/tests/catalog/unit/classify.test.ts` (`// covers-cat: FR-010, FR-011, FR-012, FR-013`): every row of the FR-010 table (including both `seeded` values over an empty store, `ready` below, equal and above, and each in-progress state), the unreadable and `newer` catalog, a malformed entry, and `store-unmarked` whose message names `_RelateApplication` when a node carries it
- [X] T014 [P] [US1] Write `packages/web/tests/catalog/unit/first-run.test.ts` (`// covers-cat: FR-004, FR-007`, SC-001): first run writes `seeding` before any data and `ready` last with `version` and `seeded`; a count of all nodes equals the seed's; a seed with no nodes gives `seeded: false` and an empty store reopens; a seed containing a node labelled `_RelateApplication` loads as any label; a second open reads nothing of the seed
- [X] T015 [P] [US1] Write `packages/web/tests/catalog/browser/first-run.spec.ts` (`// covers-cat: FR-001, FR-007`, SC-001), all three browsers: first run, reload keeps the visitor's record and the entry is not rewritten, the catalog file holds the entry, the graph holds no extra node, and a statement that deletes every node ends the next open as `store-lost` with the store untouched and `resetApplication()` recovering it

### Implementation for User Story 1

- [X] T016 [US1] Rewrite `packages/web/src/worker/application/classify.ts` to classify an entry (or none) plus `hasNodes`/`hasIndexes` and the code's version per data-model.md; add the `store-lost` reason; return the facts it needs lazily so a ready `seeded: false` store is not counted
- [X] T017 [US1] Edit `packages/web/src/worker/application/lifecycle.ts`: take a `Catalog` and the store name; `inspect` reads the entry and reads the node count and index list only when the classification needs them (research R3); `firstRun` writes `seeding` (with `version` and `seeded` computed from the seed's node count), loads the seed and indexes, then writes `ready`; delete `rejectMarkerLabel`; make `openApplication` and `needsSeed` async
- [X] T018 [US1] Edit `packages/web/src/worker/application/init.ts`: build the `Catalog` over the OPFS storage (memory storage when the browser has no durable store), pass it with the store name `app-<name>` to `openApplication`; report `store-lost` as an `init-failed` reason; a client in memory writes no catalog entry
- [X] T019 [P] [US1] Edit `packages/web/src/worker/protocol.ts`, `src/client/failure.ts`, `src/client/diagnostic.ts` and `src/client/types.ts` so `store-lost` is an `init-failed` reason, a client failure reason and a diagnostic with the recovery text ("call resetApplication() to start again"); add it to the final-failure set so it is not retried
- [X] T020 [P] [US1] Edit `packages/web/tests/application/unit/helpers.ts` to build a store state by writing a catalog entry (a `stateOf(entry, nodes)` helper over `MemoryCatalogStorage`) in place of creating a marker node, and update `foundations.test.ts`, `first-run.test.ts`, `recovery.test.ts` and `options.test.ts` to use it; assertions about the marker node become assertions about the entry (`// covers-app:` tags stay, they belong to specification 006)

**Checkpoint**: US1 tests pass in Node and in the three browsers; the application unit suite passes with entries.

> Implementation note (2026-11-10): the lifecycle is one switch over the classification, so the code for US2's rows (`seeding`/`resetting` recovery, `importing`, `removing`, `migrating`, the async `migrate` and `importApplication`, deleting the marker) and the browser storage of US3 (`OpfsCatalogStorage`, Web Locks required) was written with US1 (T024 to T028, T032, T033). Their dedicated tests (T021 to T023, T029 to T031) were then written as Phases 4 and 5.

---

## Phase 4: User Story 2 - An interrupted operation is recovered or reported (Priority: P1)

**Goal**: every operation writes intent first; the next open completes or reports it; the import window is closed.

**Independent Test**: build each in-progress entry and store state, open, compare the outcome to FR-010.

### Tests for User Story 2 ⚠️ write first, they must fail

- [X] T021 [P] [US2] Write `packages/web/tests/catalog/unit/recovery.test.ts` (`// covers-cat: FR-007, FR-008, FR-010, FR-014`, SC-004, SC-005): `seeding` and `resetting` reset and seed again; `importing` fails `import-interrupted` and changes nothing; `removing` finishes and runs a first run; `migrating` resumes from `version` and ends equal to an uninterrupted run; `resetApplication()` writes `resetting` first; each write ordering is asserted by recording the entry before and after the data step with a failing engine at each step
- [X] T022 [P] [US2] Write `packages/web/tests/catalog/unit/transfer.test.ts` (`// covers-cat: FR-007, FR-004`, SC-005): import writes `importing` before `engine.reset()`, the entry ends `ready` with the envelope's version and `seeded`, migrates when below the code's version, and a failure injected between the reset and the load leaves `importing` (so the next open fails `import-interrupted`, not a silent first run); export contains every node and no bookkeeping filter remains
- [X] T023 [P] [US2] Write `packages/web/tests/catalog/browser/recovery.spec.ts` (`// covers-cat: FR-007, FR-010, FR-014`, SC-004, SC-005), all three browsers: worker terminated mid-seed, mid-migration, mid-import and mid-reset, then reopened, matching the table; the data of a resumed migration equals an uninterrupted run's

### Implementation for User Story 2

- [X] T024 [US2] Edit `packages/web/src/worker/application/migrate.ts`: make `migrate` async over a `Catalog`; for each version write `migrating` (`version` n−1, `target` n) before its steps and `ready` (`version` n) after the last one; delete `markerSnapshot`/`restoreMarker` use and the marker-guard error; keep `MigrationError` for a missing entry or a failing statement, which leaves the entry `migrating` at the last completed version
- [X] T025 [US2] Edit `packages/web/src/worker/application/lifecycle.ts`: `resetApplication` path writes `resetting` then runs reset and first run; `seeding` and `resetting` entries reset and seed again; `importing` returns `import-interrupted`; `removing` resets the store, deletes the entry and runs a first run (research R10); `migrating` calls `migrate` from the entry's `version`
- [X] T026 [US2] Edit `packages/web/src/worker/application/transfer.ts`: `importApplication` async over a `Catalog`: validate everything, write `importing`, `engine.reset()`, load, write `ready` (envelope's `version`, `seeded` from the document), then `migrate`; `NODE_PAGE` and `LINK_PAGE` lose the marker exclusions; `exportApplication` reads the application's version from the entry
- [X] T027 [US2] Edit `packages/web/src/worker/worker.ts`: `importApp` passes the catalog and store name; `initApplication` result paths unchanged
- [X] T028 [US2] Delete `packages/web/src/worker/application/marker.ts`; remove `MARKER_LABEL` and `MARKER_FORMAT` from `src/config.ts`; remove the label check from `src/application/ranges.ts`; update `tests/application/unit/{migrate,ranges,transfer,docs}.test.ts` for the removed guard and the removed reserved label (the README rule is rewritten in T052)

**Checkpoint**: US1 and US2 pass; no source file mentions the marker.

---

## Phase 5: User Story 3 - Several tabs share the catalog without losing updates (Priority: P1)

**Goal**: the browser implementation of the storage seam: the file in the origin-private root under the Web Lock, safe for several tabs, readable beside a held store.

**Independent Test**: three tabs write 100 changes each; a tab reads while another holds a store.

### Tests for User Story 3 ⚠️ write first, they must fail

- [X] T029 [P] [US3] Write `packages/web/tests/catalog/browser/tabs.spec.ts` (`// covers-cat: FR-005, FR-006`, SC-002, SC-003), all three browsers: three tabs each making 100 `Catalog.update` calls end with all 300 changes; a reader looping while a writer replaces 300 times sees no torn, missing or failed read; the catalog is readable and another graph's entry writable while one tab holds a store and its queries continue
- [X] T030 [P] [US3] Write `packages/web/tests/catalog/browser/lock-release.spec.ts` (`// covers-cat: FR-005`, SC-002): a worker holding the exclusive lock is terminated, and separately its tab closed, in the three browsers; a waiting tab reads a whole catalog and acquires the lock within 100 ms
- [X] T031 [P] [US3] Write `packages/web/tests/catalog/unit/storage-fallback.test.ts` (`// covers-cat: FR-006, FR-009`): with a fake file handle without `createWritable`, the replace goes through the sync access handle; `storageAvailable` is false when `navigator.locks` is absent and true with both APIs

### Implementation for User Story 3

- [X] T032 [US3] Create `packages/web/src/catalog/opfs-storage.ts`: `OpfsCatalogStorage` implementing the seam over `relate-web/catalog.json` — `read` via `getFile().text()` (null when absent), `replace` via `createWritable()` with a fallback to `createSyncAccessHandle()` (truncate, write, flush, close), `remove` via `removeEntry`, `withLock` via `navigator.locks.request(CATALOG_LOCK, { mode }, fn)`; creates `relate-web/` on write
- [X] T033 [US3] Edit `packages/web/src/worker/application/open-store.ts`: `storageAvailable()` requires `navigator.storage.getDirectory` and `navigator.locks`; the `onUnavailable` rule is applied as before when either is missing; update `tests/application/unit/open-store.test.ts` for the new requirement
- [X] T034 [US3] Edit `packages/web/src/worker/application/init.ts` and `src/worker/worker.ts` to construct `OpfsCatalogStorage` once per worker and share it between the lifecycle and the cache path; export `Catalog` construction through one function `openCatalog()` in `src/catalog/index.ts`

**Checkpoint**: tabs, locks and fallbacks pass in the three browsers.

---

## Phase 6: User Story 4 - Content caches use the catalog (Priority: P1)

**Goal**: the cache open path uses the entry; the stored-copy file is gone except for removing a leftover.

**Independent Test**: load a descriptor-backed graph, reload for a restore, change the revision for a rebuild, check no `relate-web/<id>.json` remains.

### Tests for User Story 4 ⚠️ write first, they must fail

- [X] T035 [P] [US4] Write `packages/web/tests/catalog/unit/cache.test.ts` (`// covers-cat: FR-015, FR-016`): with the memory storage, restore only for `ready` with the same revision and a node count equal to `data.nodes`; every other case (no entry, `loading`, `removing`, a different revision, a count mismatch, an empty store, an unreadable catalog) writes `loading`, resets if not empty, loads, creates indexes and writes `ready` last, and an unreadable catalog does not fail the open and is not overwritten
- [X] T036 [P] [US4] Write `packages/web/tests/catalog/browser/cache.spec.ts` (`// covers-cat: FR-015, FR-016`, SC-008), all three browsers: restore with no request for the data; rebuild on a new revision; a leftover `relate-web/<id>.json` is removed on the next open; a restore of 5,000 pages within the recorded baseline (`checkBaseline`)

### Implementation for User Story 4

- [X] T037 [US4] Create `packages/web/src/worker/cache.ts` with `canRestore`, `beginRebuild` and `finishRebuild`: the restore-or-rebuild decision of FR-015 over the `Catalog` (the worker keeps the fetch and load between them); `sweepScoped` still runs before the node-count check; a catalog that cannot be used, or a write that fails, only means no entry is written
- [X] T038 [US4] Edit `packages/web/src/worker/worker.ts`: replace `canRestore`, `readStoredCopy`, `removeStoredCopy` and `writeStoredCopy` with `openCache`; call `removeLegacyCopy(id)` on every cache open
- [X] T039 [US4] Reduce `packages/web/src/worker/stored-copy.ts` to `removeLegacyCopy(id)` (delete `relate-web/<id>.json` if present; ignore absence) and rename the file `legacy-copy.ts`; update imports
- [X] T040 [US4] Rewrite the browser tests that asserted the stored copy: `tests/browser/stored-copy.spec.ts` becomes `tests/browser/catalog-entry.spec.ts` (reads the entry instead of the file), and update `tests/browser/per-page.spec.ts`, `fixtures.ts` and `helpers.ts` where they read or write `relate-web/<id>.json`; keep every test's behaviour and its `// covers:` tags; inspect `conformance/scenarios.ts` and change only a stored-copy assertion if one exists

**Checkpoint**: US1 to US4 (the MVP) pass; `pnpm test:unit`, `test:application` and `test:catalog` are green.

---

## Phase 7: User Story 5 - A page can list what the origin has stored (Priority: P2)

**Goal**: `listGraphs` reconciles entries with the `relate/` directory.

**Independent Test**: create an application and a cache, add an unregistered directory, delete another store's directory, list.

### Tests for User Story 5 ⚠️ write first, they must fail

- [X] T041 [P] [US5] Write `packages/web/tests/catalog/browser/list.spec.ts` (`// covers-cat: FR-017, FR-018`, SC-007), all three browsers: items for an application and a cache with kind, name, state, version or revision and `present`; an unregistered directory; a missing directory; no store file read without `sizes` (spy on `getFile`); sizes and modification times with `sizes: true` for 10 stores (time recorded in `reports/catalog-list.json`); listing beside a held store, opening none; an empty origin lists nothing; an unreadable or newer catalog lists directories as `unregistered`

### Implementation for User Story 5

- [X] T042 [US5] Create `packages/web/src/catalog/directory.ts`: list the directories under `relate/` (names only), sum a store's slot files' sizes and newest `lastModified` (only when asked), tolerate a missing `relate/`
- [X] T043 [US5] Create `packages/web/src/catalog/api.ts` with `listGraphs(options?)` per contracts/catalog-api.md, and export it from `src/catalog/index.ts` and `src/index.ts`; add it to the harness page (T004)

---

## Phase 8: User Story 6 - A page can remove a graph or reset the catalog (Priority: P2)

**Goal**: `removeGraph` (intent first, refusing a held store, restoring only an unchanged entry) and `resetCatalog`.

**Independent Test**: remove an idle graph, a held graph, remove under a concurrent entry change, corrupt the catalog and reset.

### Tests for User Story 6 ⚠️ write first, they must fail

- [ ] T044 [P] [US6] Write `packages/web/tests/catalog/unit/remove.test.ts` (`// covers-cat: FR-019, FR-020, FR-021, FR-022`): `kind-mismatch` and the application-kind requirement; the entry written `removing` before the directory removal; the restore only when the entry still says `removing` with the same `updatedAt`, with a concurrent holder write interleaved by the memory storage; `resetCatalog` deleting only the file; the core never calling remove for an application graph (a spy on the cache's stale path)
- [ ] T045 [P] [US6] Write `packages/web/tests/catalog/browser/remove.spec.ts` (`// covers-cat: FR-019, FR-020, FR-021, FR-022`), all three browsers: removal of an idle cache and application graph removes directory and entry; a held store rejects `locked` and its entry is as the holder left it; a holder writing a new state during the removal is not overwritten; a tab opening a store left `removing` holds it before finishing; a corrupt catalog fails application opens with `store-unreadable` naming the catalog, `resetCatalog()` recovers it, and a store with data and no entry then fails `store-unmarked`

### Implementation for User Story 6

- [ ] T046 [US6] Edit `packages/web/src/catalog/api.ts`: `removeGraph(store, { kind })` and `resetCatalog()` per contracts/catalog-api.md and research R9 (shaped by T012's result); typed rejections `locked`, `kind-mismatch`, `unavailable`
- [ ] T047 [US6] Edit `packages/web/src/catalog/index.ts` and `src/index.ts` to export `removeGraph` and `resetCatalog`; add remove and reset buttons to the harness page; add the page-callable operations to the README stub for T052

---

## Phase 9: User Story 7 - Existing checks pass and the decisions are amended (Priority: P2)

**Goal**: no regression; ADR-009, ADR-003, the 006 spec and the README record the change.

**Independent Test**: run the suites in quickstart.md; read the two ADRs and the README.

- [ ] T048 [US7] Run `pnpm test:unit`, `test:application`, `test:catalog`, `test:browsers`, `test:application-browsers`, `test:catalog-browsers`, `test:conformance`, `test:drift`, and the traces; fix only what the change broke, and record any restore-baseline difference against SC-008 in `reports/catalog-restore.json`
- [ ] T049 [P] [US7] Amend `design/adr/ADR-009-application-graphs-in-the-core.md` §6 with a dated entry: the marker replaced by the catalog entry, the lifecycle table of §2.2 superseded by ADR-010 §2.3, `store-lost` added to the failure reasons of §2.4, the migration guard against changing the marker removed, the findings of T011 and T012; change its status line to note the amendment
- [ ] T050 [P] [US7] Amend `design/adr/ADR-003-graph-descriptor.md` with a dated amendments section: §2.4 and §2.5 replaced by the entry, `relate-web/<id>.json` removed on the next open, the descriptor itself unchanged
- [ ] T051 [P] [US7] Add a note under the Overview of `specs/006-application-graphs/spec.md` that FR-006 to FR-009 and FR-027 are superseded where they name the marker or the cache's stored copy, pointing to `specs/007-graph-catalog/spec.md`; change nothing else there
- [ ] T052 [US7] Update `packages/web/README.md`: remove the marker description and the migration rule about excluding it; add a catalog section (the file, the entry states, `store-lost`, `listGraphs`, `removeGraph`, `resetCatalog`, what a full clear looks like to a page, the empty-seed limit); update `tests/application/unit/docs.test.ts` to check the new text
- [ ] T053 [US7] Update the root `CLAUDE.md` project-state paragraph and command list for the catalog (specification 007, ADR-010, the three new scripts) and mark the spec Implemented
- [ ] T054 [US7] Run `pnpm test:catalog-trace` and `pnpm test:application-trace`; make every FR and SC of this specification report a passing, tagged test (FR-027)

---

## Dependencies & Execution Order

- Phase 1 then Phase 2 (T005 to T012). T011 and T012 can run any time after T009 and the harness (T004) exist, and before T017 and T046 respectively.
- US1 (T013 to T020) needs Phase 2. US2 (T021 to T028) extends the lifecycle files US1 edits, so it follows US1. US3 (T029 to T034) can start once T008 exists for its unit tests, but T034 edits `init.ts` and `worker.ts` after US2. US4 (T035 to T040) edits `worker.ts` after T034.
- US5 (T041 to T043) needs T034. US6 (T044 to T047) needs T043 and T012. US7 comes last; T049 to T051 can be written once T011 and T012 have results.

### Parallel opportunities

T003 and T004; T006, T007 and T008; every test-writing task inside a story (the `[P]` ones); T049, T050 and T051.

## Implementation Strategy

**MVP**: Phases 1 to 6 (US1 to US4) deliver the catalog for both kinds of graph, recovery, several tabs and the cache. Validate at the Phase 6 checkpoint: `test:unit`, `test:application`, `test:catalog` and the browser suites pass and no source file names the marker. US5 to US7 add the page-callable operations, the amendments and the documentation, and each can ship on its own.

**Risk order**: T011 (probe cost) and T012 (held removal) first, because either can change the design; the interrupted-operation tests (T021 to T023) next, because the intent-first order is the feature's safety property.
