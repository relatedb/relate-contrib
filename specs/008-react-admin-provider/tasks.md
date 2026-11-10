---
description: "Task list for the react-admin data provider and starter"
---

# Tasks: A react-admin Data Provider and Local-First Starter

**Input**: Design documents from `/specs/008-react-admin-provider/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md. Implements ADR-008 (accepted 2026-11-10) on ADR-001, ADR-002, ADR-003, ADR-009 and ADR-010. Decisions R1 to R15 are in research.md. The engine assumptions were probed while planning (`probes/`); Phase 2 turns them into tests and records the results in ADR-008 before any statement is fixed.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers-ra: FR-…, SC-…` comment (not `// covers:`, `// covers-app:` or `// covers-cat:`, which belong to other specifications); `test:react-admin-trace` fails for any untagged requirement (FR-030).

**Organization**: Tasks are grouped by user story. US1 to US4 are P1 and together are the MVP; US1 to US3 build the package and run in order because each extends `provider.ts`; US4 (the starter) can start once US1 has a working `getList`. US5 to US7 are P2; US7 (the engine assumptions) is done first, as Phase 2. Package tests run in Node against the real engine through an in-process client (research R11); only the starter's behaviour in a browser is tested in the browsers.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US7) from spec.md
- Paths are relative to the repository root. The core (`packages/web`) does not change (spec Clarifications): do not edit `packages/web`, `packages/astro`, `packages/nextjs`, `packages/observable`, `packages/sveltekit`, the conformance sites or `vendor/`. A finding that needs a core change is written up as an ADR amendment and put to the user first.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- A finding that changes ADR-008 is written into it as a dated amendment in the task that finds it.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The two workspace projects, their configuration, and the trace check

- [X] T001 Add `"starters/*"` to `pnpm-workspace.yaml` (the package is already covered by `packages/*`)
- [X] T002 Create `packages/react-admin/package.json` (`name` `@relate/react-admin`, `version` `0.0.0`, `private` true, `type` module, `sideEffects` false, `exports` `.` pointing at `dist/index.js` and `dist/index.d.ts`, `peerDependencies` `react-admin` `^5` and `@relate/web` `*`, `devDependencies` `react-admin` and `react` for types, `@relate/web` `workspace:*`, `@relate/relate-wasm` `*`, `@playwright/test`, `tsx`, `typescript`, `vitest` at the versions `packages/sveltekit/package.json` uses; scripts `build` `tsc -p tsconfig.json`, `typecheck`, `test:react-admin` `vitest run --reporter=default --reporter=json --outputFile.json=reports/vitest.json`, `test:react-admin-package` `vitest run --config vitest.package.config.ts --reporter=default --reporter=json --outputFile.json=reports/package.json`, `test:react-admin-trace` `tsx tests/trace/check-trace.ts`), `tsconfig.json` (as `packages/sveltekit/tsconfig.json`, strict, declarations), `vitest.config.ts` (include `tests/unit/**/*.test.ts`, environment `node`) and `vitest.package.config.ts` (as `packages/sveltekit/vitest.package.config.ts`)
- [X] T003 [P] Create `starters/react-admin/package.json` (`name` `react-admin-starter`, `private` true, `type` module; `dependencies` `react-admin` pinned to the exact version `5.15.6` with no range, `react`, `react-dom`, `@relate/react-admin` `workspace:*`, `@relate/web` `workspace:*`; `devDependencies` `vite`, `@vitejs/plugin-react`, `@relate/relate-wasm` `*`, `@playwright/test`, `vitest`, `tsx`, `typescript`; scripts `dev` `vite`, `build` `tsc --noEmit && vite build`, `preview` `vite preview --host 127.0.0.1 --port 5190`, `seed` `tsx scripts/make-seed.ts`, `test:react-admin-browsers` `playwright test`), `index.html`, `vite.config.ts` (react plugin, `server.host` `127.0.0.1`) and `tsconfig.json` (FR-026)
- [X] T004 [P] Create `starters/react-admin/playwright.config.ts`: three projects (Chromium, Firefox, WebKit), `testDir` `tests/browser`, `webServer` that runs `pnpm build && pnpm preview` and waits on port 5190, JSON report to `reports/playwright.json`, as `packages/web/playwright.catalog.config.ts` does for its harness
- [X] T005 [P] Create `packages/react-admin/tests/trace/check-trace.ts`, modelled on `packages/sveltekit/tests/trace/check-trace.ts`: read `specs/008-react-admin-provider/spec.md` for `**FR-nnn**` and `**SC-nnn**`, read `// covers-ra: …` tags from `packages/react-admin/tests/**/*.{test,spec}.ts` and `starters/react-admin/tests/**/*.{test,spec}.ts`, and (unless `--static`) require every tagged file to pass in `packages/react-admin/reports/vitest.json`, `reports/package.json` and `starters/react-admin/reports/playwright.json`; fail naming each untagged id (FR-030); honour a `TRACE_SPEC` environment variable naming another specification file, as `packages/sveltekit/tests/trace/check-trace.ts` does, so T044's test can show an untagged id being reported
- [X] T006 Run `pnpm install` and `pnpm --filter @relate/react-admin typecheck` to confirm the workspace resolves both projects; fix configuration until it does (no source yet, so give `src/index.ts` an empty export for this check)

