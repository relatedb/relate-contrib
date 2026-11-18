# @relate/relate-phaser

Building blocks for a [Phaser](https://phaser.io) game that keeps its world in the embedded graph. Version 0.x: the interface is unstable until a second game has used it (ADR-012).

## The problem

A Phaser game redraws about sixty times a second and cannot wait for anything. The engine that holds its world runs in a Web Worker and answers every statement asynchronously. This package joins the two with four small pieces, so a game does not rewrite the ordering and error behaviour of the part where mistakes are subtle:

- **`Bridge`**: a queue that sends statements to the engine one at a time, in order, without the frame loop awaiting. Each caller gets a promise of rows. A statement the engine refuses rejects with `StatementError`; a failure of the client (a trap, a timeout, an instance replaced) rejects with the client's own `GraphError`. `pending`, `idle()` and `onSettle()` say when it is busy.
- **`ReplyCache<S>`**: the store the frame loop reads. You define the shape of the state `S` and the patches; the cache holds a `version` that every change bumps, the key of the one action awaiting its reply (`pending`), and a `status` that follows the client. `act` applies an optimistic change at once, runs your statements and commits their replies, and rolls the change back if one is rejected. It never throws into the frame loop. After the client replaces a failed instance, the cache reloads, so the board is rebuilt from the restored graph.
- **`createThrowawayClient`**: a client over an in-memory graph given as data, for an attract mode, a tutorial or a sandbox beside a saved game. Nothing is kept, and it refuses an `application`.
- **`versionWatch` and `watchCache`**: redraw a scene only when the cache has changed.

## Example

```js
import { Bridge, ReplyCache } from "@relate/relate-phaser";

// `client` comes from createClient(...) in @relate/web
const cache = new ReplyCache({
  client,
  initial: { cells: {} },
  load: async (bridge) => {
    const rows = await bridge.enqueue("MATCH (c:Cell) RETURN c.id AS id");
    return (state) => {
      state.cells = Object.fromEntries(rows.map((r) => [r.id, true]));
    };
  },
});
await cache.start();

const result = await cache.act("add", {
  optimistic: (state) => {
    state.cells.z = true;
    return () => delete state.cells.z;
  },
  run: async (commit, bridge) => {
    await bridge.enqueue("CREATE (:Cell {id: 'z'})");
  },
});
// result is { ok: true }, or { ok: false, error } after the optimistic change was rolled back
```

In a scene, read `cache.state` in `update` and redraw when `cache.version` changed (`versionWatch(cache)`, or `watchCache(scene, cache, redraw)` for a scene with nothing to order around the redraw).

## What stays in your game

- **Statements.** The package ships none. You write your reads and writes against your own graph model.
- **Partial reads.** Reading only what is needed (the tiles a player has revealed, the dialogue branches already visited) is a property of your statements. The package does not enforce it. The path explorer demo (`demos/phaser-path-explorer`) is the reference: its client never holds the ground truth of a tile the player has not discovered.
- **Seeding.** A new world is a graph document given to `createClient` through an application graph (ADR-009).
- **Drawing, undo and game rules.** The cache has no undo, no snapshot across actions and no knowledge states.

## Limits of the first release

- Unstable below 1.0: names may change.
- Sized for turn-sized actions: one statement at a time, one awaited action at a time. A game that changes many entities every frame, such as an entity-component system, would need batching, which the package does not offer (RFC-008, question 7.6).
- One cache per graph. Choosing between levels, save slots and several live boards is left to the game (RFC-008, question 7.5).

## Checks

```sh
pnpm test:phaser            # the queue, cache, throwaway client and watcher, against the real engine in Node
pnpm test:phaser-package    # packs the package, installs it in a clean project, runs the example
pnpm test:phaser-trace      # every requirement of specs/009-relate-phaser-package has a passing, tagged test
pnpm test:phaser-browsers   # the path explorer in Chromium, Firefox and WebKit
```
