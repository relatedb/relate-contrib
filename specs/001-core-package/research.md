# Research: Core Package

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-02

Each entry states a decision, why, and what else was considered. Where a claim rests on an
experiment, the method and environment are given; all figures are single runs.

## R1. What the engine's browser API provides

**Decision**: Build the worker on the API as documented in the engine's WASM spec
(`docs/api/wasm/spec.md` in the CypherLite repository) and checked against the spike code:

- `init({module_or_path})` takes the binary's URL (or bytes); the core passes it through from an option.
- `new CypherliteDb()` is in-memory; `await CypherliteDb.open("opfs://<name>")` opens the durable store
  and works only in a dedicated worker. `<name>` is 1 to 64 characters from `[A-Za-z0-9_-]`.
- `execute(statement, paramsJson)` takes the parameters **as a JSON text** and returns the result
  envelope as a JSON text; engine errors arrive in the envelope's `error` field and do not throw.
- `reset()` drops the database; for a store it wipes the `opfs://` name and reopens it. This is the reset
  the staleness check uses.
- A second holder of the store fails with `storage locked: opfs://<name>`.
- `isWasmTrap` (from `trap.js`) classifies a trap by type and message and misses the second error a dead
  instance throws (observed in SPIKE-004), so the worker marks the instance dead at the first trap and does
  not rely on the classifier afterwards (FR-008).

**Rationale**: it is the contract the engine documents and the one the spikes exercised.
**Alternatives**: none; the engine is fixed by the constitution (principle VI).

## R2. Loading a document: dynamic labels, element ids and float encoding

**Decision**: The loader runs two fixed statements in batches of 1,000 rows (the engine's own bulk
batch size), after the caller-named indexes exist:

```text
nodes: UNWIND $rows AS row CREATE (n:$(row.labels)) SET n = row.props RETURN row.k AS k, elementId(n) AS e
links: UNWIND $rows AS row MATCH (a) WHERE elementId(a) = row.s MATCH (b) WHERE elementId(b) = row.t
       CREATE (a)-[r:$(row.type)]->(b) SET r = row.props
```

`row.props` is the node's `properties` with the document `id` added. The loader keeps a map from document
id to element id for the duration of one load. When a scope is given, `scope` is added to `row.props`.

**Experiment** (this resolves the "not verified" items in ADR-002), run in Node 24.14.1 on the engine build
vendored in the spikes, main thread, in-memory, single run, not a browser:

| Check | Result |
|---|---|
| Dynamic labels: two labels, an empty list | works (`labels(n)` returns them) |
| Dynamic relationship type, a self-link, link properties | works |
| Endpoint lookup by `elementId(a) = …` with no label or index | works; 20,000 pages and 100,000 links load in 2.5 s |
| 1,000 pages (5,000 links) | 156 ms (nodes 40, links 116) |
| 5,000 pages (25,000 links) | 604 ms (nodes 132, links 471) |
| 20,000 pages (100,000 links) | 2,484 ms (nodes 514, links 1,970) |

ADR-001 recorded 0.16 s, 0.6 s and 2.2 s for the indexed replay in a browser's main thread, so loading
through element ids costs the same within the noise of two different environments. A browser measurement is
still required (spec SC-002, FR-031).

**Finding that changes ADR-002**: an array property whose items mix whole and fractional numbers is
rejected (`type error: InvalidPropertyType`). `JSON.stringify` writes `[0, 1, 0.5]`, and the engine reads
`0` and `1` as integers. An array of only whole numbers (integers) or only fractional values (floats)
loads. The engine reads `0.0` in JSON text as a float: `[0.0, 1.0, 0.5]` loads as `LIST<FLOAT>`, and
`2.0` as a parameter is a `FLOAT`. An array that mixes strings and numbers is rejected, as ADR-002 says.
Embedding arrays routinely contain whole values, so the loader cannot pass them through `JSON.stringify`.
**Decision**: the loader writes the parameters' JSON text itself: a number array that contains at least one
fractional value is written with every item as a float (`1.0`); an all-whole array stays integers. This
is recorded as an amendment to ADR-002.

