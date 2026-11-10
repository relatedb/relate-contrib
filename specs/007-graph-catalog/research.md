# Research: The Graph Catalog

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-10

Decisions the plan rests on, with what was considered. Where a decision needs a browser fact the spikes did not settle, it is marked **Confirm** and has a task that checks it first.

## R1: A storage seam keeps the lifecycle testable in Node

**Decision**: the catalog is read and written through a `CatalogStorage` seam with `read()`, `replace(text)`, `remove()` and `withLock(mode, fn)`. `OpfsCatalogStorage` implements it with the origin-private file and `navigator.locks`; `MemoryCatalogStorage` implements it with a string and a promise-chain mutex. The lifecycle takes a `Catalog` built on a storage.

**Rationale**: the application lifecycle's 96 unit tests run in Node against the real engine (`Engine.fromDb`), which is how the marker rows were checked cheaply. The catalog is asynchronous and browser-only; without a seam those tests would move wholly into Playwright. With it, every row of the classification is tested in Node, and the browser tests cover what only a browser has: the file, the lock, several tabs, termination.

**Alternatives**: test the lifecycle only in browsers (rejected: slow, and the matrix is large); mock `navigator.locks` and OPFS in Node (rejected: re-implements the browser behaviour the spikes measured).

## R2: The lifecycle becomes async around synchronous engine steps

**Decision**: `openApplication`, `firstRun`, `migrate` and `importApplication` become `async`. Engine calls (`run`, `loadGraph`, `engine.reset()`) stay synchronous; the catalog calls between them are awaited. `init.ts` already awaits.

**Rationale**: intent must be durable before the data step starts, so the write has to complete first. Nothing else about the engine calls changes.

## R3: Emptiness is read from the node count and the index list

**Decision**: the classifier's inputs are the entry and two facts, `hasNodes` and `hasIndexes`, read with `MATCH (n) RETURN count(n) AS c` and `SHOW INDEXES`. They are read only when the classification depends on them: no entry; or an entry `ready` with `seeded: true` (to detect `store-lost`).

**Rationale**: ADR-010 names "node and index count". The marker made a ready store never empty, so the old path read nothing; the new path adds two cheap reads on every open of a `seeded: true` application.

**Measured (T011, resolved)**: on a restored store, the median of 7 runs in Chromium, Firefox and WebKit was 0.1 ms or less for the count and for `SHOW INDEXES` at both 1,000 and 100,000 nodes, so neither scales with the store. A first-row probe (`MATCH (n) RETURN elementId(n) LIMIT 1`), this plan's first idea, scaled: about 1 ms at 1,000 nodes and 80 ms at 100,000 in all three browsers. The classifier therefore counts. Figures are single runs on one machine in `packages/web/reports/catalog-probe.json`. No amendment to ADR-010 is needed.

## R4: One catalog file, replaced by swap, with a lock around every access

**Decision**: path `relate-web/catalog.json` (the directory the stored copies used, renamed in config as `CATALOG_DIR`). Read: `getFile().text()` inside a shared `relate-web:catalog` lock. Write: inside the exclusive lock, read the current text, apply one change, replace through `createWritable()` (swap on close), falling back to `createSyncAccessHandle()` where the stream is absent.

**Rationale**: SPIKE-009: with the lock, all methods were safe for readers and writers in three browsers; swap is the simplest and leaves no temporary file. Timestamps: `updatedAt` is an ISO string from an injectable clock, so tests can fix it.

**Alternatives**: `move` of a temporary file (rejected: leaves a temporary file after termination and WebKit takes a different argument form).

## R5: Web Locks are required

**Decision**: `storageAvailable()` returns true only when both `navigator.storage.getDirectory` and `navigator.locks` exist; otherwise the `onUnavailable` rule applies for applications and caches fall back to memory as today.

**Rationale**: all three target browsers have both (SPIKE-009 E1); a browser with the file storage and no locks would write the catalog unordered.

## R6: Reading and validating the file

**Decision**: a read returns `missing` (no file), `unreadable` (does not parse as an object, lacks `format` or `graphs`, or `graphs` is not an object), `newer` (`format` above 1) or the parsed catalog. An entry is validated when it is used: unknown `state`, a non-string `kind`, an application entry without a positive-integer `version` or boolean `seeded`, or a cache entry without a string `revision`, makes that graph's open fail `store-unreadable` (application) or rebuild (cache). Other entries are left as they are when the file is rewritten.

**Rationale**: one bad entry must not block the others; an unreadable file blocks all applications (FR-012) and is recovered by reset.

## R7: Write ownership and which context writes

