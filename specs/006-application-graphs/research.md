# Research: Application Graphs in the Core

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-09

This file records the checks made while planning (P-1 to P-4), the decisions that follow (D-1 to D-9) and the risks to watch (R-1 to R-4). The checks are single runs on Node 24.14.1, macOS arm64, with `@relate/relate-wasm` 0.16.1 initialised from its `.wasm` bytes and used in memory; the scripts were run from the session scratchpad and their statements are reproduced below. ADR-009 §4 listed items for implementation; P-1 answers the first early because the answer could change the design.

## Checks

### P-1. `columnTypes` cannot detect a mixed-type property; per-value reads can

Three nodes of one label held `m` as an integer (`1`), a string (`"text"`) and a float (`3.5`). `MATCH (n:T) RETURN … n.m AS m` returned `columnTypes` of `INTEGER` for the column and the three values in the rows: the type describes the column from one row, not each value. ADR-009 §2.5 planned to use it. Reading each value instead works:

```cypher
MATCH (n:T) UNWIND keys(n) AS k
RETURN n.id AS id, k, valueType(n[k]) AS t, toString(n[k]) AS s
```

returned, for one node with every kind: `INTEGER NOT NULL` for `9007199254740993`, with `s` exactly `"9007199254740993"` (the same value in the JSON row was `9007199254740992`, so a number read loses it and a text read does not); `FLOAT NOT NULL` with `s` `"2.0"` for the whole-number float `2.0` (the JSON row shows `2`); `DATE NOT NULL`, `ZONED DATETIME NOT NULL` and `DURATION NOT NULL` for the temporal values; `POINT NOT NULL`; `LIST<NOTHING> NOT NULL` for `[]` against `LIST<INTEGER NOT NULL> NOT NULL` for `[1, 2]`; and `INTEGER NOT NULL` for a numeric `id` where a string is required. `n[k]` (dynamic property access) and `keys(n)` both worked, and `valueType` and `toString` were per value, so a column of mixed types is read correctly. Decision D-4 follows; ADR-009 is amended (§6).

Not checked: a non-empty list whose elements are themselves a loss (a list of whole-number floats), and `toString` on a very long string. Both go to implementation (R-3).

### P-2. The engine runs in Node in memory

`init({ module_or_path: <bytes> })` followed by `new RelateDb()` ran every statement in P-1 and P-3 in Node. Unit tests of the lifecycle modules can therefore use the real engine in memory, with only the store-specific behaviour (locks, `opfs://`) left to the browser tests. The core's `Engine` wrapper calls `init` with a URL; an `Engine.fromDb` seam (D-9) lets tests hand it a database initialised from bytes.

### P-3. Statements the export, the range helper and the marker rely on

