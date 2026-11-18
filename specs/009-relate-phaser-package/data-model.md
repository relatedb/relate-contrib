# Data Model: the relate-phaser package

The package stores nothing; these are the in-memory entities a game holds.

## Queue (`Bridge`)

| Field | Meaning |
|---|---|
| outbox | statements waiting, in the order enqueued |
| pending | count of statements queued or in flight; 0 when settled |
| listeners | `onSettle` callbacks, called once each time the queue becomes empty |

Rules: one statement runs at a time, in order; a rejection of one does not stop the next; the queue never retries. A rejection is a `GraphError` (client fault) or a `StatementError` (engine refusal).

## Cache (`ReplyCache<S>`)

| Field | Meaning |
|---|---|
| state | the game's state `S`; read by the frame loop |
| version | integer, increased by every commit and every rollback |
| pending | the key of the one action awaiting its reply, or null |
| status | `loading`, `ready`, `recovering` or `failed`, following the client |
| loadedGeneration | the client generation the state was last loaded from |

Transitions: `commit` bumps `version`; `act` sets `pending`, optionally applies the optimistic change (a commit), runs, and on success commits patches and clears `pending`, on rejection runs the undo function (a commit), clears `pending` and returns the error; `reload` commits one patch from the game's reads, or nothing if a read is rejected; a new client generation above `loadedGeneration` triggers `reload`; status `failed` makes `act` reject at once.

## Action

A key (identifies the target), an optional optimistic function that returns its own undo, and a run function that uses the queue and `commit`. Result: ok, or the error.

## Throwaway client

A `Client` over an in-memory graph from a seed document; options exclude `application` and `store`.

## Version watcher

A function holding the last version it reported; it returns true once for each change since the last call.
