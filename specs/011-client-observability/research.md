# Research: A Page Can Observe a Core Client

Each entry: what was found in the code, the decision, the alternative.

## R1. Where statements are observed

**Finding**: a page's statements already come back as an envelope the client parses (`client.ts` `onMessage`, case `result`). The envelope carries `stats`, `error` and `elapsed_ms`. Statements the page does not send (the loader's node and link batches and index creation, the migration steps, the import, scoped add and drop) run inside the worker and never reach the page.

**Decision**: report page-sent statements from the page, at the `result` (and error) message, with origin `query`, `run` or `subscription` threaded through `execute`. Report worker-run statements from the worker: an optional tap on the engine wrapper records `{ statement, ms, error, stats, write }` for each `execute` made during an internal job, and the worker sends them in one `statements` message just before the job's terminal message (`ready`, `done`, or `error`). The page's own queries are answered by `query()` with the tap off, so nothing is reported twice.

**Alternative rejected**: a tap on every execute, page queries included, reported by the worker: it would add a message per page statement and lose the page's origin.

## R2. The engine version

**Finding**: the engine's WebAssembly class has `execute`, `executeScript`, `reset`, `free` and `open`; none reports a version. `CALL dbms.components() YIELD name, versions` returns a row `{ name: "Relate", versions: ["1.4.0"] }` on 1.4.0 (probed in Node).

**Decision**: the worker runs that procedure once on the instance it uses, outside the tap, so it is neither an event nor a write, and reports the version on `ready` (`engine`). If the procedure or row is missing, `engine` is null, and `info.engine` says so. The canary file pins the procedure and the row.

**Alternative rejected**: reading the package's `package.json` in the worker: bundler-dependent (JSON import, `?raw`) and reports the installed package, not the loaded binary.

## R3. Telling the worker whether anyone listens

**Finding**: the revision needs the number of internal writes, always; the statement events need full records, only for a listener (FR-005).

**Decision**: the worker always counts internal writes (a number). It records statement details only when observing, set by `observe` in the init message and changed by an `observe` message when the client's `statement` listener count crosses zero. Writes of an internal job arrive on the `statements` message even with no listener; records arrive only with one.

**Alternative rejected**: always recording: small, but not zero, and FR-005 says a page that does not listen pays nothing.

## R4. When the revision moves for internal writes

**Decision**: the revision restarts at 0 when a worker becomes ready. Writes made by init (load, seed, migrate) set it to their count at ready; one `revision` event follows ready if that count is above zero. Later internal jobs (import, scoped add or drop) add their writes and deliver one revision event for the job. Page-sent statements move it one at a time. Writes of a statement that failed with an error are counted only if the counters say so (FR-003).

## R5. The kind and name

**Decision**: `application` for an application client, name `app-<name>`; `cache` for a graph with a descriptor that uses the store, name `rel-<descriptor id>` (the store names the catalog already records); `memory` otherwise, name null. Kind follows the options, not whether the store opened.

## R6. Parameters

**Decision**: with `{ params: true }`, a listener gets the statement's parameters as the JSON text the client already built for the worker (`encodeParams`), cut at 4096 UTF-16 units with `paramsTruncated: true`; an object that cannot be encoded gives `params: null` and `paramsError`. Without the opt-in the fields are absent. Opt-in is per listener, resolved when the payload is built: the payload is built with params if any listener asked.