**Rationale**: the pattern is the engine's own bulk loader (ADR-0155), needs no label or index, and its
cost matches the indexed replay. **Alternatives**: an index per label with a label on every link endpoint
(more input, no faster); one statement per distinct label set (statement count grows with the document);
`executeScript` over generated statements (very large text at 20,000 pages).

## R3. Build and packaging

**Decision**: TypeScript in strict mode compiled by `tsc` to unbundled ES modules with declaration files.
The worker is its own module, started with `new Worker(new URL("./worker/worker.js", import.meta.url),
{type: "module"})`, which Vite, webpack, Rollup and esbuild resolve and bundle. The package has no runtime
dependency; `@neo4j-labs/cypherlite-wasm` is a peer dependency, and the binary's URL is an option. Exports:
`.` (client and profiles), `./validate` (for build steps, no browser APIs), `./worker`, `./conformance`.

**Rationale**: an unbundled library lets each adapter's bundler place the worker and the binary (the bundler
issue measured in SPIKE-001), and avoids shipping a second copy of anything. **Alternatives**: tsup or
Rollup output (adds a build tool and a bundled worker that adapters could not re-bundle); a Vite library
build (ties the package to Vite).

## R4. Test stack and fault injection

**Decision**:
- **Unit** (Node, Vitest): the validator, the number encoder, the failure counter and state machine, the
  subscription registry, scope handling, with a fake worker. The validator is also checked against the JSON
  Schema in the contracts (ajv as a dev dependency) so the two cannot drift.
- **Browser** (Playwright test runner, Chromium, Firefox and WebKit): the loader, client, profiles, store,
  recovery and the conformance check, against the example site served by Vite (a dev dependency; the site
  has no framework).
- **Fault injection** with no test-only code in the shipped worker: a trap is a statement with about a
  thousand nested parentheses (observed in SPIKE-004); a runaway is a three-way cartesian `count(*)` over a
  1,000-page graph (a 5,000-page version trapped once with `unreachable`, so it is not used for timeouts);
  a worker error is the client terminating the worker through the same path a worker error uses, exercised
  with a worker script that throws on a marked message, supplied through an option the tests pass; a locked
  store is a second page holding the same store name; a stale store is a changed `revision`.
- **Load-time baselines** are JSON files under `packages/core/tests/baselines/`, one per browser and
  environment name; a run fails above twice the baseline (FR-031). The first run on a new environment
  writes the baseline.

**Rationale**: Playwright is the one tool that drives all three engines (FR-030); Vitest covers pure logic
quickly. **Alternatives**: Vitest browser mode (fewer engines at the time of writing and no control over
multiple pages and tabs); Selenium or WebdriverIO (no advantage here).

## R5. Staleness check and the stored copy of the descriptor

**Decision** (ADR-003): the page gives the client a descriptor (`id`, `revision`, the data's location and
counts, optional indexes). The worker keeps a copy of it in a file at the origin-private root, for example
`related-web/<id>.json`, outside the `cypherlite/<name>/` directory the engine manages for its store. The file
is read and written in the worker with a synchronous access handle, the capability the engine's store needs
too. With a store, start-up is:

