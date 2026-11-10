# Path explorer: where it stands, how to pick it up, and the open question about snags

This note hands over the "phaser-path-explorer" work in `relate-contrib` (the repository of RelateDB web integrations; RelateDB, called relate, is the embedded openCypher graph engine). The demo is a Phaser game whose world lives in an embedded relate graph in the browser, in the "Relate by ABK" design system's hex terrain, pixel art and hex graph overlay. It was written on 2026-11-10 so the work can continue on another machine, offline. It records what is built, how to run it, what is half done, and a design discussion about snags that was deliberately paused before any code was written. The design is in `2026-11-10-phaser-path-explorer.md`, the decisions in ADR-010 (`design/adr/ADR-010-phaser-path-explorer.md`, accepted but expected to change), and the code in `demos/phaser-path-explorer/`.

## 1. What is built

Slices 0 to 2 of the plan in the design note, plus a good deal of visual and control work:

- **The world** is an application graph (ADR-009): a 22 by 20 hex island generated from a seed (`src/game/world.ts`), stored once, persisted in the browser, read back through a bridge (outbox, single pump, plain-object cache) that never lets the frame loop await.
- **Disclosure**: fog (flat colour, no terrain held by the client), known-but-unwalked ground in the flat look, walked ground in the pixel look.
- **Verbs**: extend, reel in, step, skip, secure, and crossing an existing path. The statements are in `src/game/statements.ts`, including `HASTY_RETREAT` and `PRUNE`, which are written and tested on the engine but **not wired into the game yet**.
- **The hex library** (`src/hex/`, assets, core, Phaser adapter, meant to be lifted out later) ports the design system's pixel, flat and facet terrain, sprites, arrow notation, hex elbows, hex crossings and graph-overlay layout. Each is checked against the design system's own output by golden tests (`tests/*golden*.test.ts`, fixtures made by `scripts/extract-assets.mjs`).
- **Visual language**: a thread is wavy while it is being extended and straight (elbows and straight connectors) once secured; camp, towers and explorer are hollow rings of one size. Every departure from the design system is listed in ADR-010 2.7. The rule agreed with the user: stay true to the design system unless a deviation is agreed first.
- **Controls**: mouse (click extends, shift-click steps, click behind the thread reels in) and keyboard as in a space shooter (left and right turn, up acts ahead, down acts behind, Backspace reels in), with a translucent preview of the next move while keys are in use.
- **Checks**: 164 tests (`pnpm --filter phaser-path-explorer test`), including every statement run against the engine's WebAssembly build in Node. Typecheck and build are clean. The browser behaviour was checked by hand in one browser (Chromium); the repository's Playwright harness is not set up for the demo.

## 2. Picking it up on another machine

```sh
git fetch && git checkout adr/phaser-path-explorer
git submodule update --init vendor/relate     # the engine, pinned at 31269e3; needs read access to relatedb/relate
pnpm run build:wasm                           # needs Rust, wasm-bindgen-cli 0.2.128 (the engine pins it), binaryen; takes several minutes
pnpm install
pnpm --filter @relate/web build
pnpm --filter phaser-path-explorer dev        # http://localhost:5174
pnpm --filter phaser-path-explorer test
```

Do the build and the install while online: `pnpm install` and the first `build:wasm` fetch packages and crates. `vendor/relate-wasm/` and `vendor/.build/` are ignored, so the WebAssembly package is not in the branch and must be built on the new machine. The statement and state tests skip themselves if it is missing. The design-system artifact is only needed to rerun `pnpm --filter phaser-path-explorer extract-assets` (see the demo's README); the extracted assets and fixtures are committed. The last extraction came from artifact version `1794331993-33c7`, whose `bundle.js` and `tokens.json` were byte-identical to the first version used.

In development the page exposes `window.__state` and `window.__bridge`, which make it easy to drive the game from the console. `?reset=1` discards the stored world, `?seed=<text>` picks a world, `?dpr=2` forces a pixel density.

## 3. Loose ends

- **Slice 3 is not started**: snags, being cut off, hasty retreat and prune. It was paused for the discussion in section 4. The retreat and prune statements exist but are unused.
- **Cues and hazards** (slice 4) and **durability polish** (slice 5: storage status, export, reset controls) are not started.
- **ADR-010** needs an amendment once the snag design is settled. Its Consequences list what is still unverified: statement ordering from one pump, skip's refusal from an anchor with a thread attached, and prune when it orphans nothing.
- Small visual items the user may revisit: the preview arrow is short, the arrowhead into a ring is small, crossings of two bends overlap instead of bridging, the double stroke is set aside, the facet look and flat-for-zoomed-out are unused.
- Terminology settled this session: "demo" (not "starter"), "extend" (not "pay out"), "explorer" (not "wayfarer"); "waymark" stays.

## 4. The snag discussion (no code written)

**What was planned.** A hex flag `snag`. Extending onto one spends the waymark but lays no edge, so the explorer is cut off at the loose end of a stub and walks back over known ground; hasty retreat is refused while cut off. The thread traces every step the explorer takes.

**The user's idea.** The line from explorer to base should be **taut and elastic**, not a trace of the explorer's steps. A snag happens when the line is **pulled over a snagging object** (thorns, hidden or revealed). That **breaks the line and sends the explorer back to origin automatically.**

**Why it is better.** The hazard becomes geometry, not the hex you stand on, so hidden snags are discovered by the line, a break replaces the cut-off state, the walk back and the refused retreat with one simple outcome, and a secured path becomes the tightened route between anchors rather than a wandering trail.

**Open questions, with the assistant's leanings:**

1. *What shape is the line?* A literal straight line, or a taut string that wraps around impassable terrain like a rope round a post? Leaning: the wrapped string.
2. *What exactly snags?* Leaning: the string is pulled across a snag hex it must pass over to stay taut; the explorer walking through thorns themselves is a separate, undecided case.
3. *Is the line elastic in length?* If waymarks are line length, they refund as it tightens and wandering is cheap; a budget caps the stretch. This changes the economy from per step to per distance from base.
4. *Stakes of a break.* A free teleport home is a benefit; losing the line's waymarks or its unsecured segment makes it a cost. Discovered hexes stay known.
5. *Look.* A slack line could be wavy and a taut one straight, reusing the existing wavy-to-straight language as tension.
6. *Hidden snags* are revealed by the break; visible ones need cues.

**What it changes.** The data model (the trail becomes a record, the line derived), extend and reel-in (moving is extending, retracting is automatic), the waymark cost, and the planned snag, cut-off and retreat statements. Survives: the hex library, disclosure, rendering, securing at an anchor. The database fits it: one query over the line's hex ids answers "which snag hexes does it cross?".

**Suggested next step.** A short spike (`/spike-create`, the next number is SPIKE-012) on computing the taut string around obstacles over a hex grid, before amending ADR-010. The user's answers to questions 1 to 3 come first.
