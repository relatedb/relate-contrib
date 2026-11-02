# Contract: Client and worker messages

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

The internal protocol between a client and its worker. Not public API; it is specified so the two halves
and the tests agree. Messages are structured-clone objects with a `type`.

## Client to worker

| `type` | Fields | Meaning |
|---|---|---|
| `init` | `engineUrl`, `descriptor` (the descriptor object, or null), `dataUrl` (resolved, or null) or `document` (inline, or null), `indexes` (used only without a descriptor), `useStore` (boolean), `attempt` | start one instance: initialise the engine, open or restore, sweep, load, report ready |
| `query` | `id`, `statement`, `paramsJson` (a JSON text) | run one statement |
| `scoped-add` | `id`, `scope`, `document` | validate a document and load it with `scope` on every created node |
| `scoped-drop` | `id`, `scope` | detach-delete the nodes of a scope |

`paramsJson` is a string, not an object, because the loader encodes number arrays itself (research R2). The
client resolves `descriptor.data.url` to an absolute URL before sending it.

## Worker to client

| `type` | Fields | Meaning |
|---|---|---|
| `ready` | `restored` (boolean), `timings` (`init`, `open`, `load` or `restore`, `total`, in ms) | the instance can answer queries |
| `init-failed` | `reason` (`trap`, `unsupported`, `worker-error`, `invalid-document`, `invalid-descriptor`, `mismatch`, `store`), `message` | the attempt did not reach ready |
| `store-retry` | `attempt`, `waitMs` | the store was locked; waiting before the next try |
| `result` | `id`, `envelopeText` | the engine's envelope as text (the client parses it, nothing is altered) |
| `error` | `id`, `reason` (`trap`), `message` | a trap; every later call on this worker answers the same (FR-008) |

## Worker rules

1. On the first trap the worker sets a flag and answers every later `query`, `scoped-add` and
   `scoped-drop` with `error` / `trap` without touching the engine (FR-008).
2. `init` with a descriptor and a store (ADR-003 2.4, research R5):
   1. validate the descriptor (FR-013); an invalid one fails the attempt (`invalid-descriptor`) and no store
      is opened;
   2. initialise the engine and open the store `gw-<id>`, retrying a locked store from 100 ms, backing off to
      500 ms, for at most 5 s, then continuing in memory with no stored copy written (FR-012);
   3. read the stored copy; if its `revision` equals the descriptor's, restore: do not fetch the data and
      create no index;
   4. remove every node with a `scope` property (the sweep, FR-027), then compare the node count with
      `data.nodes`; a difference means stale;
   5. if stale or there is no copy: remove the stored copy, reset the store if it is not empty, fetch the
      data, validate it and check its `revision` and counts against the descriptor (FR-039; a mismatch fails
      the attempt with `mismatch`), create the descriptor's indexes, load nodes then links in batches of
      1,000, and write the stored copy last;
   6. post `ready`.
3. `init` with a descriptor and no store: as above without steps 2 (open), 3, 4's count comparison and the
   stored copy; the data is always fetched.
4. `init` with a document alone: validate, create the caller's indexes, load, post `ready`; no store.
5. `scoped-add` and `scoped-drop` use the same statements and encoder as the load.
6. The worker validates every document before any statement (FR-014).
7. The client terminates the worker on `error`/`trap`, on a timeout, on `stop()`, and on a worker `error`
   event; the client, not the worker, decides replacement and counts failures. An `init-failed` counts as a
   failed attempt.
