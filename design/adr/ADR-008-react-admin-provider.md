---
id: ADR-008
title: A react-admin Data Provider over the Core, with a Local-First Demo
status: accepted
rfcs: [RFC-005, RFC-006]
created: 2026-11-08
---

# ADR-008: A react-admin Data Provider over the Core, with a Local-First Demo

## 1. Context

react-admin is a React framework for administrative applications: lists with sorting, filters and paging, edit forms, and pickers for related records. It reaches all of its data through one object, the data provider, whose methods take a resource name and parameters and return promises. The methods are `getList`, `getOne`, `getMany`, `getManyReference`, `create`, `update`, `updateMany`, `delete` and `deleteMany`. Every record must carry an `id`. A list request carries a page and page size, a sort field and direction, and a flat filter object whose keys follow conventions the provider chooses (`field_gte`, a free-text `q`, and so on); the answer is the records and a total. A relationship to another record is a field holding that record's id, which the interface components resolve through further provider calls. react-admin 5.15.6 is MIT-licensed, about 227,000 downloads a week, and its core package was published on 2026-11-07 (npm registry, checked 2026-11-08).

The database side has these properties. The core package's client runs the engine in a worker; `query(statement, params)` returns a promise, waits until the instance is ready, and resolves with the engine's result envelope, in which an engine error arrives in an `error` field and does not throw. A node comes back as a tagged value with the engine's element id, its labels and its properties. Element ids are internal to the engine, while the graph data format already gives every node an application `id` property (ADR-002). One statement is one atomic unit; the client offers no multi-statement transaction.

A data provider is a small contract with a broad payoff: a team that describes three or four entities gets lists, filters, edit forms and relation pickers over a graph, with no server. That is the first demo proposed by RFC-005, which asks for runnable, local-first demos that lower the cost of starting a project. The data has to persist. A demo that empties on reload is a demo, not an application, and RFC-006 sets out what an application graph needs from the core: a durable store that a new seed revision does not wipe, a seed applied once, and a versioned schema. ADR-009 decides that support: an application mode of the core's client with a named durable store, a seed applied once, and versioned migrations. This ADR builds on it. Two parts of the work have real design in them: turning the interface's sort and filter into queries without allowing injection, and mapping react-admin's foreign-key fields onto relationships.

## 2. Decision

### 2.1 Two deliverables

A package, `@relate/contrib-react-admin` in `packages/react-admin`, exports `createDataProvider(client, schema)`. It takes any core client, from `createClient`, `createSiteClient` or an adapter's helper, and has peer dependencies on `react-admin` ^5 and `@relate/contrib-web`. It contains no interface components and no hosting code.

A demo application, `demos/react-admin`, is a Vite and React app that uses the package. It is unpublished, and it is where later demos' shared needs get noticed (RFC-005 5.3).

### 2.2 The schema

The caller declares every resource. A resource entry names its node label and lists its fields, each with a type (string, number or boolean) and flags for sortable, filterable and searchable. It also lists its references: a reference field name, the target resource, the relationship type, and the direction. A reference is many-to-one in this version: a record has at most one outgoing relationship of that type, and the reference field holds the target's `id`. A one-to-many view is the same relationship read from the other side, which is `getManyReference`.

The record's `id` is the node's `id` property. `create` generates one (`crypto.randomUUID()`) when the data has none. Element ids never appear in records.

`id` is implicitly declared on every resource as a string field that is sortable and filterable; it is not listed. react-admin's default list sort is `id` ascending and `getMany` filters on it, so a resource would otherwise fail its first request.

Every lookup by `id` needs an index, or each `getOne`, `getMany`, `update` and `delete` scans its label. The package does not create indexes, since the store belongs to the application. It exports `schemaIndexes(schema)`, which returns a `{ label, property: "id" }` entry per resource in the form the core's application `indexes` option takes, and the caller passes it there. Indexes on other fields stay the caller's choice.

### 2.3 Reads

`getList` builds one data statement and one count statement from the request. Sort and filter field names are accepted only if the schema declares them, and are interpolated, quoted, only after that check; every value is a bound parameter. An undeclared field rejects the request with a 400 error. Conventions:

