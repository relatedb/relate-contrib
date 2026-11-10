# Feature Specification: A react-admin Data Provider and Local-First Starter

**Feature Branch**: `spec/008-react-admin-provider` (spec directory `008-react-admin-provider`)

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "React-admin data provider and local-first starter: implement accepted ADR-008 (parent RFC-005 and RFC-006; builds on ADR-001, ADR-002, ADR-003, ADR-009 and ADR-010) in two deliverables: a package `@relate/react-admin` exporting `createDataProvider(client, schema)` and `ensureSchema(client, schema)`, and an unpublished starter application `starters/react-admin` whose records persist in an application graph. Early tasks confirm the engine behaviours the ADR assumes and amend ADR-008 with the results."

## Overview

react-admin is a React framework for administrative applications: lists with sorting, filters and paging, edit forms, and pickers for related records. It reaches all of its data through one object, the *data provider*, whose methods take a resource name and parameters and return promises. A team that describes three or four entities to a provider over the embedded graph gets those screens with no server. That is the first starter proposed by RFC-005, a small runnable application a participant can run, change and show within hours, whose purpose is to inspire community projects and lower the cost of adopting the database.

This feature builds two things from ADR-008:

- **The package** `@relate/react-admin` (`packages/react-admin`): a data provider that works over any client of the core (`@relate/web`), and a helper that creates the uniqueness constraint on each resource's `id`. It holds no interface components and no hosting code.
- **The starter** `starters/react-admin`: an unpublished Vite and React application with three linked resources (companies, people and projects) whose records persist in the visitor's browser, built on the application graphs of ADR-009 and the catalog of ADR-010.

Three kinds of people depend on it:

- **Hackathon participants and application authors** want to declare their entities and get working lists, filters, edit forms and relation pickers, and a starter they can copy and rename.
- **Visitors of an application built from the starter** want their records to survive reloads and return visits, and to be told plainly when storage is in memory only, when another tab holds the data, or when stored data cannot be opened.
- **Maintainers of this repository** want the provider's translation from interface state to queries to be safe by construction (declared names, bound values), tested against the real engine, and checked with every other package so the starter does not decay.

Terms: a *resource* is one kind of record the interface shows (a node label); a *schema* is the caller's declaration of its resources, fields and references; a *reference* is a field holding the `id` of one record of another resource, stored as a relationship. The record `id` is the node's `id` property (ADR-002), never the engine's internal element id.

