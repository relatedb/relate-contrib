# Research: The react-admin Data Provider and Starter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-10

Decisions the plan rests on. The engine behaviours ADR-008 listed "to confirm at implementation" were probed against the real engine while planning (scripts in [probes/](probes/), run with `node probes/<file>.mjs` from this directory; single runs on one machine, against the vendored engine build). Items still to confirm are marked **Confirm** and have a task that checks them before the statements that depend on them.

## R1: The provider depends on a narrow client interface

**Decision**: `createDataProvider` takes `ProviderClient`, the subset `Pick<Client, "query" | "status" | "diagnostic">` of the core's client. Anything with those three members works: a client from `createClient`, `createSiteClient` or an adapter helper.

**Rationale**: the provider issues statements and reads failure state, nothing else. A narrow type lets the contract test run the provider over a small in-process client (R11) without a worker, while the starter's browser test uses the real client.

**Alternatives**: depend on the whole `Client` (rejected: forces the contract test to host a worker in Node, which the core's own Node tests avoid).

## R2: Statement shapes, as measured

The probes ran each form the ADR assumes. Results (engine envelope, node values `{ id, kind: "node", labels, properties }`):

| Assumption (ADR-008) | Result | Probe |
|---|---|---|
| One statement removes and creates a relationship | Works (`MATCH … OPTIONAL MATCH …-[r]->() DELETE r WITH DISTINCT p MATCH (c) CREATE …`). | reads-and-writes |
| `SKIP` and `LIMIT` accept parameters | Yes (`SKIP $skip LIMIT $limit`). The interpolation fallback (FR-010) is not needed. | reads-and-writes |
| Case-insensitive contains | `toLower(x) CONTAINS toLower($q)` works. | reads-and-writes |
| Comparisons on strings and numbers | Work for numbers and for strings. A comparison between types (a string field with a number) returns no rows and no error; the provider rejects the value earlier (FR-008). | reads-and-writes |
| `RETURN n` yields properties in the node value | Yes, under `properties`; the node's own `id` field there is the engine's element id, a number, never used as the record id. | reads-and-writes |
| Equality, membership and counts with parameters | Work (`=`, `IN $ids`, `count(n)`). | reads-and-writes |
| `SET n += $props` | Works; a `null` value removes the property. | reads-and-writes |
| Detach delete of a missing id | Returns a count of 0, no error. | reads-and-writes |
| A reference filter | `EXISTS { (n)-[:T]->(:Target {id: $v}) }` works for one target id. | guarded-writes |
| A uniqueness constraint on `id` | Enforced; owns an index; `IF NOT EXISTS` idempotent; conflicts with a separate index on the same property (R3). | constraints, constraints-2, constraints-3 |
| A statement issued while the client is `loading` resolves once it is ready | **Confirm** (R10). | |

## R3: Uniqueness of `id` is a constraint the package creates

**Findings** (probes constraints, constraints-2, constraints-3): the engine enforces per-label uniqueness. After `CREATE CONSTRAINT c FOR (n:Label) REQUIRE n.id IS UNIQUE`, a duplicate `CREATE` and a `SET n.id` to a taken value both fail with `ConstraintValidationFailed`; the same `id` on another label is allowed; nodes with no `id` are not constrained. The constraint owns a range index on the property (`SHOW INDEXES` lists it with `owningConstraint` set), so lookups by `id` need nothing else. `CREATE CONSTRAINT … IF NOT EXISTS` is idempotent. Creating it over data that already holds duplicates fails, and creating it while a plain index exists on the same label and property fails too ("a constraint cannot be created until the index has been dropped", even with `IF NOT EXISTS`); creating a plain index after the constraint also fails (`EquivalentSchemaRuleAlreadyExists`). Without a constraint, nothing prevents two nodes with the same `id`.

**Decision**: the package creates one constraint per resource label, named `rel_<Label>_id`, with `CREATE CONSTRAINT … IF NOT EXISTS`. `ensureSchema(client, schema)` runs them; `createDataProvider` runs it once, memoised, before its first data statement, so a caller does nothing. A duplicate `create` is then an engine error the provider maps to 400. The starter passes no `id` index to the core's application `indexes`.

**Rationale**: the constraint makes uniqueness atomic with the write and also supplies the lookup index. Running it on every open is idempotent, so whether the durable store keeps a constraint across a reload does not matter, and a store whose constraint was never created (a crash between the first run and the first provider call) is repaired on the next open. It needs no core change and works for any client, not only application mode.

**Alternatives**: a `constraints` option in the core's application mode, created at first run (rejected for now: it changes the core and needs an ADR-009 amendment, and it helps application graphs only); an in-statement guard (`OPTIONAL MATCH … WHERE e IS NULL`), which works without a constraint and was verified, but leaves a hand-written `CREATE` or a `SET` of `id` unchecked and still needs an index for speed.

**Cost and limits**: one statement per provider per page load. If the store holds duplicate ids (a hand-edited or imported store), `ensureSchema` fails with 400 and no data statement runs until the duplicates are removed; the failure names the resource. **Confirm**: the first-run order in the starter (seed loaded by the core, then the constraint created over unique ids) succeeds.

## R4: A naive relationship replacement loses the old relationship when the target is missing

With the ADR's shape (`OPTIONAL MATCH … DELETE r WITH DISTINCT p MATCH (c {id:$cid}) CREATE …`), a missing target deleted the existing relationship and created nothing, and the statement returned no rows (probe reads-and-writes: "replace rel, target missing" then "check" shows the relationship gone). That would turn a rejected write into data loss.

**Decision**: match the node and every supplied target first, so a missing target matches nothing and changes nothing; delete the old relationships and create the new ones afterwards (`MATCH (n {id:$id}), (t0 {id:$r0}) SET n += $props WITH n, t0 OPTIONAL MATCH (n)-[o:T0]->(:Target0) DELETE o WITH DISTINCT n, t0 CREATE (n)-[:T0]->(t0)`). Verified in guarded-writes: a missing target left the name and relationship unchanged, two references replaced together, and each ended with exactly one relationship. Clearing a reference (`null`) uses the statement without the target match.

**Zero rows**: a write that returns no rows has two possible causes (no such node, a missing target). The provider then runs one read to name the cause: 404 for a missing node, 400 naming the field for a missing target. The read only chooses the error; the write was already atomic and did nothing. A duplicate `id` is not a zero-row case: the constraint makes the engine report `ConstraintValidationFailed`, which maps to 400.

## R5: A null clears a property

`SET n += $props` with `{age: null}` removed the property. So `update` with `null` for a declared field clears it, as it does for a reference, and a record read afterwards returns that field as `null` (the provider fills declared fields that are absent with `null`, so every record has the same shape).

## R6: Ordering with absent values

`ORDER BY n.age ASC, n.id ASC` placed nodes without `age` last, and ties were ordered by `id`. Descending order with absent values was not measured; **Confirm** in the contract test, which asserts only that paging through a descending sort returns every record once (SC-003), not where absent values fall.

## R7: Reference fill uses `head(collect(...))`

A plain `OPTIONAL MATCH` for the reference field produced two rows for a node that had two relationships of the type (probe indexes-and-fill), which would put a record in a list twice if a seed or a hand-edited store broke the many-to-one rule. `WITH n, head(collect(t.id)) AS ref0` gave one row per node. **Decision**: the data statement pages first (`WITH n ORDER BY … SKIP $skip LIMIT $limit`), then fills references with `head(collect())`, then orders again for the output. **Confirm** that `ORDER BY n.<field>` after the aggregating `WITH` is accepted (the probe ordered by an alias); fallback: carry the sort values through the `WITH`.

## R8: Whether an index is used cannot be read from `EXPLAIN` or the read count

`EXPLAIN` returned no rows (probe indexes-and-fill). `SHOW INDEXES` reports `readCount` and `lastRead`, but `readCount` stayed 0 after a lookup by `id` (probe constraints-3), so index use cannot be asserted that way. **Decision**: SC-009 asserts that every resource's `id` carries a uniqueness constraint and that the constraint's index exists (`SHOW CONSTRAINTS`, `SHOW INDEXES`), and the statements filter on `id` equality; the timings are recorded, single run. Whether the engine's planner uses the index for `{id: $v}` lookups is not asserted.

## R9: Records come from properties only

A record is the node's `properties` (which hold the application `id`), with declared fields filled in as in R5 and each reference field set from the fill column. The engine's numeric node id and the element id string never appear (FR-004).

## R10: A statement issued while loading

The core documents that queries are pending while the client is `loading` and resolve after it is ready (`packages/web/README.md`, "Storage"; ADR-009 whenLocked wait). **Confirm**: find the existing core test that covers it, or add a case to the starter's browser test (a statement sent immediately after `createClient`). No core change is expected.

## R11: Contract tests run the provider over an in-process client

**Decision**: the package's unit tests build a `ProviderClient` over `RelateDb` from `@relate/relate-wasm` (initialised from the vendored binary in Node, as the core's own tests do), with `query(statement, params)` returning the parsed envelope, `status` `"ready"` and `diagnostic` null. A second small client with `status: "failed"` drives the 503 case. They exercise every method, the injection and undeclared-name rejections, and the shapes react-admin reads. The starter's browser test then runs the same provider through the real client, worker and application store.

