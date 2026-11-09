---
id: ADR-008
title: A react-admin Data Provider over the Core, with a Local-First Starter
status: proposed
rfcs: [RFC-005, RFC-006]
created: 2026-11-08
---

# ADR-008: A react-admin Data Provider over the Core, with a Local-First Starter

## 1. Context

react-admin is a React framework for administrative applications: lists with sorting, filters and paging, edit forms, and pickers for related records. It reaches all of its data through one object, the data provider, whose methods take a resource name and parameters and return promises. The methods are `getList`, `getOne`, `getMany`, `getManyReference`, `create`, `update`, `updateMany`, `delete` and `deleteMany`. Every record must carry an `id`. A list request carries a page and page size, a sort field and direction, and a flat filter object whose keys follow conventions the provider chooses (`field_gte`, a free-text `q`, and so on); the answer is the records and a total. A relationship to another record is a field holding that record's id, which the interface components resolve through further provider calls. react-admin 5.15.6 is MIT-licensed, about 227,000 downloads a week, and its core package was published on 2026-11-07 (npm registry, checked 2026-11-08).

The database side has these properties. The core package's client runs the engine in a worker; `query(statement, params)` returns a promise, waits until the instance is ready, and resolves with the engine's result envelope, in which an engine error arrives in an `error` field and does not throw. A node comes back as a tagged value with the engine's element id, its labels and its properties. Element ids are internal to the engine, while the graph data format already gives every node an application `id` property (ADR-002). One statement is one atomic unit; the client offers no multi-statement transaction.

A data provider is a small contract with a broad payoff: a team that describes three or four entities gets lists, filters, edit forms and relation pickers over a graph, with no server. That is the first starter proposed by RFC-005, which asks for runnable, local-first starters that lower the cost of starting a project. The data has to persist. A starter that empties on reload is a demo, not an application, and RFC-006 sets out what an application graph needs from the core: a durable store that a new seed revision does not wipe, a seed applied once, and a versioned schema. ADR-009 decides that support: an application mode of the core's client with a named durable store, a seed applied once, and versioned migrations. This ADR builds on it. Two parts of the work have real design in them: turning the interface's sort and filter into queries without allowing injection, and mapping react-admin's foreign-key fields onto relationships.

## 2. Decision

### 2.1 Two deliverables

A package, `@relate/react-admin` in `packages/react-admin`, exports `createDataProvider(client, schema)`. It takes any core client, from `createClient`, `createSiteClient` or an adapter's helper, and has peer dependencies on `react-admin` ^5 and `@relate/web`. It contains no interface components and no hosting code.

A starter application, `starters/react-admin`, is a Vite and React app that uses the package. It is unpublished, and it is where later starters' shared needs get noticed (RFC-005 5.3).

### 2.2 The schema

The caller declares every resource. A resource entry names its node label and lists its fields, each with a type (string, number or boolean) and flags for sortable, filterable and searchable. It also lists its references: a reference field name, the target resource, the relationship type, and the direction. A reference is many-to-one in this version: a record has at most one outgoing relationship of that type, and the reference field holds the target's `id`. A one-to-many view is the same relationship read from the other side, which is `getManyReference`.

The record's `id` is the node's `id` property. `create` generates one (`crypto.randomUUID()`) when the data has none. Element ids never appear in records.

### 2.3 Reads

`getList` builds one data statement and one count statement from the request. Sort and filter field names are accepted only if the schema declares them, and are interpolated, quoted, only after that check; every value is a bound parameter. An undeclared field rejects the request with a 400 error. Conventions:

- A plain key is equality; an array value is membership.
- Suffixes `_gte`, `_lte`, `_neq` and `_lt`, `_gt` are comparisons on a declared filterable field.
- `q` is a case-insensitive contains over the resource's searchable fields, joined by OR.
- A reference field as a filter key tests the relationship's target id.
- Paging is `SKIP` and `LIMIT` from the request's page; `total` is the count statement's value.

`getOne` and `getMany` match on `id` (a single value or a list). `getManyReference` is `getList` with the reference field's filter fixed to the given target id. A record is the node's properties, plus each declared reference field filled from the relationship's target id.

### 2.4 Writes

Each write is a single statement, so it is atomic without a transaction.

- `create` creates the node with its declared fields and, for each reference supplied, the relationship to the target found by `id`.
- `update` sets the supplied declared fields on the node found by `id`. For a supplied reference it removes the existing relationship of that type and creates the new one, in the same statement. `updateMany` applies the same data to every id.
- `delete` and `deleteMany` detach-delete the nodes.

Fields not in the schema are ignored on write and reported to the caller in the error text if they were the only data. A write that matches no node answers 404. Relationship properties and many-to-many relationships are not supported in this version.

### 2.5 Errors and failure