1. open the store `gw-<id>` (the `id` is 1 to 48 characters from `[A-Za-z0-9_-]`, so the name stays within
   the engine's 64-character limit), retrying a locked store from 100 ms to 500 ms for at most 5 s and then
   continuing in memory (FR-012);
2. read the stored copy; if its `revision` equals the descriptor's, restore: no data fetch, no index
   created (the store keeps its indexes; SPIKE-005 saw `IndexAlreadyExists` on a restored store);
3. run the sweep of leftover scoped data, then compare the store's node count with `data.nodes`; a
   difference is treated as stale (FR-038);
4. otherwise remove the copy, `reset()` the store if it is not empty, fetch the data, validate it, check
   its `revision` and counts against the descriptor (FR-039), create the indexes, load, and write the copy
   last.

A locked store, after the retries, loads in memory from the data and writes no copy. A graph with no
descriptor never uses a store (FR-023).

**Rationale**: the descriptor lets the page decide before fetching the data, and keeping the record outside
the graph leaves queries, counts and views untouched. Removing the copy first and writing it last means a
copy that is present describes a complete store; the count check also catches a store emptied on its own.
**Alternatives**: a metadata node (rejected in ADR-003); the revision in the store name; the copy in
IndexedDB; HTTP validators on the data URL (all recorded in ADR-003).
**Not verified**: reading and writing the copy from a worker in Chromium, Firefox and WebKit. The tests in
`persistent.spec.ts` and `per-page.spec.ts` are where this is checked.

## R6. Failure counting and the `failed` status

**Decision**: An attempt is one start of an instance (the initial one or a replacement). A failure is an
attempt that ends without reaching `ready`. The count includes the initial attempt, a replacement after a
fault from `ready` starts the count at zero (that fault is not itself an attempt), and reaching `ready` resets
it. At three failures the status becomes `failed` (FR-009). So a document that crashes the engine on every load
gives three attempts in total (SC-010), and a crash from `ready` followed by three failing replacements also
ends in `failed`. There is no delay between attempts, apart from the store-lock retries inside an attempt.
`unsupported` (no worker support) sets `failed` at once with no attempts. A fresh attempt resets the count.

**Rationale**: it makes FR-009 and SC-010 agree and is the smallest rule that always ends. **Alternatives**:
backoff between attempts (no benefit for three attempts); counting the crash from `ready` as an attempt (it
would give two replacements on that path and three on the initial path).

## R7. Vendoring the engine until it is published

**Decision**: The CypherLite repository is a git submodule at `vendor/cypherlite`, pinned to a commit.
`scripts/build-wasm.sh` builds the browser package from it into `vendor/cypherlite-wasm/pkg` (gitignored),
following SPIKE-001's recipe: the release build needs `wasm-bindgen-cli` at the version the checkout's
lockfile pins (0.2.128 in SPIKE-001), binaryen (`wasm-opt`) and the `wasm32-unknown-unknown` target for the
checkout's pinned Rust toolchain, and took about 37 s. The workspace resolves `@neo4j-labs/cypherlite-wasm`
to that directory through a pnpm override; the core lists the package as a peer dependency only.
Switching to the published package later removes the override.

**Rationale**: reproducible and pinned, and the override keeps the core free of `vendor/`.
**Risks**: the submodule's remote is `git@github.com:neo4j-labs/cypherlite.git`, which is not public, so a
clone without access cannot initialise it; continuous integration needs credentials or a cached build
artifact; a Rust toolchain is required to build. **Alternatives**: committing the built 6 MB package (binary
churn in history); a local tarball outside git (not reproducible).

## R8. Events, timings and the visitor-statement API

**Decision**: The client has a typed `on(event, listener)` that returns an unsubscribe function. Events:
`status`, `replaced` (reason, generation) and `timing` (phase, milliseconds, whether restored). Timings are
taken in the worker with `performance.now()` (init, open, load or restore, total) and posted with the
ready message, and the client does no work for events with no listener (FR-036). Statements from a visitor
use `run()`, which returns the result promise and a `stop()`; with no timeout given, `run()` applies a
default of 10 s (a configurable `visitorTimeoutMs`). `query()` is the same call for fixed statements with
no default timeout.

**Rationale**: one path to the worker for both, with the stop control on the visitor path.
**Alternatives**: AbortSignal for stopping (usable later as a thin wrapper over `stop()`); a global event
bus (breaks several independent clients, FR-035).

## R9. Several clients and the persistent profile's single client

**Decision**: `createClient(options)` is a factory; each client owns its worker. The `persistent` profile
helper returns one client for the visit, held in module state, with `getClient(siteConfig)` creating it on
first call; the `per-page` profile helper creates a new client per page and wires `pagehide` departure.
Nothing is a global singleton, so a page can create several (FR-035).

**Alternatives**: a global singleton (blocks several clients on one page).

## R10. What stays outside the plan

How a document reaches the page, adapters, result reshaping, server and build-time hosting, and the
default target of the issue link (the plan sets it to the repository of this project, configurable; see
the contracts).