- A plain key is equality; an array value is membership.
- Suffixes `_gte`, `_lte`, `_neq`, `_lt` and `_gt` are comparisons on a declared filterable field. A key that is itself a declared field is never split; otherwise the suffix is removed only if the rest is a declared filterable field.
- Values are coerced to the declared field type (filter values often arrive as strings, for example from a URL); a value that does not convert rejects with 400.
- `q` is a case-insensitive contains over the resource's searchable fields, joined by OR.
- A reference field as a filter key tests the relationship's target id.
- The requested sort is followed by `id` as a final key, so paging stays stable when the sort field has ties.
- Paging is `SKIP` and `LIMIT` from the request's page; `total` is the count statement's value. If the engine does not accept parameters there, the provider validates a non-negative integer and interpolates it.

`getOne` and `getMany` match on `id` (a single value or a list). `getManyReference` is `getList` with the reference field's filter fixed to the given target id. A record is the node's properties, plus each declared reference field filled from the relationship's target id.

### 2.4 Writes

Each write is a single statement, so it is atomic without a transaction.

- `create` creates the node with its declared fields and, for each reference supplied, the relationship to the target found by `id`.
- `update` sets the supplied declared fields on the node found by `id`. For a supplied reference it removes the existing relationship of that type and creates the new one, in the same statement. `updateMany` applies the same data to every id.
- `delete` and `deleteMany` detach-delete the nodes.

Fields not in the schema are ignored on write and reported to the caller in the error text if they were the only data. A write that matches no node answers 404. A reference whose target does not exist rejects the write with 400, naming the field. `update` with `null` or an empty value for a reference removes the relationship. `delete` detaches the node, so records that referenced it show an empty reference afterwards. Relationship properties and many-to-many relationships are not supported in this version.

### 2.5 Errors and failure

An engine error in the envelope, a missing record, and an undeclared field become a thrown error with a `status` (400, 404) and the engine's message, the shape react-admin's notifications read. When the core client's status is `failed`, the provider throws with status 503 and the client's failure message. The provider does not retry; the core already replaces a crashed worker. `onStatement`, an optional callback, receives each statement and its parameters, so a demo can show what ran.

### 2.6 The demo

The demo has three resources: companies, people (each works at one company) and projects (each owned by one company, led by one person). Data of about 50 people and a few companies and projects is loaded on first run from a graph data document given as the seed of the client's application mode (ADR-009), as the other demos will, and never reapplied over stored data. The demo's graph is an application graph (RFC-006, ADR-009), in a store named `react-admin-demo` at schema version 1 with no migrations yet: the visitor's records survive reloads and return visits, in the one graph that all of the demo's pages share. It passes `schemaIndexes(schema)` as the application's `indexes`. Its data uses only string, number and boolean properties, so export needs no `allowLoss`; a field type beyond those is added together with its loss behaviour. It pins `react-admin` to an exact version. The interface has sortable, filterable, paged lists, edit forms with relation pickers, a company page listing its people and projects through `getManyReference`, and a panel showing the statements the provider ran. A "reset demo data" control offers an export (`exportApplication`, whose seed data the format carries without loss) and, after confirmation, calls `resetApplication`. The interface reads `client.storage` and says whether the data is stored durably, in memory only, or waiting on another tab; it offers `requestPersistence` from a button, and it shows each failure reason the client reports (`store-newer`, `store-lost`, `store-unmarked`, `store-unreadable`, `import-interrupted`, `migration-failed`) with the choice to reset, and to export first where the store is readable; `store-lost` offers reset only. Its README describes what a visitor loses by clearing site data. The default `whenLocked: "wait"` of the core applies: a second tab waits and says so.

### 2.7 Checks

A contract test runs every provider method against the real engine through the core and asserts the shapes react-admin expects, including the rejection of undeclared fields and injection attempts in sort and filter values. A browser test runs the demo in Chromium, Firefox and WebKit through create, filter, sort, paging, changing a reference, delete, reload (the records remain), a second tab, and reset. A package test installs the packed package into a clean project. Test names carry the identifiers of the requirements they cover, as the other packages' tests do. The unit, browser, package and trace checks run in the repository's `test:drift` and in the full workflow, so the demo does not decay between launches.

## 3. Alternatives Considered