The specification implements ADR-008 and does not restate its decisions where an ADR section carries them; the requirements below name the section. It builds on ADR-009 (application mode of the core's client) and ADR-010 (the catalog), both implemented, and on ADR-001, ADR-002 and ADR-003.

## Clarifications

### Session 2026-11-10

- Q: Does this feature change the core (`packages/web`)? → A: No, unless an early confirmation task (User Story 7) shows something missing; such a change is raised as an ADR amendment first (constitution I, VI). The package depends on the core through its public entry points only.
- Q: Who creates the uniqueness constraint on `id`? → A: The package, idempotently and before its first statement (`CREATE CONSTRAINT … IF NOT EXISTS` per resource), exported as `ensureSchema(client, schema)` and called by the provider itself. The engine enforces per-label uniqueness and the constraint owns the lookup index, so no separate index is created; a separate index on the same property makes the constraint fail to create, so the starter passes no `id` index to the core. No core change; a `constraints` option in the core's application mode was considered and set aside (research R3). This supersedes ADR-008 2.2's `schemaIndexes`, which an ADR-008 amendment records.
- Q: Which data types may a schema field have? → A: string, number and boolean, the types the core's export carries without loss. Any other type is added later together with its loss behaviour (ADR-008 2.6).
- Q: Can the starter offer an export from a failure screen? → A: No. `exportApplication()` waits for a ready client and rejects with `failed` when the client has failed, which every failure reason produces, and ADR-009's "export attempt" for `store-unreadable` is not available through that call. The failure screens offer reset only, and the reset control (data open) keeps its export. Export from a failed client is a follow-up for the core, to be raised as an ADR-009 amendment if wanted; this specification does not change the core. ADR-008 2.6 is amended to match.
- Q: Is the starter published? → A: No. It is the place later starters' shared needs get noticed; extraction into a shared library happens when a second starter needs the same code (RFC-005 5.3).
- Q: What does the starter use for the visitor's records? → A: One application graph, store `react-admin-starter`, schema version 1, no migrations yet. A project that copies the starter renames the store (ADR-008 4).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lists, filters, sorting and paging over the graph (Priority: P1)

A developer declares a schema (companies, people, projects, with fields and references) and gives the provider a core client. react-admin's list screens then show records with sorting, filters, free-text search and paging, and a total that matches the filter. Every field name that reaches a query was declared by the developer, and every value is a bound parameter, so a visitor typing into a filter box cannot change the query's shape.

**Why this priority**: reading is what every screen needs first, and the safe translation of sort and filter state is the part of the provider with real design in it (RFC-005 2).

**Independent Test**: build a provider over a client holding the starter's seed, call `getList` for each resource with sort, filter and page parameters, and compare the records and total with expected values.

**Acceptance Scenarios**:

1. **Given** a seeded graph, **When** `getList` is called with no sort, **Then** records come back ordered by `id`, and `total` is the number of nodes with that label.
2. **Given** a sort on a declared sortable field with ties, **When** `getList` pages through all records, **Then** every record appears exactly once across pages (the `id` tiebreak).
3. **Given** a filter `{ field_gte: 30 }` on a declared filterable number field, **When** `getList` is called, **Then** only matching records come back and `total` counts only them.
4. **Given** a filter `{ q: "ada" }`, **When** `getList` is called, **Then** records whose searchable fields contain "ada" in any letter case come back.
5. **Given** a sort or filter field that is not declared, **When** `getList` is called, **Then** it rejects with `status` 400 and no statement is sent.
6. **Given** a sort value or filter value containing statement text such as `x" RETURN 1 //`, **When** `getList` is called, **Then** the text is matched or compared as a plain value, never executed.
7. **Given** a reference field used as a filter key, **When** `getList` is called with a target `id`, **Then** only records referencing that target come back.
8. **Given** `getManyReference` for a company's people, **When** it is called, **Then** it returns the same records as `getList` with the reference filter fixed to that company.
9. **Given** a record, **When** `getOne` or `getMany` returns it, **Then** it holds the node's declared properties plus each reference field filled with the target's `id`, and no engine element id.

---

### User Story 2 - Creating, changing and deleting records and relationships (Priority: P1)

A visitor creates a person with a company, moves a person to another company, clears a project's lead, and deletes a company. Each action is one atomic statement, so a failure leaves nothing half done, and reloading shows the change.

**Why this priority**: an admin tool that only reads is a viewer; relationships are what the graph adds over a table.

**Independent Test**: call each write method against a seeded graph, then read back with `getOne` and `getList`.

**Acceptance Scenarios**:

1. **Given** no `id` in the data, **When** `create` is called, **Then** the node gets a generated unique string `id`, the declared fields, and a relationship to each supplied reference target.
2. **Given** a person who works at company A, **When** `update` supplies company B, **Then** exactly one relationship of that type exists afterwards, to B.
3. **Given** a person with a company, **When** `update` supplies `null` or an empty value for it, **Then** the relationship is removed and the record's reference field is empty.
4. **Given** several ids, **When** `updateMany` or `deleteMany` is called, **Then** the same data is applied to, or the nodes removed for, every id.
5. **Given** a company that people refer to, **When** `delete` is called, **Then** the company and its relationships are removed and those people show an empty company.
6. **Given** a reference whose target `id` does not exist, **When** `create` or `update` is called, **Then** it rejects with `status` 400 naming the field and nothing is written.
7. **Given** an `id` that matches no node, **When** `update` or `delete` is called, **Then** it rejects with `status` 404.
8. **Given** data holding a field that is not in the schema, **When** it is the only data, **Then** the write rejects and the error text names the field; **when** other declared fields are present, **then** the extra field is ignored.

---

### User Story 3 - Failures reach react-admin in the shape it reads (Priority: P1)

When the engine reports an error, a record is missing, a field is undeclared, or the core client has failed, the provider throws an error with a `status` and a message, so react-admin's notifications and error pages work without extra code.

**Why this priority**: every screen shows these errors; a thrown plain string or a swallowed envelope error is a silent bug.

**Independent Test**: provoke each failure through the provider and assert the thrown error's `status` and message.

**Acceptance Scenarios**:

1. **Given** a statement the engine rejects, **When** a provider method runs it, **Then** it throws with the engine's message and `status` 400.
2. **Given** a client whose status is `failed`, **When** any provider method is called, **Then** it throws with `status` 503 and the client's failure message, and sends no statement.
3. **Given** a client still `loading`, **When** a method is called, **Then** it resolves after the client is ready.
4. **Given** an `onStatement` callback, **When** methods run, **Then** it receives each statement text and its parameters in order; **given** none, **then** nothing is reported.
5. **Given** a statement that does not answer within the timeout, **When** it is sent, **Then** the call rejects with `status` 503 saying the statement timed out; **given** the option `timeoutMs`, **then** that value is passed to the client's `query`.

---

### User Story 4 - The starter runs and keeps what the visitor writes (Priority: P1)

A participant clones the repository, runs one command and sees a working administrative application: sortable, filterable, paged lists of companies, people and projects, edit forms with pickers for related records, and a company page listing that company's people and projects. About 50 people and a few companies and projects are there on first run. Edits survive a reload and a return visit.

**Why this priority**: the starter is the deliverable people see; everything else supports it.

**Independent Test**: serve the starter in a browser, create, edit and delete records, reload, and see them.

**Acceptance Scenarios**:

1. **Given** an empty browser, **When** the starter opens, **Then** the lists show the seed records and no record is created twice by a reload.
2. **Given** a created person, **When** the page reloads, **Then** the person is in the list and the seed is not applied again.
3. **Given** the people list, **When** a visitor sorts, filters, searches and pages, **Then** the list and total follow, and a panel shows the statements the provider ran.
4. **Given** an edit form for a person, **When** the visitor picks another company in the relation picker and saves, **Then** the list and the company page show the person under the new company.
5. **Given** a company page, **When** it opens, **Then** it lists that company's people and projects.
6. **Given** a client that is still `loading`, **When** the starter opens, **Then** the shell and the storage notice are on screen and the list regions show a loading state, not a blank page.
7. **Given** a participant who copies the starter, **When** they follow its README, **Then** they can rename the store and change the schema without touching the package.

---

### User Story 5 - The starter is honest about storage and failures (Priority: P2)

A visitor can tell whether their records are stored durably, are held in memory only, or are waiting on another tab, and can ask the browser for persistent storage. When the stored data cannot be opened, the starter says which of the core's failure reasons occurred and offers a reset, an explicit and confirmed action that discards the stored data. It cannot offer an export at that point: the core's `exportApplication()` rejects once a client has failed, so the export is offered by the reset control while the data is open (scenario 5).

**Why this priority**: RFC-005 and RFC-006 ask that starters say what a visitor loses; a starter that empties silently is a demo, not an application.

**Independent Test**: open the starter in two tabs, open it with storage unavailable, and force each failure reason from the core's fixtures.

**Acceptance Scenarios**:

1. **Given** durable storage, **When** the starter is open, **Then** a notice says the data is stored durably; **given** memory storage, **then** it says the data is in memory only, with the reason.
2. **Given** a second tab, **When** another tab holds the store, **Then** the second tab says it is waiting and continues when the first closes.
3. **Given** the notice, **When** the visitor presses the persistence button, **Then** persistence is requested from that user action and the notice updates with the answer; the starter never requests it unprompted.
4. **Given** each of `store-newer`, `store-lost`, `store-unmarked`, `store-unreadable`, `import-interrupted` and `migration-failed`, **When** the client fails with it, **Then** the starter shows that reason with a plain explanation and the choice to reset, requiring confirmation, and offers no export (the core cannot export from a failed client).
5. **Given** the reset-demo-data control, **When** it is used, **Then** it offers an export (no `allowLoss` needed for the starter's data), requires confirmation, then resets and seeds again.
6. **Given** the starter's README, **When** a participant reads it, **Then** it says what a visitor loses by clearing site data and that a copied project renames the store.

---

### User Story 6 - The package installs cleanly and is checked with the rest (Priority: P2)

The package can be packed, installed in a clean project beside `react-admin` and `@relate/web`, and used. Its contract tests run against the real engine, the starter's browser tests run in Chromium, Firefox and WebKit, and both run in the repository's routine checks so they do not decay between launches.

**Why this priority**: RFC-005 asks for an automated check that each starter builds and answers a query; constitution V requires tests for every MUST.

**Independent Test**: run the package's install check and the repository's drift check.

**Acceptance Scenarios**:

1. **Given** the packed package, **When** it is installed in an empty project with its peer dependencies, **Then** a script builds a provider, and a list call returns records.
2. **Given** the repository's drift and full checks, **When** they run, **Then** they include the package's unit and contract tests, the starter's browser tests, the package test and the trace check.
3. **Given** every requirement of this specification, **When** the trace check runs, **Then** each has a passing test carrying its tag.

---

### User Story 7 - The ADR's assumptions about the engine are confirmed or amended (Priority: P2)

Before the provider's statements are fixed, early tasks confirm the engine behaviours ADR-008 assumes, and ADR-008 is amended with what was found, including a fallback where an assumption fails.

**Why this priority**: the statements depend on them; finding out in the middle of the provider costs more.

**Independent Test**: read the amended ADR and the recorded results.

**Acceptance Scenarios**:

1. **Given** the engine, **When** one statement removes a relationship and creates another, **Then** the result is recorded.
2. **Given** `SKIP` and `LIMIT`, **When** given parameters, **Then** acceptance or rejection is recorded, with the interpolation fallback used if rejected.
3. **Given** case-insensitive contains and comparisons, **When** run over strings, numbers and mixed types, **Then** the behaviour is recorded.
4. **Given** `RETURN n`, **When** the envelope is read, **Then** the node value's shape is recorded.
5. **Given** a statement issued while the client is `loading`, **When** the client becomes ready, **Then** the statement resolves, and the result is recorded.

---

### Edge Cases

- A filter value that cannot be converted to the field's declared type (a letter for a number field) rejects with 400.
- A declared field whose name ends in `_gt`, `_lt`, `_gte`, `_lte` or `_neq` is never split into a suffix.
- A filter key that is neither declared nor a suffix of a declared filterable field rejects with 400.
- An array filter value on a reference or plain field is membership; an empty array matches nothing.
- `getMany` with ids that include missing records returns only the records found.
- A page past the end returns no records and the unchanged total.
- Two applications on one origin choosing the same store name share a store (RFC-007 7.3); the starter's fixed name is why a copy renames it.
- A seed with duplicate `id` values is rejected by the core's validation before the starter shows anything.
- The graph is empty because the visitor deleted every record: the application is `seeded: true`, so the next open fails `store-lost`; the starter explains it and offers reset (ADR-010).
- `updateMany` with ids that match no node answers an empty list of ids; with a reference whose target does not exist it rejects 400, as `update` does.
- A `create` with a supplied `id` that already exists: the provider rejects it with 400 rather than creating a second node with the same `id`.

## Requirements *(mandatory)*

### Functional Requirements

**The package**

- **FR-001**: The package `@relate/react-admin` MUST export `createDataProvider(client, schema)`, taking any client of the core, with peer dependencies on `react-admin` ^5 and `@relate/web`, no interface components, and no hosting code (ADR-008 2.1).
- **FR-002**: The package MUST export `ensureSchema(client, schema)`, which creates one uniqueness constraint on `id` per resource label with `CREATE CONSTRAINT … IF NOT EXISTS`, and the provider MUST complete it once before its first statement. It MUST NOT create a separate index on `id`. If creating a constraint fails (for example because the store already holds duplicate ids), the call MUST reject with `status` 400 naming the resource and MUST be tried again on the next call.
- **FR-003**: A schema MUST declare, per resource, its node label, its fields (each string, number or boolean, with flags for sortable, filterable and searchable) and its references (field name, target resource, relationship type, direction); a reference MUST be many-to-one (ADR-008 2.2). A schema that is malformed MUST be rejected when the provider is created, naming the problem.
- **FR-004**: `id` MUST be implicitly declared on every resource as a string field that is sortable and filterable; the record `id` MUST be the node's `id` property; `create` MUST generate one with `crypto.randomUUID()` when the data has none; engine element ids MUST NOT appear in records (ADR-008 2.2).

**Reading**

- **FR-005**: `getList` MUST send one data statement and one count statement (the one-time constraint statements of FR-002 are not counted); `total` MUST be the count statement's value (ADR-008 2.3).
- **FR-006**: A sort or filter field name MUST be accepted only if the schema declares it as sortable or filterable respectively, and only then interpolated, quoted; every value MUST be a bound parameter; an undeclared name MUST reject with `status` 400 before any statement is sent.
- **FR-007**: A plain filter key MUST be equality and an array value membership; the suffixes `_gte`, `_lte`, `_neq`, `_lt` and `_gt` MUST be comparisons on a declared filterable field; a key that is itself a declared field MUST NOT be split; otherwise a suffix MUST be removed only if the rest is a declared filterable field.
- **FR-008**: Filter values MUST be coerced to the declared field type; a value that does not convert MUST reject with 400.
- **FR-009**: `q` MUST be a case-insensitive contains over the resource's searchable fields joined by OR; a reference field as a filter key MUST test the relationship's target `id`.
- **FR-010**: The requested sort MUST be followed by `id` as a final key; paging MUST use `SKIP` and `LIMIT` from the request's page as bound parameters (the engine accepts them there, research R2).
- **FR-011**: `getOne` and `getMany` MUST match on `id` (one value or a list); `getManyReference` MUST be `getList` with the reference filter fixed to the given target `id`; a record MUST be the node's declared properties plus each declared reference field filled from the relationship's target `id`.

**Writing**

- **FR-012**: Each write MUST be a single statement, atomic without a transaction (ADR-008 2.4).
- **FR-013**: `create` MUST create the node with its declared fields and the relationship to each supplied reference target found by `id`; a supplied `id` that already exists MUST reject with 400 (the constraint of FR-002 enforces it atomically). An `id` in `update` data MUST be ignored: a record's `id` does not change.
- **FR-014**: `update` MUST set the supplied declared fields on the node found by `id`; for a supplied reference it MUST remove the existing relationship of that type and create the new one in the same statement; `null` or an empty value MUST remove it; `updateMany` MUST apply the same data to every id and answer the ids it changed, which is none when no id matches a node.
- **FR-015**: `delete` and `deleteMany` MUST detach-delete the nodes, so records that referenced them show an empty reference afterwards.
- **FR-016**: Fields not in the schema MUST be ignored on write, and MUST be named in the error text if they were the only data; a write matching no node MUST answer 404; a reference whose target does not exist MUST reject with 400 naming the field; relationship properties and many-to-many references MUST NOT be supported.

**Errors and failure**

- **FR-017**: An engine error in the result envelope, a missing record and an undeclared field MUST become a thrown error with a `status` (400 or 404) and the engine's message (ADR-008 2.5).
- **FR-018**: When the core client's status is `failed`, the provider MUST throw with `status` 503 and the client's failure message and MUST NOT send a statement; it MUST NOT retry.
- **FR-019**: An optional `onStatement` callback MUST receive each statement and its parameters, in the order sent.
- **FR-033**: The provider MUST pass a timeout to every statement it sends, `timeoutMs` from its options with a default of 10,000 ms, and a statement that exceeds it MUST reject with `status` 503 and the message that the statement timed out; the core's `query()` applies no timeout of its own, so the provider supplies one (constitution IV).

**The starter**

- **FR-020**: `starters/react-admin` MUST be an unpublished Vite and React application using the package, with three resources: companies, people (each works at one company) and projects (each owned by one company and led by one person) (ADR-008 2.6).
- **FR-021**: The starter's graph MUST be an application graph in a store named `react-admin-starter` at schema version 1 with no migrations, seeded once from a graph data document of about 50 people and a few companies and projects, and MUST NOT pass an index on `id` (the constraint of FR-002 owns it).
- **FR-022**: The interface MUST offer sortable, filterable, paged lists, edit forms with relation pickers, a company page listing its people and projects through `getManyReference`, and a panel showing the statements the provider ran.
- **FR-023**: The starter's data MUST use only string, number and boolean properties; it MUST offer a reset-demo-data control that offers `exportApplication` and, after confirmation, calls `resetApplication`.
- **FR-024**: The starter MUST read `client.storage` and say whether data is stored durably, in memory only (with the reason), or waiting on another tab; it MUST offer `requestPersistence` only from a button, and MUST NOT request it on its own.
- **FR-034**: The starter's shell (navigation, titles and the storage notice) MUST render before the client is ready, and while the client is `loading` the list regions MUST show react-admin's loading state, and when it has failed the failure screen, never a blank page (constitution III).
- **FR-025**: The starter MUST show each failure reason the client reports (`store-newer`, `store-lost`, `store-unmarked`, `store-unreadable`, `import-interrupted`, `migration-failed`) with the choice to reset, and MUST NOT offer an export from a failure screen (the core's `exportApplication()` rejects while a client is `failed`).
- **FR-026**: The starter MUST pin `react-admin` to an exact version and MUST NOT use react-admin's paid add-on modules; its README MUST say what a visitor loses by clearing site data and that a project copying the starter renames the store.

**Checks**

- **FR-027**: A contract test MUST run every provider method against the real engine through the core and assert the shapes react-admin expects, including rejection of undeclared fields and injection attempts in sort and filter values (ADR-008 2.7).
- **FR-028**: A browser test MUST run the starter in Chromium, Firefox and WebKit through create, filter, sort, paging, changing a reference, delete, reload (records remain), a second tab and reset.
- **FR-029**: A package test MUST pack the package, install it with its peer dependencies in a clean project, build a provider and run a list call.
- **FR-030**: Test names MUST carry the identifiers of the requirements they cover (`covers-ra:` tags) and a trace check MUST fail when a requirement or success criterion has no passing test; the unit, browser, package and trace checks MUST run in the repository's `test:drift` and full workflow.
- **FR-031**: The package MUST depend on the core only through its exported entry points and MUST NOT reference the vendored engine path.
- **FR-032**: Early tasks MUST confirm against the real engine, and amend ADR-008 with the results, that one statement can remove and create a relationship in one pass; that `SKIP` and `LIMIT` accept parameters; the behaviour of case-insensitive contains and comparisons on strings, numbers and mixed types; that `RETURN n` yields properties in the envelope's node value; and that a statement issued while the client is `loading` resolves once it is ready. Where an assumption fails, the fallback MUST be recorded before the statements that depend on it are built.

### Key Entities

- **Schema**: the caller's declaration of resources. A **resource** has a label, **fields** (name, type, sortable, filterable, searchable) and **references** (field name, target resource, relationship type, direction).
- **Record**: what react-admin sees: the node's declared properties, its `id`, and each reference field holding a target `id`.
- **Provider**: the object react-admin calls; built from a schema and a core client, with an optional statement observer.
- **Starter graph**: the application graph holding companies, people and projects, one store per origin, seeded once.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every provider method returns the shape react-admin expects for each of the starter's three resources, shown by the contract test against the real engine.
- **SC-002**: In sort and filter tests with hostile values (statement text, quotes, comment markers), no hostile value changes a statement's shape, and every undeclared name is rejected before a statement is sent.
- **SC-003**: Paging through a sorted list with ties returns every record exactly once.
- **SC-004**: A participant goes from a clean checkout to the starter's lists on screen with install and one run command, with no server; the time is measured once and recorded, labelled single-run.
- **SC-005**: In Chromium, Firefox and WebKit, records created, edited and deleted in the starter are still as left after a reload, and a second tab waits instead of corrupting the data.
- **SC-006**: Each of the six failure reasons is shown by the starter with its own explanation and only the safe choices.
- **SC-007**: The packed package installs in a clean project with its peer dependencies and answers a list call.
- **SC-008**: Every requirement and success criterion of this specification has a passing, tagged test, and the repository's drift and full checks include them.
- **SC-009**: Once the constraints exist, a list costs at most two statements, and every resource's `id` carries a uniqueness constraint, which owns the lookup index (asserted from the engine's constraint and index lists); the statement counts are asserted and the timings recorded, labelled single-run.

## Assumptions

- The core's client, application mode and catalog behave as implemented and documented in `packages/web/README.md`; this feature changes the core only through an ADR amendment an early task shows to be needed.
- react-admin 5 and its filter and sort parameters are used as ADR-008 describes; the exact pinned version is chosen at implementation and recorded.
- The engine accepts the openCypher forms the ADR names; User Story 7 confirms each before the statements are fixed.
- Records are per browser: no sharing between visitors or devices, and clearing site data erases them (RFC-005, RFC-006).
- One interpretation of react-admin's filter conventions is fixed by the package; other conventions need a schema or provider option, not a second package.
- A Refine provider, many-to-many references, a schema-from-graph helper, a shared translation library, paid react-admin modules, server-backed data, other starters and engine changes are out of scope (ADR-008 3 and 4).
- Timing figures are single runs on one machine and are labelled so (constitution V).
