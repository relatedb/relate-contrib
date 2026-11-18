# Research: the relate-phaser package

Findings from reading the demo (`demos/phaser-path-explorer/src/game`) and the core (`packages/web/src/client`) against ADR-012. Each item states what was found, the decision, and what was rejected.

## R1. The demo's `act` takes a closure, not a statement

**Found**: `GameState.act(target, run, opts)` sets `pending = target`, clears the message, takes a snapshot, bumps the version, awaits `run()` (which enqueues statements and applies patches), keeps the snapshot as the undo point when `run` set `applied`, catches errors into `message`, then clears `pending` and bumps the version. It never throws. The state is changed after replies, except walking along an existing path, which applies at once.

**Decision**: `ReplyCache.act(key, { optimistic?, run })`. `optimistic(state)` applies a change at once and returns a function that undoes it; `run(commit)` performs the game's statements through the queue and commits patches. On a rejection the undo function runs, and `act` resolves to `{ ok: false, error }`; on success `{ ok: true }`. It never throws into the frame loop. The demo's own message text, `applied` flag and undo snapshot stay in `GameState` and wrap `act`.

**Rejected**: an `act` that takes a statement and a patch function only. The demo's actions run several statements and branch on replies, so a single-statement form would make every action a special case.

This is the wording of ADR-012 2.3 in code (apply an optimistic change, queue statements, commit the reply, roll back on rejection); no amendment is needed, and the contract records the shape.

## R2. How the tests reach the real engine

**Found**: the demo's `tests/helpers/engine.ts` initialises the engine's WebAssembly build in Node and exposes a query function that returns the result envelope; the react-admin package's helper does the same. No worker is involved.

**Decision**: the package's helpers hold the same in-process engine (its own copy of a few lines, as react-admin has), and the demo keeps its own for the demo's tests. The queue and cache are tested against it. The core's worker replacement is the core's to test.

## R3. Generation and status paths cannot be forced in Node

**Found**: replacing a worker needs a worker. The core's `Client` exposes `status`, `generation`, `on("status", …)` and `onGeneration(listener)`.

**Decision**: the cache depends on a narrow interface (`status`, `generation`, `query`, `on`, `onGeneration`), and the unit tests use a fake client with an emitter to drive generations, statuses and `lost` rejections. One Playwright run (R7) covers the real client.

## R4. When the core runs generation listeners

**Found**: `Registry.ready(generation, …)` awaits each listener in order, and it runs for the first ready instance too. The client has already marked itself `ready` when listeners run, so a query made inside a listener is answered. A throwing listener is swallowed.

**Decision**: the cache registers one listener and starts with an explicit first load; it records the generation it loaded and ignores an event whose generation it has already loaded, so the first ready does not reload twice. The listener catches its own errors (FR-010), because the core discards them.

## R5. Start-up and reload shape

**Found**: the demo's `state.load()` runs several reads with `Promise.all` and merges.

**Decision**: the cache takes a `load(bridge)` function that returns a patch; `reload` queues the game's reads through the queue and commits the patch in one `commit`, so a frame never sees half a board. A rejected load commits nothing.

## R6. The scene orders other work around its redraw

**Found**: `MapScene.update()` plays the night, syncs the robots, starts the finale and then redraws when `drawn !== state.version`. A helper that redraws from Phaser's `update` event would run before the scene's own `update()`.

**Decision**: the package exports `versionWatch(cache)`, a function that returns true once per change, with no Phaser dependency, and `watchCache(scene, cache, redraw)` built on it for scenes with nothing to order. The demo keeps its explicit order and uses `versionWatch`. ADR-012 2.4's helper stands; `versionWatch` is the same check without the event wiring.

**Rejected**: changing the demo's frame order to suit the helper. It risks the finale and the night animation for no gain.

## R7. Where the real-client recovery test lives

**Found**: the demo has no browser tests; the react-admin demo has Playwright over a built preview.

**Decision**: add `tests/browser` and a Playwright config to the path explorer demo, as react-admin's demo has. It traps the engine with a statement of about a thousand nested parentheses (the fault ADR-001 recorded), waits for recovery and checks the board is rebuilt and no action ran twice.

## R8. The throwaway client's options

**Found**: `ClientOptions` takes exactly one of `graph` and `application`, a required `navigation`, and `store`, which defaults to true for `multi-page`.

**Decision**: `createThrowawayClient(options, document)` takes `Omit<ClientOptions, "graph" | "application" | "store">`, so the type refuses an `application`; JavaScript callers get a runtime `TypeError` if an `application` key is present. It passes `graph: { document }` and `store: false`.

## R9. Rejection types

**Found**: `GraphError` carries a `reason` and is for client faults; engine errors arrive in the result envelope's `error`.

**Decision**: the queue rethrows a `GraphError` as is and turns an envelope `error` into `StatementError` (extends `Error`, same message). Demo code that catches generically keeps working. `idle()` is implemented over settle notification, not by polling.

## R10. Package layout and checks

**Decision**: `packages/phaser`, name `@relate/relate-phaser`, version `0.1.0`, `private: true` until the first release, as the sibling packages are. Scripts `test:phaser`, `test:phaser-package`, `test:phaser-trace` and, for the demo's browser run, `test:phaser-browsers`; each is added to the aggregate scripts and to the commands list in `CLAUDE.md`. Tags are `covers-ph:`.