- **A Refine data provider first.** Rejected for the first demo: its structured filters would map to Cypher more cleanly, but it was not evaluated for maintenance or licence terms, and react-admin's reference components give relationships on screen with no extra work. Nothing here prevents a Refine provider that reuses the schema and the translation later.
- **A local-only provider from react-admin's ecosystem (fake REST, local storage).** Rejected for the demo: it holds flat records, so the relationships, neighbourhoods and aggregates the demo exists to show would be plain fields. It remains the comparison for the demo's load time.
- **Put a mock REST server in front of react-admin's stock provider.** Rejected: it adds a layer that serializes everything through URLs and JSON, discards the graph semantics the demo exists to show, and still needs an implementation of every endpoint.
- **Derive the schema from the graph.** Rejected: a declared list is what makes the field-name whitelist safe, and the graph cannot say which relationship type is a reference, which direction it runs, or which fields users may filter. A helper that proposes a schema from a sample graph can come later.
- **Use the engine's element ids as record ids.** Rejected: they are internal, can be reused after a deletion, and change on export and import, so a record's id would not survive a restore. The `id` property is already part of the data format.
- **Keep the provider inside the demo.** Rejected: people adopting it want a dependency they can update, not roughly four hundred lines to copy.

## 4. Consequences

- The provider is the first working case of two needs RFC-005 expects to recur: turning interface state into queries from a declared list of names and bound parameters, and giving records a stable application id. Their code stays inside this package behind a narrow seam. The datagrid demo will need the same translation; extraction into a shared library happens then, as that demo's work.
- Many-to-one references only. A person assigned to several projects, or a relationship that carries data, does not fit; the demo avoids them and the README says so.
- A list costs two statements (data and count). The graphs involved are small, and the cost is stated, not measured.
- Data is per browser and persists. A visitor cannot share a record with another visitor or another device, and clearing site data erases it, which the export control and the demo's notice address.
- The demo builds on the core's application mode (ADR-009) and its catalog (ADR-010), both implemented. Only one open tab uses the store at a time, so a second tab of the demo waits and says so.
- A store name is one segment of an origin's namespace, and two applications on one origin that choose the same name share a store (RFC-007 7.3 leaves collisions open). The demo's name is fixed, so a project that copies the demo renames it.
- The package fixes one interpretation of react-admin's filter conventions. Another set of conventions needs a schema or a provider option, not a second package.
- The demo pulls in react-admin's component library and its bundle; its paid add-on modules are not used.
- To confirm at implementation, and amend this ADR with the results: that a single statement can remove and create a relationship in one pass; that `SKIP` and `LIMIT` accept parameters; that case-insensitive contains and comparisons behave as assumed for strings, numbers and mixed types; that `RETURN n` yields properties in the envelope's node value as described; and that a statement issued while the client is `loading` resolves once it is ready.
- Follow-up work: a Refine provider; a many-to-many reference mechanism; a schema helper; the shared translation library once a second demo needs it.

## 5. Related

- RFCs: RFC-005, RFC-006. For this demo the ADR settles RFC-005 7.4 (a reset control, an export and a storage notice) and 7.6 (the `id` property as the stable record id), and RFC-006 7.1 (the default policy: a second tab waits).
- ADR-009 (application graphs in the core)
- ADR-001 (worker hosting), ADR-002 (the `id` property and graph data format), ADR-003 (the descriptor the demo loads)

## 6. Amendments

### 2026-11-10, planning the implementation (specs/008-react-admin-provider)