**Decision**: the worker performs lifecycle writes through `Catalog.update(storeName, change)`. The page-callable operations (`list`, `remove`, `reset`) run in the page's main thread through the same `Catalog` over `OpfsCatalogStorage`; the file APIs they need are available there in all three browsers (SPIKE-009 E1).

**Rationale**: removal runs in a tab that does not hold the store, so it cannot be a worker lifecycle step; putting the calls in the page avoids spawning an engine worker for a directory operation.

## R8: Page-callable operations

**Decision**: three functions exported from the package entry, working names `listGraphs(options?)`, `removeGraph(storeName, options)` and `resetCatalog()`. `listGraphs` reads the catalog under the shared lock and lists `relate/`; sizes are summed from each store's slot files only when `{ sizes: true }`. `removeGraph` requires `{ kind: "application" | "cache" }` to match the entry's kind (or, for an `unregistered` directory, either) and returns what was removed. See [contracts/catalog-api.md](contracts/catalog-api.md).

**Alternatives**: methods on the client (rejected: the catalog is per origin, not per client, and works with no client); a catalog change event (rejected: out of scope, listing again suffices).

## R9: Removal while a store is held

**Decision**: `removeGraph` writes `removing`, calls `removeEntry(storeName, { recursive: true })` on `relate/`, then deletes the entry. When `removeEntry` throws because the files are held, it restores the entry under the exclusive lock only if the entry still says `removing` with its own `updatedAt`, and rejects with `locked`.

**Resolved (T012)**: `removeEntry` fails with `NoModificationAllowedError` in Chromium, Firefox and WebKit while another tab holds the store, the holder keeps working, and the same call succeeds once nobody holds it (`packages/web/reports/catalog-remove.json`). The design stands; the extra step below is not needed.

**Was to confirm**: that `removeEntry` fails (rather than succeeding or hanging) while another tab holds the store, in all three browsers, and what error name it gives. SPIKE-008's harness retried removal for a held store, which suggests it fails, but the failure was not recorded per browser. If a browser removes held files, `removeGraph` instead takes the store first (opens it, then frees it before removal) and the plan records the extra step.

## R10: Opening a store with `removing`, and unregistered directories

**Decision**: the worker, holding the store, finishes the removal by `engine.reset()` (which leaves an empty store, not a missing directory) and deleting the entry before a first run. It does not remove the directory while holding it, since held files cannot be removed.

**Rationale**: the contract is "finish the removal, then first run"; a reset gives the same observable result.

## R11: The cache path

**Decision**: `worker.ts` replaces `canRestore` and the stored-copy calls with `Catalog` calls as in ADR-010 2.4. `stored-copy.ts` keeps one function, removing a leftover `relate-web/<id>.json`, called when a cache is opened. A cache open reads the entry under the shared lock; a rebuild writes `loading`, then `ready` with the revision last. A catalog that cannot be read is treated as no entry, and its write attempts are skipped for that open (the rebuild still happens), because writing into an unreadable file would hide it.

## R12: Removing the marker

**Decision**: delete `marker.ts`; remove `MARKER_LABEL` and `MARKER_FORMAT` from `config.ts`; `migrate.ts` loses its snapshot guard (a step can no longer damage the core's record); `transfer.ts` stops excluding the label from export pages; `rejectMarkerLabel` and the label check in `inRanges` go. A store holding a node labelled `_RelateApplication` and no entry fails `store-unmarked` with a message that names the node: the classifier reports the label only in the message, by checking for it when the store has data and no entry.

**Rationale**: ADR-010 2.1 and 2.7. The README's migration rule about excluding the marker is deleted.

## R13: Tests and trace

**Decision**: new suites under `tests/catalog/` with scripts `test:catalog` (Node), `test:catalog-browsers`, `test:catalog-trace` (tags `// covers-cat:`), added to `test:units`, `test:browsers-all`, `test:traces-all` and so to `test:drift` and `test:all`. Existing application and cache tests that build a store state with a marker node or a stored-copy file are rewritten to write a catalog entry; the helper that does this is shared (`tests/catalog/helpers.ts`, browser fixture for writing an entry from a page).

## R14: Documentation

**Decision**: dated amendments to ADR-009 (§6, following the existing entries) and ADR-003 (a new amendments section if it has none), a note on `specs/006-application-graphs/spec.md` that FR-006 to FR-009 and FR-027 are superseded where they name the marker or the cache's stored copy, and a README section.

## Open items to confirm during implementation

- R3 and R9 were measured by T011 and T012 and are resolved above.
- The engine's `relate/<store>` layout is relied on only by name (listing and removal). It is an engine detail and stays on the list of upstream requests.