---

## Phase 2: Foundational (User Story 7 and shared pieces)

**Purpose**: The engine assumptions as tests, the schema, the errors and the test client. No provider behaviour yet. **⚠️ CRITICAL**: no story work begins until the engine assumptions are recorded and ADR-008 is amended (T012), because the statement forms depend on them.

### Tests

- [ ] T007 [P] Create `packages/react-admin/tests/helpers/in-process-client.ts`: an in-process `ProviderClient` over `RelateDb` initialised from the vendored binary in Node (as `packages/web/tests/application/unit/helpers.ts` does), whose `query(statement, params)` runs the statement with the parameters as JSON, parses the envelope and returns it, with `status` `"ready"` and `diagnostic` null; a `recording` wrapper that lists every statement, its parameters and the `opts` (the `timeoutMs`) passed to `query`, in order; a failed variant (`status` `"failed"`, `diagnostic` with a reason and text) and a delayed variant (resolves its first query after a timer) for US3; and a `load(client, fixture)` that creates the fixture nodes and relationships from `tests/helpers/fixture.ts` (research R11)
- [ ] T008 [P] Create `packages/react-admin/tests/helpers/fixture.ts`: a small schema (companies, people with `company`, projects with `company` and `lead`) matching the starter's shape in data-model.md, and fixture data of about 12 people (some with the same `age`, some with no `age`, one name with different letter case), 3 companies and 4 projects, with string ids
- [ ] T009 Create `packages/react-admin/tests/unit/engine-assumptions.test.ts` (`// covers-ra: FR-032, FR-010, FR-012, FR-014`): port `specs/008-react-admin-provider/probes/*.mjs` into tests against the real engine, each asserting what research R2 records: one statement removes and creates a relationship; `SKIP $skip LIMIT $limit`; `toLower(x) CONTAINS toLower($q)`; comparisons on strings and numbers (and the empty result for mixed types); `RETURN n` node value shape with `properties`; `SET n += $props` with a `null` removing the property; detach delete of a missing id counting 0; the reference filter `EXISTS` with one id; the uniqueness constraint (duplicate `CREATE` and `SET n.id` rejected, other label allowed, `CREATE CONSTRAINT … IF NOT EXISTS` idempotent, conflict with a separate index on the same property); the naive replacement losing the relationship when the target is missing against the match-first form changing nothing; `head(collect())` against a plain fill duplicating rows. Add the **Confirm** items as cases: descending order with absent values (assert only that nothing is lost or repeated, research R6); `ORDER BY n.<field>` after the aggregating `WITH` (R7); the reference filter with several ids using `WHERE t.id IN $v` inside `EXISTS` (R3 open item); a seed loaded first and the constraint created over its unique ids afterwards (R3). Where a case fails, record the fallback in `contracts/statements.md` and use it in the statements
- [ ] T010 [P] Create `packages/react-admin/tests/unit/schema.test.ts` (`// covers-ra: FR-003, FR-004`): a valid schema is accepted; each malformed schema throws naming the resource and field (name outside `[A-Za-z_][A-Za-z0-9_]*`, unknown field type, duplicate field, a field named `id`, a reference to an unknown resource, a reference field that collides with a declared field, `searchable` on a number, a direction other than `out` or `in`); `id` is implicitly a sortable and filterable string on every resource; the constraint name for a label is `rel_<Label>_id`

### Implementation

