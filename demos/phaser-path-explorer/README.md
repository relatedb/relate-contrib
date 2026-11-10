# phaser-path-explorer

A Phaser demo where exploring is querying. An explorer extends a thread across a hidden hex map, and the world lives in an
embedded Relate graph in the browser. The design is `design/notes/2026-11-10-phaser-path-explorer.md`; the decisions are
`design/adr/ADR-010-phaser-path-explorer.md`. Rules are expected to change in play testing.

## Status: slice 2 (the thread)

A seeded 22 by 20 world is stored as an application graph (a durable graph in the browser, ADR-009). The board starts as
fog; the camp and its six neighbours are known. You play by clicking:

Mouse:

- a hex next to you: **extend** the thread onto it (one waymark), over unexplored or remembered ground, or across a path
  while a thread is in play; from an anchor, or from the end of your thread
- the hex behind your thread: **reel in** (the waymark comes back)
- shift-click a known hex next to you: **step** (no thread); with no thread in play, a plain click on a path also steps
- another anchor, from an anchor: **skip** along secured paths

Keyboard, as in a space shooter: **left and right turn** a sixth of a turn, **up** acts on the hex ahead (the same as a
click on it), **down** acts on the hex behind, **shift** steps instead of extending, **backspace** reels in. A translucent
preview shows what the next press would do. The explorer faces the way it last moved; clicking a neighbour turns it to
face that hex.

A thread is wavy while it is being extended and straightens when it reaches a second anchor and becomes a secured path:
then it is drawn with the design system's hex elbows and straight connectors, with an arrow into the target. The camp
(red), towers (light blue) and the explorer (yellow) are hollow rings of one size.
Progress survives a reload. Snags, hazards, cues, hasty retreat and prune
are the next slices.

- `?dpr=2` renders at 2x pixel density (the default is the display's, rounded); `?seed=<text>` picks the world, but only on a first run: the stored graph is the truth afterwards.
- `?reset=1` discards the stored world and seeds it again with the seed given, then drops itself from the address.
- `?cols=16&rows=14&pixel=4` tries another board size (with `reset=1` for a stored world); the default is 22 by 20 at 3x.

## Run

From the repository root (the engine's browser package must be built once: `pnpm run build:wasm`, see `vendor/README.md`):

```sh
pnpm install
pnpm --filter @relate/web build
pnpm --filter phaser-path-explorer dev      # http://localhost:5174
pnpm --filter phaser-path-explorer test     # unit tests, including the golden test below
pnpm --filter phaser-path-explorer build
```

In development (`pnpm dev`), `window.__state` and `window.__bridge` expose the game state and the database bridge to the
browser console for driving the game by hand.

## Layout

- `src/hex/` is the hex library, written to be lifted out (ADR-010, 2.1): `assets/` (data only), `core/` (pure code, no DOM
  and no Phaser), `phaser/` (the only code that imports Phaser). Nothing in it imports the game; `tests/boundary.test.ts`
  enforces that.
- `src/game/` is the game: the world generator, the graph model, the statements (`statements.ts`, ADR-010 2.5), the
  bridge (`bridge.ts`: outbox, pump), the cache and actions (`state.ts`) and the scene (`MapScene.ts`). The scene reads the
  cache and never awaits.
- `scripts/extract-assets.mjs` regenerates `src/hex/assets/*.json` and `tests/fixtures/hexmap-golden.json` from the
  "Relate by ABK" design system's bundle and tokens. Rerun it when the design system changes:

  ```sh
  pnpm --filter phaser-path-explorer extract-assets -- --bundle <bundle.js> --tokens <tokens.json> --version <artifact version>
  ```

- `tests/hexmap-golden.test.ts`, `tests/hexfield-sprite-golden.test.ts` and `tests/graph-golden.test.ts` and `tests/elbow-golden.test.ts` compare the
  core's pixel, flat and facet looks, its sprites, its arrow notation, its hex elbows and its graph overlay with what the design system's
  own `HexMap`, `HexField`, `Sprite`, `Arrow` and `HexGraph` produce, so a drift is caught by a check. `tests/statements.test.ts` and `tests/state.test.ts` run the game's statements and actions against the
  engine's WebAssembly build in Node.

## Notes

- Terrain and cues carry information in this game, which the design system does not allow elsewhere (ADR-010, 2.7).
- The ground truth of the world sits in the visitor's browser store and can be read with developer tools.
- Phaser 4.2.1 is MIT-licensed. The production bundle is about 1.4 MB (360 KB gzipped), mostly Phaser.
- The sprites, terrain and mascot of the design system need the Neo4j brand team's review before a public release.
