# Contract: Worker protocol changes

**Feature**: [../spec.md](../spec.md) | Extends `specs/006-application-graphs/contracts/worker-protocol.md`. Not public API.

## Messages

No message is added. The page-callable catalog operations run on the page (plan, research R7), not through the worker.

The `init` message for an application is unchanged: the worker computes `seeded` from the seed document or descriptor itself.

## From the worker

`init-failed` gains the reason `store-lost`. The reasons `store-unmarked`, `store-unreadable` and `store-newer` keep their names and gain the meanings in the data model. `import-interrupted` is unchanged.

`ready.restored` stays true when no seed was loaded and no migration ran. A `store-lost` open does not reach `ready`.

## Order guarantees

1. A worker writes the intent entry before it changes the data of the operation, and the outcome entry after the data step has completed.
2. `storage: durable` is sent before `ready`, as before; `ready` is sent after the last catalog write of the open.
3. A worker never writes after sending `init-failed`, to the data or to the catalog, with one exception: it may restore nothing and clean nothing.
4. A catalog write holds the lock for the replace only; no engine statement runs while the catalog lock is held.
5. A page's `pagehide` still terminates the worker; a lock held by a terminated worker is released by the browser.