- [ ] T011 Find the existing core test, if any, that covers a statement sent while the client is `loading` and resolving once it is ready (`grep` `packages/web/tests` for it) and write down what you find in the amendment of T012; if no test covers it, add the case to the starter's browser test in T029 instead of changing the core (research R10)
- [ ] T012 Amend ADR-008 (`design/adr/ADR-008-react-admin-provider.md`) with a dated `## 6. Amendments` entry (and mark its row in `design/adr/README.md` as "accepted (amended 2026-11-10)", as ADR-009's row is): the engine results of T009 and T011; the failure screens offer reset only because the core's `exportApplication()` rejects while a client is `failed` (§2.6 said "export or reset"), with export from a failed client recorded as a core follow-up; `ensureSchema` and the per-label uniqueness constraint replace `schemaIndexes` in §2.2 and §2.6 (and the starter passes no `id` index, because a separate index on the same property stops the constraint from being created); `create` relies on the constraint for a duplicate `id` and `update` ignores an `id` in its data; writes match the node and every target first because the ADR's replacement loses the old relationship when the target is missing; the reference fill pages first and uses `head(collect())`; the zero-row cause reads; the `timeoutMs` option passed to every `query` (§2.5, because `Client.query()` has no timeout); `updateMany` and `deleteMany` as single statements; SC-009's wording on index use (research R8). This is the decision record the statements are built from (FR-032)
- [ ] T013 Create `packages/react-admin/src/schema.ts`: the `Schema`, `ResourceSchema`, `FieldSchema` and `ReferenceSchema` types of `contracts/provider-api.md`; `validateSchema(schema)` throwing a `ProviderError`-free `SchemaError` that names the resource and field; the implicit `id` field; `constraintName(label)` returning `rel_<Label>_id`; and a normalised internal form with maps for fields and references. Make T010 pass (FR-003, FR-004)
- [ ] T014 Create `packages/react-admin/src/errors.ts`: `ProviderError` (an `Error` with `status` 400, 404 or 503); `fromEnvelope(envelope)` turning an `error` string into a 400 with the engine's message, and `ConstraintValidationFailed` into a 400 saying the `id` already exists; `fromClientFailure(client)` building the 503 from `diagnostic`; and the mapping of the core's `GraphError` reasons `timeout`, `lost` and `failed` to a 503 saying the statement timed out or giving the client's message (FR-017, FR-018, FR-033)

**Checkpoint**: the engine assumptions are recorded, ADR-008 is amended, the schema validates, and the test client runs statements. Story work can begin.

---

## Phase 3: User Story 1 - Lists, filters, sorting and paging (Priority: P1) 🎯 MVP

**Goal**: `getList`, `getOne`, `getMany` and `getManyReference` over the graph, with safe translation of sort and filter.

**Independent Test**: build a provider over the in-process client holding the fixture and call each read with sort, filter and page parameters (quickstart "The package").

### Tests for User Story 1

- [ ] T015 [P] [US1] Create `packages/react-admin/tests/unit/reads.test.ts` (`// covers-ra: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-027, SC-001, SC-002, SC-003`) with one case per acceptance scenario of User Story 1 and the read edge cases: default order by `id` and `total` equal to the label's count (scenario 1); paging through a sort with ties returns every record once, ascending and descending (scenario 2, SC-003); a `_gte` filter and its `total` (scenario 3); `q` matching in any letter case across the searchable fields (scenario 4); an undeclared sort or filter name rejects 400 and the recording shows no statement sent (scenario 5); a sort or filter value of statement text (`x" RETURN 1 //`, a backtick, a comment marker) is matched as a plain value and the statement text equals the one built for an ordinary value (scenario 6, SC-002); a reference field as a filter key with one id and with several (scenario 7); `getManyReference` equal to `getList` with the reference filter (scenario 8); a record holds the declared properties, each reference field filled, nulls for absent fields and no engine id (scenario 9, SC-001); a declared field ending in `_gt` is never split; a key that is neither declared nor a suffix of a declared filterable field rejects 400; a value that does not convert rejects 400; an empty array matches nothing; `getMany` leaves missing ids out; a page past the end returns no records and the same total; a field not declared `filterable` or `sortable` rejects 400; once the constraints exist, a list sends exactly two statements (data and count), and the first call of a fresh provider sends the constraint statements first and not again
- [ ] T016 [P] [US1] Create `packages/react-admin/tests/unit/ensure-schema.test.ts` (`// covers-ra: FR-002, SC-009`): `ensureSchema` creates one constraint per resource label and is idempotent when run twice; the provider runs it once before its first data statement and not again (the recording shows it first, once); a failure (a store that already holds duplicate ids) rejects 400 naming the resource and is tried again on the next call; the provider creates no separate index on `id`; `SHOW CONSTRAINTS` and `SHOW INDEXES` list the constraint and its owned index after the first call (SC-009)

### Implementation for User Story 1

- [ ] T017 [US1] Create `packages/react-admin/src/filter.ts`: translate a filter object and a sort into where-terms, an order clause and a parameter map, following `contracts/provider-api.md` "Filter conventions" in order (`q`; a key equal to a declared field, `id` or a reference field; a suffixed key whose remainder is a declared filterable field; otherwise 400); coerce values to the declared type (number or numeric string, boolean or `"true"` and `"false"`, string); check the name before any interpolation and backtick-quote it; every value is a parameter (FR-006 to FR-009)
- [ ] T018 [US1] Create `packages/react-admin/src/statements.ts` (read forms): the list data statement (page first, then `head(collect())` fill, then the output order), the count statement, and the one-and-many forms of `contracts/statements.md`, using the fallbacks T009 recorded; the final sort key is `n.id` (FR-005, FR-010, FR-011)
- [ ] T019 [US1] Create `packages/react-admin/src/record.ts`: turn rows (`n` node value and the reference columns) into records from `properties`, fill declared fields that are absent with `null` and each reference field from its column, and never include the engine's ids (FR-004, FR-011)
- [ ] T020 [US1] Add `ensureSchema(client, schema)` to `packages/react-admin/src/schema.ts` (or a new `src/ensure.ts`): one `CREATE CONSTRAINT rel_<Label>_id IF NOT EXISTS FOR (n:`Label`) REQUIRE n.`id` IS UNIQUE` per resource through `client.query`, mapping an engine error to a 400 naming the resource (FR-002)
- [ ] T021 [US1] Create `packages/react-admin/src/provider.ts` and `packages/react-admin/src/index.ts`: `createDataProvider(client, schema, options)` validating the schema, with a memoised `ensureSchema` that is cleared on failure, the client-status check (503 before any statement), `getList`, `getOne`, `getMany` and `getManyReference` (400 when `target` is not a declared reference); export `createDataProvider`, `ensureSchema`, the types and `ProviderError` (FR-001, FR-002, FR-005 to FR-011, FR-018). Make T015 and T016 pass

**Checkpoint**: a developer can build a provider and read records with sort, filter and paging; User Story 1 is independently testable.

---

## Phase 4: User Story 2 - Writes and relationships (Priority: P1)

**Goal**: `create`, `update`, `updateMany`, `delete` and `deleteMany`, each atomic.

**Independent Test**: call each write against the fixture and read back with `getOne` and `getList`.

### Tests for User Story 2

- [ ] T022 [P] [US2] Create `packages/react-admin/tests/unit/writes.test.ts` (`// covers-ra: FR-012, FR-013, FR-014, FR-015, FR-016, FR-027, SC-001`) with one case per acceptance scenario of User Story 2 and the write edge cases: `create` with no `id` generates a unique string `id`, sets the declared fields and creates the relationship for each supplied reference (scenario 1); `update` replaces a reference so exactly one relationship of the type exists afterwards (scenario 2); `null` and an empty value clear a reference and the record's field is `null` (scenario 3); `updateMany` applies the same data and `deleteMany` removes every id, each as one statement (scenario 4, FR-012); `delete` of a company that people refer to removes its relationships and those people show an empty company (scenario 5); a reference whose target does not exist rejects 400 naming the field and **nothing is written, including the node's other fields and its existing relationship** (scenario 6, the match-first form of research R4); an `id` with no node rejects 404 on `update` and `delete` (scenario 7); data holding only undeclared fields rejects and names them, and extra undeclared fields beside declared ones are ignored (scenario 8); a `create` with a supplied `id` that already exists rejects 400 and creates no second node; an `id` in `update` data is ignored and the record's `id` does not change; setting a declared field to `null` clears it; every write is exactly one statement plus at most one cause read; a failed write leaves the graph as it was; `updateMany` over ids that match no node answers an empty list and rejects 400 for a missing reference target

### Implementation for User Story 2

- [ ] T023 [US2] Extend `packages/react-admin/src/statements.ts` with the write forms of `contracts/statements.md`: create (a `MATCH` per supplied target, then `CREATE`, with and without references), update (node and every target matched first, `SET n += $props`, delete the old relationships, create the new, with the clearing form for `null` and the no-reference form), the `id IN $ids` variants for `updateMany` and `deleteMany`, and detach delete (FR-012 to FR-015)
- [ ] T024 [US2] Extend `packages/react-admin/src/provider.ts` with `create`, `update`, `updateMany`, `delete` and `deleteMany`: split `data` into declared fields, references and undeclared fields (FR-016); drop an `id` from update data; coerce values to the declared types; run the single write; on zero rows run the cause reads of `contracts/statements.md` (node exists, then each target exists) and throw 404 or 400 naming the field; map a constraint violation to the 400 of T014; return the records and ids react-admin expects. Make T022 pass (FR-012 to FR-016)

**Checkpoint**: records and relationships can be created, changed and removed atomically; User Stories 1 and 2 work together.

---

## Phase 5: User Story 3 - Failures reach react-admin in its shape (Priority: P1)

**Goal**: engine errors, missing records, undeclared fields and a failed client become thrown errors with a `status`, and the statement observer works.

**Independent Test**: provoke each failure through the provider and assert the thrown error.

### Tests for User Story 3

- [ ] T025 [P] [US3] Create `packages/react-admin/tests/unit/errors.test.ts` (`// covers-ra: FR-017, FR-018, FR-019, FR-027, FR-033`) with one case per acceptance scenario of User Story 3: a statement the engine rejects throws with the engine's message and `status` 400 (scenario 1); a client with `status` `"failed"` makes every method throw 503 with the client's failure message and the recording shows no statement sent (scenario 2); a client that answers its first query late resolves the call after the delay (scenario 3, the in-process stand-in for a client that is `loading`); `onStatement` receives each statement text and its parameters in the order sent, once per statement, including the constraint statements and cause reads, and nothing is reported when none is given (scenario 4); a throwing `onStatement` is caught and the call still resolves; the provider does not retry a failed statement; the thrown value is an `Error` whose `status` is a number; every `query` receives `timeoutMs` 10,000 by default and the option's value when given (scenario 5); a client whose answer comes after the timeout makes the call reject 503 saying the statement timed out
- [ ] T026 [US3] Complete `packages/react-admin/src/errors.ts` and `provider.ts` as T025 requires: the observer wrapper that catches a throwing callback and runs immediately before each `client.query`, the failed-client check at the start of every method, no retry anywhere, and the `timeoutMs` option (default 10,000) passed to every `client.query` with the mapping of T014. Make T025 pass (FR-017 to FR-019, FR-033)

**Checkpoint**: User Stories 1 to 3 are complete: the package is functionally done and its contract tests (FR-027) pass against the real engine.

---

## Phase 6: User Story 4 - The starter runs and keeps what the visitor writes (Priority: P1)

**Goal**: a participant opens the starter and sees working lists, forms and a company page; edits survive a reload.

**Independent Test**: serve the starter in a browser, create, edit and delete records, reload, and see them.

### Tests for User Story 4

- [ ] T027 [P] [US4] Create `starters/react-admin/tests/unit/seed.test.ts` with a `vitest.config.ts` in the starter (include `tests/unit/**/*.test.ts`, environment `node`) (`// covers-ra: FR-021`): `src/seed.json` is accepted by the core's `validate` (ADR-002), has 6 companies, 50 people and 10 projects, unique string ids, every person has one `WORKS_AT` and every project one `OWNED_BY` and one `LED_BY`, and generating the seed twice gives identical output (research R14). Add a `test:react-admin-starter` script in the starter's `package.json`
- [ ] T028 [P] [US4] Create `starters/react-admin/tests/browser/fixtures.ts` modelled on `packages/web/tests/catalog/browser/fixtures.ts` (WebKit in a persistent context, the origin-private root emptied between tests) and `starters/react-admin/tests/browser/helpers.ts` (open the starter, wait for the lists, create a person through the form, read a list row's text); create `starters/react-admin/public/blank.html` (an empty same-origin page that loads no client) and `starters/react-admin/tests/browser/state.ts`, which opens that page and writes the catalog file and store state a test needs (a catalog entry, an emptied store, a catalog that does not parse), modelled on `packages/web/tests/catalog/browser/catalog-file.ts`, so a failure can be forced before the starter boots (FR-025, T037)
- [ ] T029 [US4] Create `starters/react-admin/tests/browser/lists.spec.ts` (`// covers-ra: FR-020, FR-022, FR-028, FR-034, SC-005`): first run shows the seed's records and a reload does not create them twice (scenario 1); the people list sorts, filters, searches and pages and shows its total, and the statement panel lists what ran (scenario 3); an edit form's relation picker moves a person to another company and the list and company page show it (scenario 4); the company page lists that company's people and projects (scenario 5); a created person survives a reload and the seed is not applied again (scenario 2); a deleted company leaves its people with an empty company; the shell and storage notice are visible and the lists show a loading state while the client is `loading` (hold the engine binary's response with a route handler), and a failed client shows the failure screen, never a blank page (scenario 6); run in Chromium, Firefox and WebKit. Also a case that sends a statement immediately after the client is created and sees it resolve (research R10, FR-032, if T011 found no existing core test)

### Implementation for User Story 4

- [ ] T030 [US4] Create `starters/react-admin/scripts/make-seed.ts` and run it to write `starters/react-admin/src/seed.json`: a deterministic graph data document (ADR-002) of 6 companies, 50 people and 10 projects, names combined from fixed lists and no real persons, string ids, relationships `WORKS_AT`, `OWNED_BY` and `LED_BY` (research R14). Commit the output
- [ ] T031 [P] [US4] Create `starters/react-admin/src/schema.ts`: the starter's `Schema` exactly as the data-model.md "Starter data" table (companies, people with `company`, projects with `company` and `lead`)
- [ ] T032 [US4] Create `starters/react-admin/src/main.tsx`: import the engine binary as a URL with the bundler's asset import, call `createClient` in application mode (`name` `react-admin-starter`, `version` 1, `seed` from `seed.json`, no `indexes`, no migrations, the default `whenLocked`), build the provider with `createDataProvider(client, schema, { onStatement })` feeding the statement panel's store, and mount the app; render the shell before the client is ready (constitution III) (FR-020, FR-021, FR-034)
- [ ] T033 [US4] Create `starters/react-admin/src/App.tsx` and `starters/react-admin/src/resources/` (`companies.tsx`, `people.tsx`, `projects.tsx`): react-admin `<Admin>` with the three resources, list pages with sortable columns, filters, `q` search and paging, edit and create forms using `<ReferenceInput>` pickers for `company` and `lead` (FR-022)
- [ ] T034 [P] [US4] Create `starters/react-admin/src/CompanyPage.tsx` listing a company's people and projects through `getManyReference`, linked from the companies list, and `starters/react-admin/src/StatementPanel.tsx` showing the statements and parameters the provider reported (FR-022)

**Checkpoint**: the starter runs, shows linked records, and keeps what the visitor writes across reloads; User Story 4 is independently demonstrable. The MVP (US1 to US4) is complete.

---

## Phase 7: User Story 5 - The starter is honest about storage and failures (Priority: P2)

**Goal**: the visitor can tell where their data is, can ask for persistent storage, and sees safe choices when stored data cannot be opened.

**Independent Test**: open the starter in two tabs, with storage unavailable, and with each failure forced from catalog fixtures.

### Tests for User Story 5

- [ ] T035 [P] [US5] Create `starters/react-admin/tests/unit/failures.test.ts` (`// covers-ra: FR-025, SC-006`): the table in `src/failures.ts` has an entry for each of `store-newer`, `store-lost`, `store-unmarked`, `store-unreadable`, `import-interrupted` and `migration-failed`, each with its own explanation; each offers a confirmed reset and none offers an export (the core's `exportApplication()` rejects while a client is `failed`); an unknown reason falls back to a generic entry with reset only
- [ ] T036 [P] [US5] Create `starters/react-admin/tests/browser/storage.spec.ts` (`// covers-ra: FR-024, FR-028, SC-005`): the notice says durable when storage is durable; with the origin-private storage unavailable it says memory with the reason; a second tab says it is waiting while the first holds the store and continues when the first closes (scenario 2, and that the data is not corrupted); the persistence button calls `requestPersistence` only when pressed and the notice updates, and the starter never requests it on its own (checked by counting calls); records are as left after a reload in all three browsers
- [ ] T037 [US5] Create `starters/react-admin/tests/browser/failures.spec.ts` (`// covers-ra: FR-025, SC-006`): force each reachable failure with `tests/browser/state.ts` (T028), writing the state the core's own tests use (a catalog entry with a newer version for `store-newer`; an entry with `seeded: true` over an emptied store for `store-lost`; data and no entry for `store-unmarked`; a catalog file that does not parse for `store-unreadable`; an `importing` entry for `import-interrupted`) and assert that the starter shows that reason with its explanation, offers a confirmed reset and no export, and that reset recovers each; run in the three browsers. `migration-failed` is covered by the table test of T035 because the starter has no migration to fail
- [ ] T038 [US5] Create `starters/react-admin/tests/browser/reset.spec.ts` (`// covers-ra: FR-023, FR-028, SC-005`): the reset control offers an export first (the download holds the starter's records with no `allowLoss`), requires a confirmation, then resets and seeds again; cancelling leaves the records; after a reset the lists show the seed's records

### Implementation for User Story 5

- [ ] T039 [P] [US5] Create `starters/react-admin/src/failures.ts` (the six reasons: explanation text and allowed choices, as the data T035 tests) and `starters/react-admin/src/FailureScreen.tsx` showing the entry for `client.diagnostic.reason` with a confirmed `resetApplication` as its only choice and no export (FR-025)
- [ ] T040 [US5] Create `starters/react-admin/src/StorageNotice.tsx` reading `client.storage` and `client.on("storage", …)` to say durable, memory only (with the reason) or waiting on another tab, with a button that calls `client.requestPersistence()` and shows the result; wire the notice and the failure screen into `App.tsx` so a failed client shows `FailureScreen` and not a blank page (FR-024, FR-025)
- [ ] T041 [US5] Create `starters/react-admin/src/ResetControl.tsx`: a "reset demo data" control that offers `client.exportApplication()` (saving the envelope as a file), requires a confirmation, then calls `client.resetApplication()`; the starter's data uses only string, number and boolean properties so no `allowLoss` is passed (FR-023)

**Checkpoint**: the starter says what is true about its data and recovers from every failure the core reports.

---

## Phase 8: User Story 6 - Installable and checked with the rest (Priority: P2)

**Goal**: the package installs cleanly, and every check runs in the repository's routine checks.

**Independent Test**: run the package's install check and `pnpm test:drift`.

### Tests for User Story 6

- [ ] T042 [US6] Create `packages/react-admin/tests/package/clean-install.test.ts` (`// covers-ra: FR-001, FR-029, FR-031, SC-007`), modelled on `packages/sveltekit/tests/package/clean-install.test.ts`: pack the package, the core and the engine, install them with `react-admin` and its peers in a clean directory outside this repository, write a script that builds a provider over a small client and runs a list call and a create, and run it; fail if the packed package references a path outside itself or the vendored engine
- [ ] T043 [P] [US6] Create `packages/react-admin/tests/unit/dependencies.test.ts` (`// covers-ra: FR-001, FR-031`): the package's `src` imports nothing from `react-admin` except types, nothing from `@relate/web` except types and its public entry, no `react`, no engine package and no path containing `vendor`; `package.json` declares `react-admin` `^5` and `@relate/web` as peers; the package exports no interface component
- [ ] T044 [US6] Create `packages/react-admin/tests/unit/trace.test.ts` (`// covers-ra: FR-030, SC-008`): run the trace check with `TRACE_SPEC` pointing at a temporary specification that has an id no test tags and assert it fails and names that id (as the other packages' trace tests do); after the full test run, `pnpm test:react-admin-trace` must pass for this specification

### Implementation for User Story 6

- [ ] T045 [US6] Add the root scripts to `package.json`: `test:react-admin`, `test:react-admin-browsers`, `test:react-admin-package` and `test:react-admin-trace` (`pnpm --filter @relate/react-admin …` for the first, third and fourth, `pnpm --filter react-admin-starter test:react-admin-browsers` for the second, and `pnpm --filter react-admin-starter test:react-admin-starter` joined into `test:react-admin`); append them to `test:units`, `test:browsers-all`, `test:packages-all` and `test:traces-all`, so `test:drift` and `test:all` (and the drift and full workflows, which run those) include them; confirm `pnpm -r build` builds the starter (FR-030)
- [ ] T046 [US6] Run `pnpm test:drift` and fix what it shows; confirm the starter's build is part of it through `pnpm -r build` (FR-030, SC-008)

**Checkpoint**: the package installs in a clean project and every check runs with the rest.

---

## Phase 9: Polish and Cross-Cutting Concerns

**Purpose**: Documents, measurements, the final amendment, and the full verification

- [ ] T047 [P] Write `packages/react-admin/README.md`: the exports and schema (from `contracts/provider-api.md`), the filter conventions, what the constraint does and that a separate index on `id` conflicts with it, errors and statuses, `onStatement`, `timeoutMs`, and what is not supported (many-to-many, relationship properties, other field types); link ADR-008
- [ ] T048 [P] Write `starters/react-admin/README.md`: run it, what is in it, how to copy it and rename the store (`react-admin-starter`), what a visitor loses by clearing site data, the second-tab behaviour, that the export is offered by the reset control and not on a failure screen (the core cannot export from a failed client), and that `react-admin` is pinned and its paid add-on modules are not used (FR-026)
- [ ] T049 [P] Create `starters/react-admin/tests/unit/starter-terms.test.ts` (`// covers-ra: FR-026`): the starter's `package.json` pins `react-admin` to an exact version (no range operator), declares no `@react-admin/ra-*` add-on module and no other paid react-admin package, and its README says what a visitor loses by clearing site data and that a copied project renames the store (it passes once the README of T048 exists)
- [ ] T050 [P] Update `CLAUDE.md`: a line in "Project state" for the package and the starter (implemented from `specs/008-react-admin-provider/`, ADR-008), the new commands in the Commands block, and the layout lines for `packages/react-admin` and `starters/react-admin`
- [ ] T051 Measure and record, as single runs on one machine (constitution V): SC-004 (a clean checkout to the starter's lists on screen: install, build and first render, timed once) and SC-009 (statements per list call, from the recording; the timing of a list and of a lookup by `id` over the starter's data); write them to `packages/react-admin/reports/figures.json` and into the README with the method and a "single run" label; add `packages/react-admin/tests/unit/figures.test.ts` (`// covers-ra: SC-004, SC-009`) asserting that the file holds both figures, each with its method, environment and a "single run" label
- [ ] T052 Complete the ADR-008 amendments with the measured figures (T051) and anything the implementation found; set `specs/008-react-admin-provider/spec.md` status to "Implemented"; tick every task above
- [ ] T053 Run the full verification: `pnpm test:all`, with the known pre-existing CI timing-baseline failures noted separately and not attributed to this work; check that the starter works in the Browser pane once by hand (`pnpm --filter react-admin-starter dev`) and report what was and was not checked

---

## Dependencies and Order

- **Phase 1** (T001 to T006) first. T003 to T005 are parallel after T001 and T002.
- **Phase 2** blocks everything: T007, T008, T010 are parallel; T009 needs T007 and T008; T011 is independent; T012 needs T009 and T011; T013 needs T010; T014 can run beside T013.
- **US1** (T015 to T021): tests T015 and T016 first (parallel), then T017 to T020 (T018 and T019 need T017's output shape; T020 is independent), then T021.
- **US2** (T022 to T024) follows US1 because it extends `statements.ts` and `provider.ts`. **US3** (T025, T026) follows US2 for the same reason.
- **US4** (T027 to T034): T027, T028 and T030 can start once Phase 1 is done; the seed (T030) is needed by T027 and T032; T032 to T034 need a working provider (T021 at least for lists, T024 for the forms). T029 needs the whole starter.
- **US5** (T035 to T041) follows US4: T039 to T041 add screens to the starter; T035 is independent of the starter.
- **US6** (T042 to T046) needs the package complete (US3) and, for T045 and T046, the starter's scripts (T003, T027).
- **Polish** (T047 to T053) last; T047 to T050 are parallel; T051 needs the package and starter complete; T053 is last.

## Parallel Example: User Story 1

```text
T015 reads.test.ts and T016 ensure-schema.test.ts (different files, both against the Phase 2 helpers)
then T017 filter.ts and T020 ensureSchema (different files), then T018 statements.ts and T019 record.ts
```

## Implementation Strategy

- **MVP**: Phases 1 to 6 (US1 to US4). The package passes its contract tests against the real engine and the starter runs and keeps records, in Chromium, Firefox and WebKit.
- **Then**: US5 (honesty about storage and failures) and US6 (install and wiring), then Polish.
- **Incremental checks**: after each phase run `pnpm test:react-admin`; after Phase 6 run `pnpm test:react-admin-browsers`; after Phase 8 run `pnpm test:drift`.
- **Commits**: one per phase, citing ADR-008, as the earlier specifications did.