The assumptions listed under 4 as "to confirm at implementation" were run against the real engine while the implementation was planned (`specs/008-react-admin-provider/probes/`, kept as the package's `engine-assumptions` tests; single runs on one machine, against the vendored engine build). Results, and what they change:

- **Confirmed as assumed.** One statement can remove a relationship and create another. `SKIP` and `LIMIT` accept parameters, so the interpolation fallback of 2.3 is not needed. Case-insensitive contains works as `toLower(x) CONTAINS toLower($q)`. Comparisons work on strings and numbers; a comparison across types returns no rows and no error, so the provider converts filter values to the field's declared type before sending them. `RETURN n` gives a node value whose `properties` hold the application `id`; the node's own `id` there is the engine's number and never reaches a record. A `null` in `SET n += $props` removes the property, so an update with `null` clears a field. A statement sent while the core's client is `loading` stays pending and resolves when it is ready; the core's `packages/web/tests/application/browser/storage.spec.ts` covers it (a second tab waiting on the first).
- **2.2, uniqueness and lookup: a constraint replaces the index.** The engine enforces per-label uniqueness constraints; without one, two nodes can share an `id`. The package creates one per resource label (`CREATE CONSTRAINT rel_<Label>_id IF NOT EXISTS FOR (n:`Label`) REQUIRE n.`id` IS UNIQUE`), exported as `ensureSchema(client, schema)` and run once by the provider before its first statement. The constraint owns an index on `id`, so lookups need no other. This supersedes the `schemaIndexes(schema)` that the review of 2026-11-10 added to 2.2 and 2.6: a plain index on the same property stops the constraint from being created, and a plain index created after it is refused, so the demo passes no `id` index to the core. A duplicate `id` on `create` is the engine's `ConstraintValidationFailed`, which the provider answers with 400. `update` ignores an `id` in its data. A store that already holds duplicate ids fails `ensureSchema` with 400.
- **2.4, writes match every target first.** The replacement written in 2.4 (delete the old relationship, then match the new target) deletes the old relationship and creates nothing when the target does not exist. Writes therefore match the node and every supplied target before anything changes, so a missing target changes nothing and the provider answers 400 naming the field. A write that returns no rows costs one read to tell a missing node (404) from a missing target (400). `updateMany` and `deleteMany` are one statement each.
- **2.3, the reference fill.** A plain optional match for the reference field returns a node twice when it has two relationships of the type, which a seed or a hand-edited store can produce. The list statement pages first, then fills with `head(collect(...))`, then orders again.
- **2.5, a timeout on every statement.** The core's `Client.query()` applies no timeout (only `run()` does). The provider passes `timeoutMs` (option, default 10,000 ms) to every `query` and answers 503 when it expires.
- **2.6, failure screens offer reset only.** The core's `exportApplication()` rejects once a client has failed, so the failure screens cannot offer an export. The reset control, while the data is open, keeps its export. Export from a failed client is a follow-up for the core (ADR-009).
- **2.1 and 2.6, the name.** The implementation calls the application a demo (`demos/react-admin`, package and store `react-admin-demo`) where this ADR says starter. A project-wide change of vocabulary is pending on another branch.
- **Not asserted.** Whether the engine uses the index for a lookup by `id` cannot be observed (`EXPLAIN` returns nothing and the index's read count stayed at 0), so the spec asserts that the constraint and its index exist, not that lookups use them.

### 2026-11-10, implementation (packages/react-admin, demos/react-admin, specs/008-react-admin-provider)

What building it added to the decisions above:

- **2.3 and 2.4, shapes the ADR left open.** `getMany` answers the records found, ordered by `id`. A missing `pagination` means page 1 of 25. `create` and `update` read the record back (a second statement), so the answer carries the references as stored; the write itself is one statement. `updateMany` answers the ids that changed and `deleteMany` the ids removed, each from one statement. A filter on a reference field accepts one id or a list. A key that is itself a declared field is never split into a comparison suffix.
- **2.2, `ensureSchema(client, schema, options?)`.** It takes the provider's options as an optional third argument so the timeout and the observer apply to the constraint statements too. A failure is not remembered: the next call tries again.
- **2.5, status 503.** A statement that exceeds `timeoutMs`, a core `lost` rejection and a failed client all answer 503; nothing is sent to a failed client.
- **2.6, the demo.** The failure screens offer a confirmed reset and no export. For `store-unreadable` the reset first calls the core's `resetCatalog()`, because a catalog that does not parse is never written over and `resetApplication()` alone cannot recover from it; that clears the origin's record of every stored graph, which the screen and the demo's README say. The reset control, while the data is open, offers the export (no `allowLoss`, since the demo's records are strings, numbers and booleans). The notice asks the browser to keep the data only from a button.
- **Measured (single runs, Node, the engine in the same process; `packages/react-admin/figures.json`).** A list costs two statements and a lookup one once the constraints exist; the first call of a provider over three resources adds three. A page of 10 sorted by name took 0.7 ms over 50 people and 12 ms over 5,000 (median), so a list pays for the sort on every page of a large resource; a lookup by `id` took 0.08 ms over 5,000 people with the constraint's index and 1.6 ms for the same statement without it, consistent with the index being used (the engine offers no plan to confirm it). From a clean checkout to the lists on screen took 13.6 s (install 9.6, build 2.9, `dev` to rows 1.1) with a warm package store and the engine's binary already built.
- **Follow-ups.** Export from a failed client is a change for the core (ADR-009). A sort on a field of a large resource would want an index on that field, which the core's `indexes` option can create; the provider does not.