`SKIP $s LIMIT $l` with bound parameters returned the right window. `ORDER BY elementId(n)` sorts the ids as text (`p19, p20, p3`), which is stable but not numeric; it is a valid paging key, though `SKIP` over a large store costs more with each page, which the export measures at implementation (the spec already labels the export's size limit unmeasured). `properties(n)`, `labels(n)`, `elementId(n)` and `properties(r)`, `type(r)` for relationships returned what the ADR-002 document needs. `WHERE n.n >= $lo AND n.n < $hi` returned `count`, `min` and `max` over the window, which is what the range helper needs to find its bounds and to finish. `MATCH (n) WHERE NOT n:_X RETURN count(n)` accepted a label that no node carries. `CREATE INDEX IF NOT EXISTS FOR (n:P) ON (n.n)` followed by `SHOW INDEXES` listed the index `ONLINE`.

### P-4. What the engine offers for closing a store

`RelateDb` exposes `free()` and no `close()`; the core's `Engine` wrapper exposes neither. SPIKE-008 measured that an idle holder's termination frees the store in 19 to 121 ms, so the departing page terminates its idle worker on `pagehide` and does not rely on a message reaching the worker in time (D-7). Whether `free()` before termination changes the release time is not measured and is not needed.

## Decisions

- **D-1. Lifecycle in the worker.** The marker, the migrations, export and import run where the engine is. The page validates options, forwards the seed (fetching a descriptor's data as today), and shows a `storage` property updated by worker messages. One implementation of each state, tested in Node against the real engine and again in the browsers.
- **D-2. Options cross `postMessage` as plain data.** `migrations` is `{ [version]: Array<string | RangeStep> }`. `inRanges({ label, property, step, statement })` returns a plain object `{ kind: "ranges", … }`, so a migration written with the helper is cloneable. The statement is the author's text with the parameters `$from` and `$to` and its own filter that makes a rerun harmless; the helper reads `min` and `max` of the property over the label (never the marker's), walks `[from, to)` windows of `step`, and finishes when a window passes the maximum. Creation throws when the statement lacks `$from` or `$to`, or when `label` is the marker's. This settles what ADR-009 §2.3 left for implementation (placeholder syntax, inclusive lower bound and exclusive upper bound, numeric property only).
- **D-3. Lifecycle failures give up at once.** `store-unmarked`, `store-newer`, `import-interrupted`, `store-unreadable`, `unavailable` (with `onUnavailable: "fail"`) and a failed migration are answers a retry cannot change, so they skip the core's three-attempt rule (the way `unsupported` already does). `retry()` still starts again. A failed client's `diagnostic.reason` carries the name and `failureMessage()` words it. `waiting` is not a failure and counts nothing.
- **D-4. Losses by per-value reads.** Export reads `keys(n)`, `valueType(n[k])` and `toString(n[k])` per node (P-1), batched with `SKIP`/`LIMIT` (P-3), instead of `columnTypes`. ADR-009 §2.5 is amended.
- **D-5. Waiting is the worker's loop.** After the bounded retry, with `whenLocked: "wait"`, the worker sleeps one second and tries again, sending a `storage` message (`waiting`, `locked`) once and a `ready` message at the end; the client stays `loading` and its waiters keep waiting. Terminating the worker (destroy, pagehide) ends the loop. No failure is counted.
- **D-6. `resetApplication()` starts a fresh worker.** From `failed` or `ready` it ends the current worker and starts one with `intent: "reset"`, which opens the store, resets it and seeds it. One path for both states, so one path to test; the new worker waits as any opener does if the old one still holds the store.
- **D-7. The departing page ends its worker on `pagehide`.** An idle worker frees the store in 19 to 121 ms (P-4). A page restored from the back-forward cache (`pageshow` with `persisted`) starts the client again through the ordinary start, as a replaced worker does.
- **D-8. A separate trace check.** `tests/application/trace/check-trace-application.ts` reads this specification and tags `// covers-app: FR-001`. The existing check reads specification 001 and its tags, and the same ids would collide.
- **D-9. An engine seam for tests.** `Engine.fromDb(db)` (not exported from the package) wraps an already-initialised database, so the lifecycle modules take an `Engine` in tests without a URL.

## Risks

- **R-1. Telling "unavailable" from "unreadable".** `openStore` today returns null for any error that is not a lock. Application mode needs the two apart: feature-detect `navigator.storage.getDirectory` first (absent or throwing is `unavailable`), and treat any other open error as `store-unreadable`. The error text the three browsers give for a context with no store, and for a damaged one, is not known; the browser tests record it, and ADR-009 is amended if the split needs another rule. Playwright's default WebKit profile is the context the spec names for "no store".
- **R-2. Large imports and exports.** The envelope is held whole in memory and passes through `postMessage` once. The size at which that fails is unmeasured; the spec labels it so.
- **R-3. Loss detection beyond the listed kinds.** A non-empty list whose elements are losses (a whole-number float inside a list), nested values and very long strings are not covered by P-1. Implementation tests them; a gap is added to the loss kinds by amending ADR-009, not decided in code.
- **R-4. A held store after a busy terminated worker.** About 3 s in Chromium (SPIKE-008). The bounded retry (5 s) absorbs it and the waiting loop continues past it; the implementation measures the figure in application mode (US7, scenario 3).
