---
id: ADR-012
title: The boundary and public interface of @relate/relate-phaser
status: proposed
rfcs: [RFC-008, RFC-005]
created: 2026-11-18
---

# ADR-012: The boundary and public interface of @relate/relate-phaser

## 1. Context

A Phaser game redraws about sixty times a second and cannot wait for anything. The engine it keeps its world in runs in a Web Worker and answers every statement asynchronously. The two meet in a small amount of machinery that every graph-backed game needs: something that sends statements to the engine one at a time, in order, without the frame loop awaiting; something the frame loop can read at any moment; and a way to behave sensibly when the engine fails.

The path explorer demo (a Phaser game whose world, rules and score live in a graph; ADR-011) contains this machinery, written against its own types:

- `Bridge` (`demos/phaser-path-explorer/src/game/bridge.ts`, about 60 lines) holds an outbox and a single pump. `enqueue(statement, params)` returns a promise of rows and rejects with the engine's error; `pending` counts statements queued or in flight; `idle()` resolves when the queue is empty. It takes a query function, not a client.
- `GameState` (`state.ts`) holds a plain-object cache of what the player may know, patched by replies, with a `version` counter bumped on every change so the frame loop can redraw only when something changed, a `pending` marker for the one action whose reply is awaited, and a one-level undo snapshot. Most of the file is game-specific: knowledge states, the thread, paths, signposts and scoring.
- A seed document (`graph.ts`, `worldDocument`) and reads that return only revealed tiles. Seeding on first run is already done by the core web package's application graph (`createClient` with an `application`; ADR-009), not by demo code.
- A throwaway graph: `createClient({ graph: { document } })` with no descriptor gives an in-memory graph that nothing persists. The demo's attract mode runs on it, beside the real game.

Two gaps would pass to every project that copies this code unchanged. First, the demo builds the bridge as `new Bridge((s, p) => client.query(s, p))` and never calls `onGeneration`. The core replaces a trapped or timed-out worker and then rejects in-flight calls with `lost`; the new instance reopens the same store and continues (ADR-009), but the demo's cache is not rebuilt, so it keeps showing the world as it stood before the replacement, which may differ from the restored graph by the action that was in flight. Second, the bridge turns every rejection into a plain `Error`, so a game cannot tell a statement the engine refused from a lost instance or one that timed out.

RFC-008 proposes extracting the reusable parts into a package in this repository, and leaves open where the cache mechanism ends and a game's own state begins (7.1), which capability ships first (7.2), whether the package ships any statements (7.3), and how engine faults reach the game (7.4). The sections below decide those.

## 2. Decision

### 2.1 Package and dependencies

A workspace package, `@relate/relate-phaser`, in `packages/phaser`, versioned below 1.0 and documented as unstable until a second consumer has used it (RFC-008, 5.4). It has two peer dependencies: `@relate/web` for the client, and `phaser` for the optional scene helper in 2.4. It does not bundle either and does not import the engine's WebAssembly package; `@relate/web` loads that.

### 2.2 The statement queue

The package exports `Bridge`, moved from the demo with these changes:

- It takes a `Client` as well as a bare query function: `Bridge.forClient(client)`. The bare form stays for tests.
- A rejection is a `GraphError` (the core's error type, whose `reason` includes `trap`, `timeout`, `lost`, `stopped` and `failed`) when the failure came from the client, and a new `StatementError` when the engine answered with an error, with the engine's message. A game tells them apart by class.
- `pending` and `idle()` keep their meaning. A new `onSettle(listener)` calls back when the queue becomes empty, for a game that wants a "thinking" indicator without polling.
- Order is the contract: statements apply in the order enqueued, one at a time. The queue never retries.

### 2.3 The cache mechanism

The package exports `ReplyCache<S>`, a generic holder, not a game state. The game defines `S` (its tiles, entities, player) and supplies the code that turns rows into patches. The package owns only what is the same in every game:

- `state: S`, read by the frame loop, and a `version` bumped by every `commit`.
- `commit(fn)` applies `fn(state)` and bumps `version`.
- `act`: applies an optimistic change to the state at once (when the game gives one), queues a statement, and on the reply commits the game's patch from the rows. While one action is awaiting a reply, `pending` holds its `key`; a further action queues behind it and its optimistic part is applied when its turn comes, not before. On a rejection the optimistic change is rolled back and the error is returned to the caller, not thrown into the frame loop.
- `reload(load)`: runs the game's read statements through the queue and commits the result in one step. The cache calls it once at start-up and again after every new client generation (2.5).

Undo, snapshots across several actions, the knowledge states and every statement stay in the game. The demo's one-level undo is built on `commit`, and stays in the demo.

### 2.4 The throwaway graph and a scene helper

`createThrowawayClient(options, document)` wraps `createClient` with a graph given as data and no descriptor, so no store is opened and nothing persists. It exists so the intent reads in game code, and so the call cannot be accidentally given an `application`. It returns an ordinary `Client`.

A scene helper, `watchCache(scene, cache, redraw)`, calls `redraw` from the scene's `update` only when `cache.version` has changed since its last call. It is the one place the package touches Phaser.

### 2.5 Faults

The package adds no fault mechanism of its own. The core already replaces a trapped, timed-out or crashed worker, re-runs subscriptions and gives up after three attempts into a `failed` status (ADR-001). The package connects the cache to it:

- The cache subscribes with `client.onGeneration`. After a replacement it calls `reload`, so the board is rebuilt from the restored graph before the next frame that reads it. An action whose statement was rejected with `lost` is rolled back and not repeated; the player acts again.
- The cache reads `client.status` at construction and keeps `cache.status` (`loading`, `ready`, `recovering`, `failed`) current from the client's `status` event, so a game can show a fault screen without importing the client. It renders nothing itself. A `reload` that is rejected leaves the previous state in place and the status as the client reports it, so a failure during recovery shows as `recovering` or `failed`, not as an empty board.
- In `failed`, `act` rejects at once with `GraphError` reason `failed` and does not queue.

### 2.6 What the package does not hold

- Statements. The package ships no statement text. A game writes its own reads and writes against its own graph model.
- Reveal-only reads and other partial reads. Reading only what is needed (undiscovered tiles, unvisited dialogue branches) is a property of the game's statements, and the package cannot check it. It is documented as a pattern, with the demo as the reference, and is not enforced by the package in this release.
- Seeding. A new world is a graph document passed to `createClient` through an application graph, as ADR-009 describes.
- Hex-map drawing, sprites, fog and clouds, the splash, scores and anything that knows a game's rules. They stay in the demo (RFC-008, 4 and 5.5).

### 2.7 First release and the demo

The first release contains the statement queue, the cache mechanism, the throwaway client and the scene helper together; each is useful alone. The demo is changed to consume the package: its `Bridge` import becomes the package's, and `GameState` becomes a `ReplyCache<GameState>` user whose game logic is unchanged. The existing demo tests (202 at the time of writing) are the first test of the extraction.

## 3. Alternatives Considered

- **Export the demo's `GameState` as the package's cache.** Rejected: most of it is the path explorer (knowledge states, signposts, parts, undo), so a second game would inherit a model that is not its own.
- **Only the queue in the first release.** Rejected: the queue alone does not give a project the pending marker, rollback or the reload after a new generation, which is where a copied demo would go wrong; and the parts are small enough that shipping them together costs little.
- **Statement helpers for reveal-only reads and undo.** Rejected for now: a helper cannot write statements without knowing the game's graph model, and a generic one would be a query builder. The discipline is easier to follow from a documented pattern and a reference demo until a second game shows what is truly shared.
- **A check that the cache holds nothing undiscovered.** Rejected for the first release: it needs a game to declare what "discovered" means, which is a statement-level decision this package does not take. It may return with a second consumer.
- **A fault mechanism in the package** (its own retry, queue replay). Rejected: the core already replaces and bounds recovery (ADR-001), and replaying queued statements after a replacement would apply writes whose intent the player has since moved past.
- **Build the cache on `client.subscribe`.** Rejected: a subscription re-runs one read and delivers rows, and the client re-runs it after every replacement; the cache instead patches from write replies and holds a pending action with rollback, which subscriptions do not carry. The cache still uses `onGeneration` for the reload.
- **Put the machinery into `@relate/web`.** Rejected: it serves one kind of consumer and would tie the core's releases to a game framework (RFC-008, 6).

## 4. Consequences

- A second Phaser project gets the queue, the cache mechanism and the reload-after-replacement from a tested package, and writes only its graph model, statements and drawing.
- The demo gains correct behaviour after an engine replacement, which it lacked. Follow-up: the demo adopts the package (2.7), which is where this fix lands.
- Changing `Bridge`'s rejection from a plain `Error` to `GraphError` and `StatementError` changes how callers can catch failures. Demo code that catches generically keeps working.
- Reveal-only reading is not enforced. A game can still leak undiscovered data into its cache. A test helper may follow with a second consumer; RFC-008 leaves this open.
- The package depends on `phaser` only for the scene helper. If that proves awkward the helper moves out and the package has no Phaser dependency.
- The first release is sized for turn-sized actions: one statement at a time, one awaited action at a time, and `reload` rereads whatever the game's read statements return. A game that changes many entities a frame, such as an entity-component system, would need batching or write coalescing, and the queue's throughput has not been measured; RFC-008 leaves this open (7.6). A dialogue tree, which reads little and waits for answers, fits the first release as it stands.
- A game with several graphs (levels, save slots, boards live at once) gets one `ReplyCache` per graph and no helper for choosing between a new graph, a named application graph, a second client or a scope. The throwaway client is the one multi-graph case the package covers; the rest is left open in RFC-008 (7.5) until a second consumer shows which is common, and how strictly the core isolates scopes needs checking first.
- The interface is below 1.0 and will change until a second consumer uses it. Moving the package to its own repository waits for that (RFC-008, 5.3).

## 5. Related

- RFCs: RFC-008, RFC-005
- ADR-001: the client's status, replacement of a failed instance and rejection reasons
- ADR-009: application graphs in the core, which seed a world on first run
- ADR-011: the path explorer, the first consumer