An engine error in the envelope, a missing record, and an undeclared field become a thrown error with a `status` (400, 404) and the engine's message, the shape react-admin's notifications read. When the core client's status is `failed`, the provider throws with status 503 and the client's failure message. The provider does not retry; the core already replaces a crashed worker. `onStatement`, an optional callback, receives each statement and its parameters, so a starter can show what ran.

### 2.6 The starter

The starter has three resources: companies, people (each works at one company) and projects (each owned by one company, led by one person). Data of about 50 people and a few companies and projects is loaded on first run from a graph data document given as the seed of the client's application mode (ADR-009), as the other starters will, and never reapplied over stored data. The starter's graph is an application graph (RFC-006, ADR-009), in a store named `react-admin-starter` at schema version 1 with no migrations yet: the visitor's records survive reloads and return visits, in the one graph that all of the starter's pages share. The interface has sortable, filterable, paged lists, edit forms with relation pickers, a company page listing its people and projects through `getManyReference`, and a panel showing the statements the provider ran. A "reset demo data" control offers an export (`exportApplication`, whose seed data the format carries without loss) and, after confirmation, calls `resetApplication`. The interface reads `client.storage` and says whether the data is stored durably, in memory only, or waiting on another tab; it offers `requestPersistence` from a button, and it shows the `store-newer`, `store-unmarked` and `store-unreadable` failures with the choice to export or reset. The starter carries a schema version, and its README describes what a visitor loses by clearing site data.

### 2.7 Checks

A contract test runs every provider method against the real engine through the core and asserts the shapes react-admin expects, including the rejection of undeclared fields and injection attempts in sort and filter values. A browser test runs the starter in Chromium, Firefox and WebKit through create, filter, sort, paging, changing a reference, delete, reload (the records remain), a second tab, and reset. A package test installs the packed package into a clean project. Test names carry the identifiers of the requirements they cover, as the other packages' tests do.

## 3. Alternatives Considered

- **A Refine data provider first.** Rejected for the first starter: its structured filters would map to Cypher more cleanly, but its repository's maintenance in late 2026 could not be established, and react-admin's reference components give relationships on screen with no extra work. Nothing here prevents a Refine provider that reuses the schema and the translation later.
- **Put a mock REST server in front of react-admin's stock provider.** Rejected: it adds a layer that serializes everything through URLs and JSON, discards the graph semantics the demo exists to show, and still needs an implementation of every endpoint.
- **Derive the schema from the graph.** Rejected: a declared list is what makes the field-name whitelist safe, and the graph cannot say which relationship type is a reference, which direction it runs, or which fields users may filter. A helper that proposes a schema from a sample graph can come later.
- **Use the engine's element ids as record ids.** Rejected: they are internal, and records would not survive a reload that rebuilds the graph from the seed document. The `id` property is already part of the data format.
- **Keep the provider inside the starter.** Rejected: people adopting it want a dependency they can update, not roughly four hundred lines to copy.

## 4. Consequences

- The provider is the first working case of two needs RFC-005 expects to recur: turning interface state into queries from a declared list of names and bound parameters, and giving records a stable application id. Their code stays inside this package behind a narrow seam. The datagrid starter will need the same translation; extraction into a shared library happens then, as that starter's work.
- Many-to-one references only. A person assigned to several projects, or a relationship that carries data, does not fit; the starter avoids them and the README says so.
- A list costs two statements (data and count). The graphs involved are small, and the cost is stated, not measured.
- Data is per browser and persists. A visitor cannot share a record with another visitor or another device, and clearing site data erases it, which the export control and the starter's notice address.
- The starter depends on the core's application mode (ADR-009), which is accepted but not yet implemented, so the starter and package are built after it. ADR-009 allows only one open tab to use the store at a time, so a second tab of the starter waits and says so. Later amendments to ADR-009 may change 2.6 and 2.7.
- The package fixes one interpretation of react-admin's filter conventions. Another set of conventions needs a schema or a provider option, not a second package.
- The starter pulls in react-admin's component library and its bundle; its paid add-on modules are not used.
- To confirm at implementation, and amend this ADR with the results: that a single statement can remove and create a relationship in one pass; that `SKIP` and `LIMIT` accept parameters; that case-insensitive contains and comparisons behave as assumed for strings, numbers and mixed types; that `RETURN n` yields properties in the envelope's node value as described; and that a statement issued while the client is `loading` resolves once it is ready.
- Follow-up work: a Refine provider; a many-to-many reference mechanism; a schema helper; the shared translation library once a second starter needs it.

## 5. Related

- RFCs: RFC-005, RFC-006
- ADR-009 (application graphs in the core)
- ADR-001 (worker hosting), ADR-002 (the `id` property and graph data format), ADR-003 (the descriptor the starter loads)
