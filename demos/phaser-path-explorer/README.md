# phaser-path-explorer

A Phaser demo where exploring is querying. An explorer extends a thread across a hidden hex map, and the world lives in an
embedded Relate graph in the browser. The design is `design/notes/2026-11-10-phaser-path-explorer.md`; the decisions are
`design/adr/ADR-011-phaser-path-explorer.md`. Rules are expected to change in play testing.

## Status: slice 3 (the waymarker expedition)

A seeded 25 by 20 world is stored as an application graph (a durable graph in the browser, ADR-009). The board starts as
fog; the camp and its six neighbours are known. You play in **days**: each day is **12 steps** (extending, stepping,
reeling in and travelling all cost one) and you carry **5 waymarkers**. Join both towers to the camp with secured paths to
win.

Mouse:

- a hex next to you: **extend** the path onto it (one step), over unexplored or remembered ground, or across a path
  while a path is in play; from an anchor, or from the end of your path
- the hex behind your path: **reel in** (one step)
- shift-click a known hex next to you: **step** (no path); with no path in play, a plain click on a path also steps
- another anchor, from an anchor: **travel** for one step along secured paths
- reaching a tower secures the path but does not end the day

Placing a waymarker (**p**) banks the path followed so far as secured ground and turns your current hex into an anchor.
It does **not** end the day: you stay on the waymark with your remaining steps, and a new loose path can grow from it.
The day ends only when the steps run out or you press **e**; then you return to the camp and the steps refill. Any path
still loose is abandoned, and everything the secured network does not disclose fogs over. Banked ground survives, with
its neighbours coming back as sensed. A found cache adds one waymarker.

Keyboard, as in a space shooter: **left and right turn** a sixth of a turn, **up** acts on the hex ahead (the same as a
click on it), **down** acts on the hex behind, **shift** steps instead of extending, **p** places
a waymarker, **e** ends the day, **backspace** or **cmd-Z** undoes the last action (one level, the end of a day included). **Esc**, **h** or **?** pause the game and bring back the splash: grey message bubbles drift across the board, which stays in view behind them, telling the premise (top row), the keys (middle row), and your last and best scores (bottom row). Behind the bubbles an explorer wanders a throwaway island with a lantern and runs from the robots that roam it, seen only up close (a demo, never your saved game). **Any key** continues the game, and **n** starts a new one on a random island (the confirmation that abandons the one in progress). A translucent preview shows what the next press would do. The explorer faces the way it
last moved; clicking a neighbour turns it to face that hex.

When the game is over and the robots have been, a portal opens beside the explorer: take as long as you like in the last scene, then step into it (up when facing it, or click it) to see your score.

The hexes round the explorer are in view in full (a settlement beside the path is seen) and the ring beyond is shown in flat colour; neither can be stepped onto, only the path extended there.

A path is wavy while it is loose and straightens when it is banked as secured ground (a waymarker, or a tower):
then it is drawn with the design system's hex elbows and straight connectors, with an arrow at each end (`<->`). A loose
path is anchored by a bar at its start and ends in an arrow (`|~>`). The explorer is a sprite; the waymarkers still in the
bag pile round the camp and fly to the hex they mark. The sun is the clock: a faint sun shows where the faced move
would carry the day, and a climb the day cannot pay for puts it beyond dusk. There is no status line; the world shows it.
Progress survives a reload. Snags, cues, hazards, a clock and the
cross-browser run are deferred (ADR-011, amended 2026-11-16).

- `?dpr=2` renders at 2x pixel density (the default is the display's, rounded); `?seed=<text>` picks the world, but only on a first run: the stored graph is the truth afterwards.
- `?reset=1` discards the stored world and seeds it again with the seed given, then drops itself from the address.
- `?cols=16&rows=14&pixel=4` tries another board size (with `reset=1` for a stored world); the default is 25 by 20 at 3x.

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

- `src/hex/` is the hex library, written to be lifted out (ADR-011, 2.1): `assets/` (data only), `core/` (pure code, no DOM
  and no Phaser), `phaser/` (the only code that imports Phaser). Nothing in it imports the game; `tests/boundary.test.ts`
  enforces that.
- `src/game/` is the game: the world generator, the graph model, the statements (`statements.ts`, ADR-011 2.5), the
  cache and actions (`state.ts`) and the scene (`MapScene.ts`). The scene reads the cache and never awaits. The
  statement queue, the generic cache mechanism (version, pending action, reload after an engine replacement), the
  throwaway client and the version watcher are the package `@relate/relate-phaser` (`packages/phaser`, ADR-012).
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

- Terrain and cues carry information in this game, which the design system does not allow elsewhere (ADR-011, 2.7).
- The ground truth of the world sits in the visitor's browser store and can be read with developer tools.
- Phaser 4.2.1 is MIT-licensed. The production bundle is about 1.4 MB (360 KB gzipped), mostly Phaser.
- The sprites, terrain and mascot of the design system need the Neo4j brand team's review before a public release.