**Rationale**: the contract between the provider and the engine is the statements and the envelope; the worker is the core's concern and is already tested there.

## R12: The starter's toolchain

**Decision**: Vite and React, `react-admin` pinned to an exact 5.x release (5.15.6 at planning: MIT, published 2026-11-07, peers React 18 or 19, `react-router` 6.28+ or 7.1+, `react-hook-form` ^7.72, `@tanstack/react-query` ^5.83; npm registry, checked 2026-11-10). The engine binary is passed to `createClient` by URL through the bundler's asset import, as the core's README shows. The starter lives in `starters/react-admin` and the workspace gains `starters/*`; `pnpm -r build` then builds it, which is the build check for RFC-005's "does not decay".

**Alternatives**: a Next or Astro host (rejected: the starter exists to need no framework adapter; ADR-008 2.1 fixes Vite and React).

## R13: Repository wiring and trace

**Decision**: scripts follow the existing pattern: `test:react-admin` (Vitest, Node, contract tests), `test:react-admin-browsers` (Playwright, three browsers, over the starter's built preview), `test:react-admin-package` (pack and install in a clean project), `test:react-admin-trace` (`covers-ra:` tags). They join `test:units`, `test:browsers-all`, `test:packages-all` and `test:traces-all`, and so `test:drift` and `test:all`. The trace check is `tests/trace/check-trace.ts` in the package, modelled on `packages/sveltekit/tests/trace/check-trace.ts`.

## R14: The seed is generated once and committed

**Decision**: a deterministic script (`starters/react-admin/scripts/make-seed.ts`) writes `src/seed.json`, a graph data document (ADR-002) of 50 people, 6 companies and 10 projects, with names combined from fixed lists and no real persons. The output is committed; the script is the record of how it was made. Every node has a string `id`; relationships are `WORKS_AT`, `OWNED_BY` and `LED_BY`, one per person or project each.

## R15: Documents

**Decision**: a README for the package (API, schema, conventions, what is not supported) and one for the starter (run, copy, rename the store, what clearing site data loses), and a dated amendments section in ADR-008 recording R2 to R8 and the results of the Confirm items.

## Open items to confirm during implementation

- R6: descending order with absent values (only completeness asserted).
- R7: `ORDER BY n.<field>` after the aggregating `WITH`.
- R3: the first-run order in the starter (seed, then constraint).
- R10: the existing or added test for a statement issued while loading.
- Reference filter with several target ids: `EXISTS { (n)-[:T]->(t:Target) WHERE t.id IN $v }`. Fallback: an OR of single-target forms.
