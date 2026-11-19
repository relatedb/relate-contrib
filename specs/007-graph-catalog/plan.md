# Implementation Plan: The Graph Catalog in the Core Package

**Branch**: `spec/007-graph-catalog` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-graph-catalog/spec.md`

## Summary

Replace the two per-graph records of the core (`@relate/contrib-web`), the `_RelateApplication` marker node of application graphs and the stored-copy file of content caches, with one catalog file, `relate-web/catalog.json`, read and written under the Web Lock `relate-web:catalog` (ADR-010). Every lifecycle operation writes its intent before data changes and its outcome after. Add `store-lost` as a failure, add three page-callable operations (list, remove, reset the catalog), and amend ADR-009 and ADR-003.

The technical shape, from [research.md](research.md): the catalog sits behind a small storage seam (an OPFS-and-Web-Locks implementation for the browser, an in-memory one for Node tests) so the lifecycle logic keeps its Node-with-the-real-engine unit tests. The lifecycle functions, synchronous today, become asynchronous where they touch the catalog; the engine calls inside them stay synchronous. The cache open path in `worker.ts` moves from `stored-copy.ts` to the same catalog. The adapters are untouched.

## Technical Context

**Language/Version**: TypeScript (ESM), as `packages/web` today; Node 24 for unit tests.

**Primary Dependencies**: none new. `@relate/relate-wasm` (peer, vendored build), the browser's origin-private file storage, Web Locks and the file-handle APIs (`createWritable`, `createSyncAccessHandle`, `removeEntry`).

**Storage**: `relate-web/catalog.json` in the origin-private root, beside the engine's `relate/<store>/` directories. No other storage; the `relate-web/<id>.json` stored copies are removed.

**Testing**: Vitest in Node against the real engine for the lifecycle (catalog storage in memory); Playwright in Chromium, Firefox and WebKit for the catalog file, locks, tabs, interrupted operations and listing. A new trace check (`// covers-cat:` tags) like the application one.

**Target Platform**: desktop Chromium, Firefox, WebKit (WebKit in a persistent profile), as the core's tests.

**Project Type**: library (the core package `packages/web`).

**Performance Goals**: no regression of the recorded load-time baselines: a ready application store and a restored cache open with one shared-lock read of one small file and no scan of the data (SC-008); emptiness read from the node count and the index list, which stay cheap at 100,000 nodes (research R3).

**Constraints**: a catalog read or write holds the lock only for the file access, never for a data operation; the page's first render never depends on the catalog (constitution III); no engine change (constitution VI).

**Scale/Scope**: tens of graphs per origin; the catalog is a few KB. Listing sizes costs a file read per slot file (65 per store), opt-in.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Decisions Before Code | ADR-010 is accepted (parent RFC-007 accepted, evidence SPIKE-009 to 011). The amendments to ADR-009 and ADR-003 are tasks of this feature (FR-025). | Pass |
| II. Core First, Thin Adapters | All change is in `packages/web`. The adapters import the core only through exported entry points; `test:drift` and each adapter's tests are the check (FR-024). | Pass |
| III. The Page Works Without the Graph | The catalog is read in the worker; a failure (`store-unreadable`, `store-lost`) surfaces as client status, never as a blocked render. The page-callable operations are separate calls. | Pass |
| IV. Faults Are Contained | An unparseable or newer catalog fails an application open with a named reason and leaves stores untouched; caches rebuild. A terminated worker or closed tab releases the lock within milliseconds (SPIKE-009). | Pass |
| V. Specified Behavior Is Tested and Measured | FR-023 lists the browser tests; FR-027 adds `covers-cat:` tags and a trace check; the restore baselines are re-checked (SC-008). Figures stay single-run and labelled. | Pass |
| VI. The Engine Stays Upstream | Removal uses only the directory name `relate/<store>`; no engine patch. A store-delete and a listing call are raised separately (spec Assumptions). | Pass, with the layout dependency named |

No violations; the Complexity Tracking table is empty.

*Re-check after design*: the seam (research R1) and the page-callable operations (R8) add modules, not dependencies, and keep the engine calls where they are. Still a pass.

## Project Structure

### Documentation (this feature)

```text
specs/007-graph-catalog/
├── plan.md              # This file
├── research.md          # Phase 0: decisions and the open items to confirm
├── data-model.md        # Phase 1: catalog, entry, states and transitions
├── quickstart.md        # Phase 1: how to run each check
├── contracts/
│   ├── catalog-file.schema.json   # the file's shape
│   ├── catalog-api.md             # list, remove, reset (names provisional)
│   └── worker-protocol.md         # changes to the worker protocol and failure reasons
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (`packages/web`)

```text
src/
├── catalog/                       # new: shared by the worker and the page
│   ├── types.ts                   #   Entry, State, Catalog file shape
│   ├── file.ts                    #   parse and validate the file; CatalogStorage seam
│   ├── opfs-storage.ts            #   OPFS file + Web Locks implementation
│   ├── memory-storage.ts          #   in-memory implementation (tests)
│   ├── catalog.ts                 #   read, update (read-modify-write under the lock), entry helpers
│   ├── directory.ts               #   list the relate/ directory, sizes, remove a store directory
│   └── api.ts                     #   list, remove, reset (page-callable)
├── worker/
│   ├── application/
│   │   ├── marker.ts              #   deleted
│   │   ├── classify.ts            #   classify an entry plus emptiness facts (ADR-010 2.3)
│   │   ├── lifecycle.ts           #   async: intent-first writes around the sync engine steps
│   │   ├── migrate.ts             #   async: migrating/ready writes per version; no marker guard
│   │   ├── transfer.ts            #   import: importing first; export: no marker skip
│   │   ├── init.ts                #   open path reads the entry; seeded; store-lost
│   │   └── open-store.ts          #   storageAvailable also requires Web Locks
│   ├── stored-copy.ts             #   reduced to removing a leftover relate-web/<id>.json
│   └── worker.ts                  #   cache open path uses the catalog
├── application/ranges.ts          #   drops the marker-label check
├── config.ts                      #   MARKER_* removed; catalog path and lock name added
└── index.ts                       #   exports the catalog operations

tests/
├── catalog/unit/                  # Node, real engine, in-memory catalog storage
├── catalog/browser/               # Chromium, Firefox, WebKit
├── catalog/trace/check-trace-catalog.ts
└── application/, browser/         # marker and stored-copy assertions replaced

README.md                          # catalog section
```

**Structure Decision**: one new directory, `src/catalog/`, holding everything about the file, its lock and the directory listing, used by both the worker (lifecycle writes) and the page (list, remove, reset). The lifecycle stays where it is and gains a catalog parameter; the marker module is deleted.

## Complexity Tracking

No constitution violations to justify.
