---
id: ADR-011
title: The Phaser Path Explorer, a Demo with a Separable Hex Library and a Disclosure Graph
status: accepted
rfcs: [RFC-005, RFC-006]
created: 2026-11-10
---

# ADR-011: The Phaser Path Explorer, a Demo with a Separable Hex Library and a Disclosure Graph

## 1. Context

Phaser is a 2D browser game framework. Its scenes run an `update` function every frame, so game code cannot wait on a database that lives in a Web Worker and answers asynchronously. The engine side is the core package, `@relate/web` (`packages/web`): `createClient` starts the engine in a worker, `query(statement, params)` returns a promise, and an engine error arrives in the result envelope's `error` field and does not throw. One statement is one atomic unit; there is no multi-statement transaction. A client created with the `application` option keeps one named durable graph in the browser, seeded once and carried forward by versioned migrations (ADR-009).

The visual material is the "Relate by ABK" design system, a design artifact that defines three looks for hex terrain on one lattice (`pixel`, `flat` and `facet`), 16x16 pixel sprites, and a hex graph overlay of round node discs joined by links, elbows and crossings. Its drawing code ships as a React and SVG bundle. A Phaser game needs the same material as textures and draw calls, and a second consumer of the same drawing code (a docs page, a different engine) should not have to take Phaser or the game with it.

The game, the phaser-path-explorer, makes disclosure the mechanic. An explorer starts at a camp and extends a thread across a hidden hex map, one hex per turn. The thread is *loose* until it reaches a second anchor (a fixed point: the camp, or a landmark such as a tower), when it becomes a *secured* path; a loose thread can snag on hostile ground and break, which cuts the explorer off from every anchor. The explorer can skip between anchors joined by secured paths, and can prune a secured path. Each hex of thread costs one waymark (a marker, of which the explorer carries a limited number), and reeling in or pruning returns them. Hexes next to the explorer's thread are sensed: they show visual cues about what lies there, never numbers or text. Dangers (static, such as leaking drums) and rewards (caches, food) are in the graph from the start and are revealed by queries. The design, its cue vocabulary and the checks of its queries are in `design/notes/2026-11-10-phaser-path-explorer.md`. Three decisions need recording before implementation: how the demo is divided so the hex drawing can be lifted out; how the frame loop and the database talk; and which graph model and statements the game stands on, given what the engine was observed to do.

RFC-005 asks for runnable local-first demos, which are working reference implementations and more than templates, and for shared libraries to be extracted when a second demo shows the need. RFC-006 and ADR-009 supply the durable store the player's paths and world depend on.

## 2. Decision

### 2.1 Deliverable and layout

An unpublished demo, `demos/phaser-path-explorer`, a Vite and TypeScript application on Phaser 4 and `@relate/web`. Phaser is pinned to an exact version; its 4.x import form differs from 3.x, and the demo uses the 4.x form. The demo is added to `pnpm-workspace.yaml`, which lists only `packages/*` today (ADR-008 adds `demos/` for the same reason). The engine's `.wasm` file is imported with the bundler's URL import and its URL is passed to `createClient` as `engineUrl`, because bundlers move the file.

The hex drawing lives in `demos/phaser-path-explorer/src/hex/`, in three layers that import only downward:

| Layer | Folder | Contents | May import |
|---|---|---|---|
| assets | `src/hex/assets/` | Data only (JSON): the palette, the sprite bitmaps and their palette, the feature bitmaps (tree, town, tent, tower), the lattice constants, the terrain legend (`D w s g f h m b`, features `T t R U`). | nothing |
| core | `src/hex/core/` | Code with no DOM and no Phaser: lattice geometry (offset, axial and cube coordinates, hex to pixel); the terrain painters, which are procedures per terrain driven by a seeded random generator, producing a pixel buffer; polygon generators for the `flat` and `facet` looks; overlay geometry (node discs, links with their arrow notation, elbows, crossings) as draw lists. | assets |
| Phaser adapter | `src/hex/phaser/` | Converts buffers into Phaser textures and draw lists into `Graphics`; applies tints. The only code that imports `phaser`. | core, `phaser` |

Nothing under `src/hex/` imports from elsewhere in the demo, and nothing in the demo's game code reaches into the layers' internals: it uses each layer's index. A test fails the build on a violation. The layers describe a scene in the design system's vocabulary (`rows` or `tiles`, `nodes`, `edges`, `pieces`, `pixel`), with `look` accepted per tile. They know nothing about Cypher, the graph model, cues or game rules. The folder is promoted to a workspace package when a second consumer exists, with the name the project settles on; until then the boundary is the only cost of keeping it separable.

### 2.2 Assets and the port from the design system

The design system's component bundle (`components/bundle.js`, a classic script that assigns `window.Relate`) holds both kinds of material, and they move differently:

- **Data, extracted.** The sprite bitmaps (`SPRITES`: 16 rows of palette characters each) with their palette (`SPR_PAL`), the feature bitmaps (`BM`: tree, town, tent, tower) with their colour map (`BC`), and the colours, from `tokens.json`, as the fixed `--neo-*` palette tokens. A script kept in the demo writes these to `src/hex/assets/` as JSON, and the files are committed. Each records the design-system artifact version it was taken from. They are not edited by hand.
- **Code, ported.** The terrain painters (`hexPaint`: one procedure per terrain that fills the tile and scatters detail with a seeded generator), the generator itself (`rng`), the `facet` polygon builder, the arrow notation, the hex elbows and the hex graph overlay's layout are source code in the bundle, and are not exported (only the React components are). They are rewritten in `src/hex/core/` in a form that runs in Node, keeping the generator and the order of its draws, so a tile seeded the same way draws the same. The lattice is the bundle's: a tile is 16 cells wide and 17 tall, rows step down 14 cells, odd rows shift right 8.

A golden test (a test that compares output with a stored reference) compares the core's painters with what the bundle's own `HexMap`, `HexField` and `Sprite` paint, cell by cell, and the ported arrow notation, graph layout and hex elbows with the bundle's own `arrowGeometry`, `HexGraph` and `HexElbow` output (the path text, the transform, the node radii), for fixed inputs. The fixtures come from running the bundle in a sandbox, with a recording stand-in for React and the internals exposed by a spliced-in line, so no browser is needed (built in slice 0; `demos/phaser-path-explorer/scripts/extract-assets.mjs`). A divergence from the design system is caught by a check and not by eye.

### 2.3 Game data and the cue table

The cue table is a game data file, `src/game/cues.json`, not part of the library. It maps each kind of `Thing` (a hazard or reward placed on a hex, see 2.4) to the cues it casts: the idiom on its own hex and a weaker echo on neighbouring hexes, expressed as library asset names (a sprite, or a terrain override such as grass drawn as badlands). A cue is never text and never a count. Cues differ in shape or lightness, not hue alone. Adding variety is editing the table.

Fidelity follows knowledge, and a hex the player has not discovered is not drawn from what the graph knows about it: a hidden hex is fog, one flat colour, and the client never holds its terrain (the board read returns terrain, feature and anchor as null for a hidden hex, 2.5). A sensed hex, which is known but not walked, is drawn in the `flat` look (just the ground's colour, no detail), slightly darkened, with its cues; a seen hex or a hex on a path is drawn in the `pixel` look. Flat against pixel is a difference a player reads at once as less against more detail; the `facet` look sat too close to `pixel` and was dropped from the game after trying it. The `facet` look is ported and tested but unused for now, kept for a zoomed-out view. Labels, the journal line shown after entering a hex, and the health and waymark meters live in a DOM layer beside the canvas, never on terrain. The explorer is marked by its ring alone (below). A hex-sized sprite was tried and dropped: at 16 cells it is larger than the buildings the design system draws (about 8 to 12 cells) and it hid what the explorer stood on. Small filled nodes on every hex of the thread, and a pulsing yellow outline with a lift on the explorer's hex, were tried and dropped too, as clutter and as redundant with the ring.

The thread and the paths are drawn with the design system's hex graph overlay, ported into the hex library and checked against the design system's own output (2.2), following one visual language: **a path is wavy while it is being extended and straight once it is anchored**. A loose thread between neighbours is the design system's wavy arrow (`~>`). A loose thread through several hexes is one wavy line along its route, from the edge of the source's ring to the edge the arrowhead starts from, ending in the design system's arrowhead; the design system has no wavy elbow, so the line is a sine wave along the route's centreline with the corners softened, tapering to straight at both ends (a deviation, 2.7). When the thread reaches an anchor and is secured, the same route is drawn straight: each hex it passes through carries a routing piece, a straight connector or an elbow (`HexElbow`), and an arrow link joins the first piece to the source and the last to the target, from the edge of a ring to the edge of a hex. Both are a single black stroke over a cream casing; a double stroke is set aside for now. The camp, the towers and the explorer are rings of one size (8 cells across) with nothing inside, so the ground and the tent show through: a 1-cell stroke, as the design system's nodes have, with its cream casing outside the ring and none inside. They are red for the camp, light blue for a tower and yellow for the explorer; where the explorer stands on an anchor, its ring takes the anchor's place. Where a thread crosses a path, each route passes straight through the shared hex (a route follows the outgoing edge of its own kind, or on the far side of the hex when both are of one kind); a wavy thread simply passes over the path, and two secured routes that cross on different straight axes are drawn as the design system's crossing (`HexCross`, a bridge); pieces that bend overlap with the later one's cream casing laid over the earlier. Vector shapes are drawn with antialiasing at the display's pixel density (the canvas holds that many times the pixels, shown at the chosen size), and the terrain texture alone is set to nearest-neighbour filtering to keep its pixels crisp.

A click means one verb. Next to the explorer, the hex behind the thread reels the thread in; otherwise the thread extends there when it can, over unexplored or remembered ground, or across a path while a thread is in play (with no thread in play, a click on a path is a step along it); and when it cannot, a known hex is a step. Shift-click always steps. From an anchor, a click on another anchor skips. The same decision is made without acting (`GameState.intent`), which the keyboard preview uses. The client checks the rules locally only to give a reason; the statement of 2.5 decides.

The keyboard works as in a space shooter, on the explorer's facing (one of the six directions, kept in the client and not in the graph): left and right turn a sixth of a turn, up acts on the hex ahead as a click would, down acts on the hex behind, Shift steps instead of extending, and Backspace reels in. After a move the explorer faces the way it went (after a reel-in, the hex it just left, so the next extension runs the way the thread did), moving backwards leaves the facing alone, and clicking a neighbour turns the explorer to face it. While the keyboard is in use, and until the pointer moves, a preview of the move ahead is drawn: a ring on the faced hex and, for an extension, the arrow that would join the two, wavy as the loose thread is, or, for a reel-in, the arrow back; a step shows the ring alone and a refused move nothing, with the reason in the status line. The preview is a translucent version of the ring and the arrow, which are the design system's (2.7).

### 2.4 The graph model

The world is an application graph (`createClient` with `application`) named `phaser-path-explorer`, schema version 1, no migrations yet. Every node has a string `id`. The seed is a document in the node-link JSON format of ADR-002, where each node's `id` is a structural key that becomes the node's `id` property, and the application export drops nodes without a string id (ADR-009).

```
(:Hex   {id, q, r, col, row, terrain, state, anchor, origin, snag})   state: hidden | sensed | seen | path; anchor, origin and snag are flags (the camp is both anchor and origin)
(:Thing {id, kind})-[:ON]->(:Hex)                                       hazards and rewards; ground truth
(:Hex)-[:ADJ]->(:Hex)                                                    one direction per pair, matched undirected
(:Hex)-[:LOOSE   {since}]->(:Hex)                                        the thread being extended, from one anchor; at most one thread at a time
(:Hex)-[:SECURED {since}]->(:Hex)                                        a path between anchors
(:Player {id: 'player', health, waymarks, at})                           at is the id of the hex the explorer stands on
```

The world is a rectangular grid, 22 columns by 20 rows (440 hexes) at first, drawn at 3 screen pixels per lattice cell. A function of a seed string and a density generates it: terrain, `Thing` placement, and two guarantees: the camp hex and its six neighbours hold no hazard, and at least two anchors lie within the starting waymark budget of the camp, by land and no nearer than four hexes, so a seed cannot produce a map with nowhere to go (the generator places two towers that way first and checks it by test). The result is a graph data document passed as the application's `seed`, loaded once on first run (ADR-009). The stored graph is the truth afterwards; the generator is never run over an existing store, so a later generator change cannot alter a visitor's world. The client cache holds only revealed hexes.

### 2.5 Statements

Each verb is one statement, so each is atomic, and values are bound parameters. The statements below were run on 2026-11-10 against the engine's native build at the commit the repository pins (`vendor/relate` at `31269e3`, which builds as Relate 0.16.1), on a durable store, in a scenario that covers a thread extended and secured, a skip, a refused second thread, a snag that cuts the explorer off, a step back, a reel-in, a hasty retreat and a prune that carries the explorer home. They behaved as described, with bound strings and numbers and an array bound from a file. They were then run again in the engine's WebAssembly build, loaded in Node, as `demos/phaser-path-explorer/tests/statements.test.ts` against `src/game/statements.ts` (13 tests, all passing), including the 440-hex chain. Reachability uses `shortestPath` (a test of whether any path exists), run in the same scenario with output identical to a bounded variable-length form, and on a 440-hex chain: no orphans while intact, 220 when cut in half. Securing is a statement of its own because the engine does not accept creating a relationship from a function call such as `startNode(r)` inside `FOREACH`, so it cannot be folded into the extend.

```cypher
// Extend one hex. The explorer must stand on an anchor with no thread in play, or on the thread's head
// (a hex with an incoming loose edge and no outgoing one). The target may be unexplored or remembered ground,
// or a hex on a path (the thread then crosses it), but may not touch the thread itself. Lays a loose edge
// (none if the hex snags), pays one waymark, moves, senses the neighbours.
MATCH (pl:Player {id: 'player'}), (p:Hex {id: pl.at})-[:ADJ]-(h:Hex {id: $to})
WHERE h.state IN ['sensed', 'seen', 'path'] AND pl.waymarks > 0
  AND NOT EXISTS { (h)-[:LOOSE]-(:Hex) }
  AND ( (p.anchor AND NOT EXISTS { (:Hex)-[:LOOSE]->(:Hex) })
        OR (EXISTS { (:Hex)-[:LOOSE]->(p) } AND NOT EXISTS { (p)-[:LOOSE]->(:Hex) }) )
FOREACH (_ IN CASE WHEN h.snag THEN [] ELSE [1] END | CREATE (p)-[:LOOSE {since: $now}]->(h))
SET h.state = CASE WHEN h.snag THEN 'seen' ELSE 'path' END,
    pl.waymarks = pl.waymarks - 1, pl.at = h.id
WITH h
OPTIONAL MATCH (h)-[:ADJ]-(n:Hex) WHERE n.state = 'hidden'
SET n.state = 'sensed'
RETURN h.id AS id, coalesce(h.anchor, false) AS anchor, coalesce(h.snag, false) AS snag, collect(n.id) AS sensed

// Secure: when the explorer stands on an anchor at the head of the thread, every loose edge becomes secured.
// Harmless to run at any time (it matches nothing otherwise).
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at, anchor: true})
WHERE EXISTS { (:Hex)-[:LOOSE]->(h) }
MATCH (a:Hex)-[r:LOOSE]->(b:Hex)
CREATE (a)-[:SECURED {since: r.since}]->(b) DELETE r
RETURN count(r) AS secured

// Cue source for a set of sensed hexes: Things on the hex itself and on its neighbours
MATCH (n:Hex) WHERE n.id IN $ids
MATCH (n)-[:ADJ*0..1]-(m:Hex)<-[:ON]-(t:Thing)
RETURN n.id AS id, m = n AS own, t.kind AS kind

// Step one hex over known ground (a hex on a path or remembered); lays no thread
MATCH (pl:Player {id: 'player'}), (p:Hex {id: pl.at})-[:ADJ]-(h:Hex {id: $to})
WHERE h.state IN ['seen', 'path']
SET pl.at = h.id RETURN pl.at AS at

// Reel in: the explorer at the head of the thread steps back and takes the last loose edge in (a hex on a secured path stays on it)
MATCH (pl:Player {id: 'player'}), (prev:Hex)-[r:LOOSE]->(p:Hex {id: pl.at})
WHERE NOT EXISTS { (p)-[:LOOSE]->(:Hex) }
DELETE r
SET p.state = CASE WHEN EXISTS { (p)-[:SECURED]-(:Hex) } THEN 'path' ELSE 'seen' END,
    pl.waymarks = pl.waymarks + 1, pl.at = prev.id
RETURN pl.at AS at

// Is the explorer cut off from every anchor?
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at})
RETURN (coalesce(h.anchor, false)
        OR EXISTS { MATCH p = shortestPath((h)-[:LOOSE|SECURED*]-(:Hex {anchor: true})) }) AS tethered

// Skip between anchors over secured paths; refused while a thread is in play
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at, anchor: true}), (t:Hex {id: $to, anchor: true})
WHERE NOT EXISTS { (:Hex)-[:LOOSE]->(:Hex) }
  AND (h = t OR EXISTS { MATCH p = shortestPath((h)-[:SECURED*]-(t)) })
SET pl.at = t.id RETURN pl.at AS at

// Hasty retreat: only while the explorer's hex still reaches the camp; abandon the loose thread and go home
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at}), (home:Hex {origin: true})
WHERE (coalesce(h.origin, false)
       OR EXISTS { MATCH p = shortestPath((h)-[:LOOSE|SECURED*]-(:Hex {origin: true})) })
OPTIONAL MATCH (x:Hex)<-[r:LOOSE]-(:Hex)
SET x.state = CASE WHEN EXISTS { (x)-[:SECURED]-(:Hex) } THEN 'path' ELSE 'seen' END DELETE r
WITH pl, home, count(r) AS lost
SET pl.at = home.id
RETURN pl.at AS at, lost

// Prune a secured path: delete it, mark what lost its way back to the camp, free its edges,
// refund its waymarks, and carry the explorer home if the explorer stood on what was cut off
MATCH (:Hex {id: $a})-[r:SECURED]-(:Hex {id: $b}) DELETE r
WITH count(r) AS deleted
MATCH (t:Hex {state: 'path'})
WHERE t.origin IS NULL
  AND NOT EXISTS { MATCH p = shortestPath((t)-[:SECURED|LOOSE*]-(:Hex {origin: true})) }
WITH collect(t) AS orphans
UNWIND orphans AS o
OPTIONAL MATCH (o)-[x:SECURED|LOOSE]-() DELETE x
SET o.state = 'seen'
WITH orphans, collect(DISTINCT o.id) AS ids
MATCH (pl:Player {id: 'player'}), (home:Hex {origin: true})
SET pl.waymarks = pl.waymarks + size(orphans),
    pl.at = CASE WHEN pl.at IN ids THEN home.id ELSE pl.at END
RETURN ids, pl.waymarks AS waymarks, pl.at AS at
```

A statement that matches nothing changes nothing and returns no rows; the bridge treats an empty reply as a refused move and rolls back. An extension that returns `anchor: true` is followed by the secure statement, and the bridge also issues it on load, so a crash between the two leaves nothing half-done. A snag leaves the loose thread attached to its anchor as a stub with its head where the explorer last stood; the cut-off explorer steps back onto the stub's head and can extend from it again or reel in. A hasty retreat that matches nothing means the explorer is cut off, and the bridge says so.

Reachability is asked with `shortestPath`, not with a variable-length pattern. An unbounded `*` stops at 32 hops without an error, and an explicit bound has to exceed the longest possible path and stay under the engine's default limit of 500, which would tie the board's size to the engine's settings. `shortestPath` has no hop cap (the engine bounds it by the number of relationships), so the board size is free of both. Two guards follow from how it behaves. It needs two distinct nodes, so the hex being tested is compared with the target first (`coalesce(h.anchor, false) OR`, `h = t OR`, `t.origin IS NULL`). And a flag that is absent is null: `NOT t.origin` is null for a hex with no `origin` property and drops the row, so statements test with `IS NULL` or `coalesce`.

One idea runs through the statements: *is this hex still connected to an anchor, or to the camp?* A break, a prune and the right to retreat are the same reachability test over the two relationship types. The model holds one invariant that the extend statement enforces: at most one thread is in play, and it grows only from its head. The waymark cost and refund are part of the extend, reel-in and prune statements. The health rule and the hazard statement (read the hex's `Thing`, update the `Player`, in one statement) are game rules the implementation specifies; the decision fixes only that each verb is a single statement. The thread, snag, retreat and waymark rules are expected to change in play testing, and a change to them that keeps the model of 2.4 and the invariant above does not change this decision.

### 2.6 The database bridge

The frame loop never awaits. A game-side bridge holds an outbox and a cache.

- An action pushes `{id, statement, params}` onto the outbox. A single asynchronous pump, outside the frame loop, drains it in order, one statement at a time, so statements apply in the order issued.
- On load, a fixed set of read statements fetches the revealed hexes, the thread and path edges, the player and the cue source for sensed hexes, and fills the cache before the first frame.
- Replies are turned into typed events and patch the cache, a plain object of revealed hexes, the thread and paths, the player and the cues. `update` and rendering read only the cache.
- Walking along an existing path is applied to the cache at once and confirmed by the reply. An extension needs the reply to know what the new hexes contain and whether the hex snags, so the sensed hexes show a two-frame pending state until it arrives; input is never blocked, and a further extend queues behind it.
- An engine error in a reply, or a client in `failed`, rolls back the optimistic part and shows the client's diagnostic. The bridge does not retry; the core already replaces a crashed worker.
- The interface reads `client.storage` and says whether the world is stored durably, in memory only, or waiting on another tab, with an export control and, after confirmation, a reset control (`exportApplication`, `resetApplication`), as ADR-008 proposes for its demo.

### 2.7 Motion and style

Any animation is at most two frames and respects the reduced-motion setting; there is none yet. The interface follows the design system: square corners, hard pixel shadows, and the design system's type families.

The demo stays true to the design system: its looks, geometry and notation are ported and checked against the design system's own output (2.2), and nothing is added or altered without agreeing it first. The agreed departures are these, and a change to any of them is recorded here:

- Terrain and cues carry information, which the design system does not allow elsewhere; the journal line is the text paired with what the player finds.
- Fog: a hex the player has not discovered is one flat colour (the Dark Baltic) with no terrain and no outline.
- Ground that is known but not yet walked is the flat look with its colour dimmed 20% towards the darkest Baltic, by mixing the colour so that no seam shows between hexes.
- Camp, towers and the explorer are drawn as hollow rings (no fill) in place of the filled node, with the node's stroke and a cream casing outside only.
- A loose thread through several hexes is a wavy line of our own (the design system's wavy shaft exists only on its straight arrow), with softened corners; once secured it is drawn with the design system's elbows and straight connectors. The double stroke those elbows offer is set aside for now.
- A cream outline on the hex under the pointer when it can be extended onto, and a light-blue one while an action waits for its reply.
- The keyboard preview: the explorer's ring and the design system's arrow, drawn at 55% opacity, on the hex the next press would act on.
- Canvas rendering: antialiased vector shapes at the display's pixel density, with nearest-neighbour filtering on the terrain texture alone.

Flat hexes have no outline, as in the design system.

### 2.8 Checks

- Unit tests for the core layer run in Node with no browser: geometry, the seeded rasteriser (compared with stored pixel-buffer hashes), overlay geometry, and the cue mapping.
- Query tests run every statement of 2.5 against the real engine through the core in Node, including a path longer than 32 hops, a loop, a snag that cuts the explorer off, a skip, a hasty retreat, and a prune that orphans a branch.
- A boundary test enforces the import rules of 2.1.
- A browser test runs the demo in Chromium, Firefox and WebKit through extend, secure, a snag, skip, hasty retreat, prune, a hazard, a reload (the paths remain), a second tab, and reset.
- Test names carry the identifiers of the requirements they cover, as the other packages' tests do.

## 3. Alternatives Considered

- **A turn-based demo on rot.js.** Rejected for this one: Phaser reaches the larger audience, and the hex and sprite material needs a canvas renderer. The game's rules are turn-based, so the bridge's real work is keeping animation continuous while a reply is pending; a rot.js variant, where a turn can wait on a reply, remains a later option (`design/notes/2026-11-08-integration-candidates-survey.md`, §3.2.1).
- **Await the database inside turn handlers, with no outbox or cache.** The rules are turn-based, so an async handler that shows a pending state would work and is simpler. Rejected for this demo because the survey's recommended Phaser pattern (never await in the frame loop; read only a cache) is what a Phaser demo exists to demonstrate, and an awaited handler stalls the animation tick whenever a reply is slow. The cost is the extra machinery; a turn-based demo that avoids it is the rot.js variant.
- **The hex library as a workspace package now.** Rejected: RFC-005 extracts a library when a second consumer shows the need. A boundary with an enforcing test costs little and keeps the move cheap.
- **Reuse the design system's React and SVG components over the canvas.** Rejected: they would tie the game to the React bundle and give Phaser no textures. The rendering cost of 440 hexes as SVG with animation was not measured.
- **Generate the world client-side and use the database only for the paths.** Rejected: disclosure as a query result is what the demo demonstrates, and ground truth the client holds is not disclosed by anything.
- **Store only the seed and the paths and regenerate the world on load.** Rejected: a generator change would alter a returning visitor's world. The stored graph is the truth.
- **Put the cue table in the library.** Rejected: cues are game design and change often; the library stays a renderer of tiles, sprites and overlays.
- **Bind the sensed look to a toggle, not to knowledge.** Not chosen: fidelity by knowledge gives the three looks distinct jobs. The library accepts `look` per tile either way, so the choice is the game's.

## 4. Consequences

- The ground truth of the world is in the visitor's browser store and can be read with developer tools. For a demo that is acceptable and the README says so.
- The terrain painters and overlay geometry are re-implemented from the design system's bundle, so two copies exist until the design system or this library becomes the single source. The committed assets record the artifact version they came from, and the golden test of 2.2 is the check against drift; the sprite and feature data are copied, not shared, and a design-system change reaches the demo only when the extraction script is rerun.
- The statements were run on the native build and in the WebAssembly build at the pinned engine commit (2.5), the second as an automated test. The WebAssembly run was in Node; the browser runs the same module in a worker but the statements have not been exercised there beyond the world's read.
- To confirm at implementation, and record the results as an amendment: the prune statement when it orphans nothing (an edge inside a loop), where the `UNWIND` of an empty list should return no rows and change nothing; the skip statement's refusal while a thread is in play, which the scenario did not reach from an anchor with a thread attached; that statements issued in order from one pump are applied in that order.
- Moving predators, a clock for the snag (supplies per turn or nightfall) and placing anchors are later changes. Cycle detection is available (fixed-length and variable-length loops were found) but unused in the first version. Scoring and a win condition are later amendments or new ADRs.
- ADR-009 allows one open tab to use the store, so a second tab of the demo waits and says so.
- The cues, the terrain, the sprites and the mascot need the Neo4j brand team's review before a public release, as the design system states.
- Phaser adds a sizeable bundle to a demo whose database is small: the slice-0 production build is about 1.4 MB (360 KB gzipped). The library boundary is more than a slim demo ADR usually carries, because other demos may share the hex library. It is built now and the extraction deferred, which is a position on RFC-005's open questions about where a slim ADR ends and what triggers extraction (7.2, 7.3). Phaser is MIT-licensed (survey note, §3.2), which meets that RFC's preference for permissive licences. Follow-up work: promote `src/hex/` to a package when a second consumer appears; a Kaplay or rot.js variant; predators that travel the paths.

## 5. Related

- RFCs: RFC-005, RFC-006
- ADR-009 (application graphs in the core), ADR-008 (the local-first conventions this one follows, for its react-admin demo)
- ADR-002 (the graph data format and the `id` property), ADR-001 (worker hosting)
- `design/notes/2026-11-10-phaser-path-explorer.md` (the design, the cue vocabulary, and the checks of the statements)

## 6. Amendments

### 2026-11-16: a one-week scope, and the waymarker expedition

The demo is cut down to something playable within a week, while still exercising the integration the ADR exists to
show: disclosure as a query result, paths and reachability as graph structure, and a durable application graph. The
following supersedes 2.3's waymark economy, 2.4's `Player` and `Hex` fields, the verbs and economy of 2.5, and the
checks of 2.8. Sections 2.1 (layout), 2.2 (assets) and 2.6 (the bridge) stand.

**The expedition.** A day is a budget of steps. The player starts at the camp with **5 waymarkers** and **12 steps**.
Every move costs one step: extending the path one hex, stepping over known ground, reeling back in, and travelling
between anchors. The path traces from the last anchor (the camp or a placed waymarker) to the explorer's position; the
hexes it crosses no longer cost anything in themselves.

- **Place a waymarker** on the hex the explorer stands on: the hex becomes an anchor, one waymarker is spent, and the
  path from the previous anchor becomes secured. This does **not** end the day: the explorer stays on the new waymark
  with the remaining steps, and a new loose path can grow from it. Banking is therefore a mid-day choice between
  preserving the path followed so far and continuing to explore.
- **A day ends when the steps run out, or when the player explicitly ends it**: the explorer returns to the camp, the
  step budget refills, and the remaining loose path is abandoned. Everything the day revealed that is not covered by
  the secured network fogs over: a hex stays known only if it lies on a secured path, is the camp, or neighbours such
  a hex (and then only as sensed); every other hex, including the whole of the abandoned loose path, is hidden again.
  What the player durably knows is exactly what the secured network discloses — knowledge is banked by placing
  waymarkers, so sweeping ground without spending one gains nothing that survives the day. Ground secured before a
  waymarker was placed survives even when the next loose path is abandoned at night.
- **Travel** from an anchor to another anchor joined by secured paths costs one step, not one per hex. This applies
  from the camp to a waymarker and between waymarkers, and is the payoff of placing markers.
- **A tower** is a fixed anchor. Arriving on one secures the path as before but does not end the day.
- **Winning**: both towers are joined to the camp by secured paths. The interface says so and offers a new day.
- **Rewards**: a cache found on a hex adds one waymarker (the only `Thing` kind in v1).
- **Terrain has a price, not a wall**: every hex carries a `cost` in steps (grass, sand, forest and hills 1;
  badlands 2; mountain 4; water and deep water 13 — more than any day, so never affordable). Extend and step pay the
  hex's cost; there is no passable/impassable flag. The relief itself is the interface: rises hint at the climb, the
  coast sinks away at the drop.

`Player` becomes `{id, steps, markers, at}` (no health, no waymarks); `Hex` loses the `snag` flag. Nothing else in 2.4
changes: the same `ADJ`, `LOOSE` and `SECURED` edges, the same `anchor` and `origin` flags, and the same seed.

**Deferred, not decided against.** Snags, the taut elastic line and its SPIKE-012, cut-off, hasty retreat, prune,
hazards and health, cues and decoys, predators, a clock, scoring beyond the win, and the facet or zoomed-out look are
out of v1. The prune and hasty-retreat statements of 2.5 are dropped rather than kept as dead code: the end of the day
replaces the hasty retreat, and pruning a secured path has no refund now that hexes cost no waymarks. The cue statement
stays, ready for when cues return. The statements of 2.5 remain in the text above as the starting point when those
mechanics return.

**Naming.** *Waymark* now means a placed anchor (previously the per-hex currency); *steps* is the movement currency;
*thread* is called the **path** in the interface and the remaining prose.

**Statements.** The extend statement of 2.5 loses its waymark cost and its snag branch and pays one step instead. The
secure statement is unchanged. Two statements are added: place a waymarker (spend one, set `anchor`, and secure the
path without moving the player or changing steps), and end the day on exhaustion or command (return to camp, refill,
delete the loose path, and re-fog every hex the secured network does not disclose: path hexes keep their state, their
neighbours become sensed, everything else is hidden, and the statement answers with the ids that were fogged so the
client's cache can drop them). The skip statement charges one step. The win is read with one statement over `SECURED`
edges from the camp to both towers. These are specified and tested against the engine before the interface uses them.

**Checks.** Node tests against the engine's WebAssembly build cover every new statement, including banking a path and
extending from its new waymarker without ending the day, a day ended by exhaustion, travel between anchors costing one
step, and the win test. Browser checks are by hand in one browser for v1; the Playwright setup for the demo and the
cross-browser run are deferred.

### 2026-11-17: polish: layers, sprites, path end-caps, undo, and no status line

The goal is a coherent world with no text or interface added to it. Decisions, to be iterated:

- **Layers**, back to front: the empty board (every hex position in a two-blue checker dither, the design system's
  shading device, replacing the flat fog tile), the vector tiles, the pixelated terrain, the graph paths, the
  sprites, then the sun and the sky. Hover and preview are translucent aids between the paths and the sprites.
- **Rings are dropped.** A path says what it joins by its end-caps: secured is `<->` (travel runs both ways); loose is
  anchored at its start by a bar and ends in an arrow (`|~>`). The camp and towers are the terrain's own pixel art; the
  explorer and the waymarkers are sprites.
- **Sprites (new art, pending brand review).** The explorer is a 16 by 16 figure and a waymarker a 5 by 8 red pennant,
  both in the design system's sprite notation and palette. The waymarkers in the bag pile round the camp tile; a
  placed one flies to its hex.
- **Hidden cost is time.** The sun crosses the top row as steps are spent, tweened, not jumping. A faint sun shows the
  slot the faced (or hovered) move would reach; one the day cannot afford is shown beyond dusk, in the night's colour.
- **Undo replaces confirmation.** One level: the last action, the end of a day included (an automatic end of day after
  the last step undoes with the step that caused it). Backspace and cmd-Z. The graph is restored from a snapshot of the
  cache by a short fixed sequence of bounded statements (clear the path edges, lay the loose and the secured ones back,
  restore the state and anchor of each changed hex, restore the player); the sequence is not one atomic statement, and
  a page closed part-way through could leave the graph part restored. Reeling in stays on the down key and a click
  behind the explorer.
- **No status line.** Messages stay in the state for tests and the language is unchanged, but nothing narrates the game;
  only a failure of the graph, or storage that will not keep the world, is told in words. One concession: a help
  overlay (first visit, then `h`) with a one-sentence statement of the game and the plain meaning of each key.
- **Fix.** The end of the day on exhausting the steps was unreachable code (a `return` before it); it now runs.


**End-caps, refined (2026-11-17).** Arrowheads stay on the wavy, exploratory path only. A secured path ends in `)` and
`(`: arcs of the circle inscribed in the tile, against its edge, joined to the line with no spoke. A loose path starts
with a bar as long as a side of the hexagon inscribed one cell inside the tile's edge, so six meeting in a tile close an
inner hex. These caps are drawn by hand, not from the design system's arrow glyphs, which have no `)`: a recorded
deviation. Casings go under the graph and the black over it, so a cap and its line read as one stroke. Waymarker flags
are 4 by 6 cells with no outline, standing top-centre on their hex.

**Fog as weather (2026-11-17).** The fog is grey cloud on the sky layer over every hex the explorer does not know, in
whole hexes (one density per hex, so cloud edges follow hex borders) with the design system's checker dither. It keeps
the empty board's two-tone dither and lifts both tones slightly towards grey, so it reads as the same pattern, lighter.
The board's dither is desaturated, and the night shade covers the whole board. The day's forgotten ground fades out
above the clouds. Static for now; drift is open.

**The night (2026-11-17).** Ending a day plays a 3.6 second scripted night, cosmetic only (the graph is already on the
new day): the sun runs on to dusk if the day ended early, turns into a crescent moon on the right, the sky darkens and the
forgotten ground fades as night falls, the moon crosses right to left, and at midnight (the moon on the left) the
explorer returns to camp; the sky then lightens and the moon turns back into the sun. Input is locked until dawn except
undo, which ends the night at once. The moon is a plain crescent with no phases.

**Board width (2026-11-17).** The board is 25 columns by 20 rows (500 hexes), replacing 22 by 20 from 2.1. The sun
crosses 24 column gaps in a 12 step day, so each step moves it exactly two tiles.

### 2026-11-17: the seven day game (rogue robots, the score, the splash)

Supersedes the goal-based win of the 2026-11-16 amendment ("both towers joined": the interface says so and offers a new
day). The game is now time-limited. The kingdom has seven days: a rogue AI is being assembled and will go for the
nearest settlement. Settlements (the towers) joined to the camp by secured paths are saved: the robots are made happy.
Isolated ones are destroyed.

- **The robot is the day counter.** One `(:Robot)` node, and one `(:Part {kind, n})` attached for each night that has
  passed, in the order head, eyes, mouth, body, arms, legs, power. The day is the number of parts plus one; the seventh
  night adds `power`, completes the robot and ends the game. No day counter and no stats are stored on the player.
  `END_DAY` creates the part. Undo takes a night back with its part.
- **Game over** is `Player.over`, the only new player field. It is set by the seventh night, or at once when every
  settlement is routed (`GAME_OVER`); the game then ends early. When it is set nothing more is done and undo is off.
- **Settlements.** Six, placed in pairs: each is within a day's reach (by cost, over land) of the camp or an earlier
  settlement, and the first two are within reach of the camp. Par is two settlements a day, so a perfect game is
  reachable: three days, no waymarker.
- **Score**, derived when the game ends and never stored in the graph: 100 for each settlement routed, less 5 for each
  waymarker placed (anchors that are neither the camp nor a tower, `MARKERS_USED`) and 10 for each day over par
  (`ceil(settlements / 2)` days), never below zero; a perfect game is 600. The last score and the personal best are kept in
  the browser's storage, outside the graph, so they survive the splash and reloads.
- **Splash** (the second interface concession): shown on every load, replacing the first-visit help; premise and keys,
  the last score and the personal best, new game (a random island) and, when a game is in progress, continue. Esc opens
  it as the pause screen (Esc again resumes); choosing new game is the confirmation, and the abandoned game is not
  scored. `?` and `H` still open the help.
- **Bottom row**: the robot prototype is drawn along it, one more part each day, moving right. **Finale**: the board is
  revealed, robots appear and head for the nearest settlements. These are the later slices; this amendment is built in
  slices, the model first.
- **Fix found on the way.** The win and score statements read a `tower` flag the seed never set, so the old win test could
  not have passed. The seed now flags towers.

Existing stored worlds lack the `Robot` node and need `?reset=1` once.

**The robot on the bottom row (2026-11-17).** The day counter is drawn along the bottom row: a 16 by 16 robot in the
design system's sprite style (new art, pending brand review), with one more part each night in the order of the parts in
the graph, and an even hop of four tiles to the right each day (on a 25 wide board: columns 0, 4, 8, 12, 16, 20, 24). A
faint outline of the whole robot marks where it is going. Until midnight of a night the row still shows the day that ended;
at midnight the robot steps to its new place and the new part switches on. The seventh part, power, lights the eyes and
the antenna.

**The finale (2026-11-17).** When the game is over (the seventh night has played, or every settlement is routed) the
clouds fade and the whole board is revealed: the cache reads the board as it is (`READ_TRUTH`), cache only, the graph is
untouched. A robot, the finished prototype, walks in from beyond the board's edge on each settlement's side of the camp
to that settlement, so its nearest settlement is its own. Where the settlement is joined to the camp by secured paths a
heart rises from the robot; where it is not, the robot turns red, the screen shakes, the settlement is swept away (bare
ground) and a fire burns. Then the splash tells the score. A game already over at load shows the same end state without
the walk. The hearts and fires are the design system's `heart` and `fire` sprites.

### 2026-11-17: signposts, and the mist

Playtesting the seven day game found it a resource constrained open search: nothing but cost to choose a direction by.

- **Signposts.** The graph has `(:Hex)-[:NEAR]->(:Hex)` edges from the camp and from each settlement to every settlement
  within a day's walk (cost at most the day's steps, over land), made by the seed; never to the camp. The camp starts
  `mapped`; arriving at a settlement (the extension that reaches it secures the route, as before) marks it `mapped`.
  From every mapped hex the signposts point to the settlements that are not yet reached (`READ_SIGNPOSTS`, which returns
  only the axial difference, never the position), each to the nearest of the six hex directions, and settlements the same
  way share one arrow: the imprecision is in the rules. They are drawn as arrowheads just outside the settlement's hex,
  above the mist, and are not shown once the game is over. Undo takes a signpost back with its arrival.
- **Mist, not weather.** The unknown was read as water or rock because it was blue-grey and dark. It is now a neutral,
  hueless light grey in the board's checker, lighter than any land, with clouds lighter still; blue is left to water. The
  clouds drift east, a hex at a time, the cloud noise sampled further behind every 1.1 seconds.

**The field of view, and the clocks clearing the mist (2026-11-17).**
- A fifth knowledge state, `viewed`: a hex in sight, drawn in full with its features (a settlement in view is seen as one),
  but still reached by extending the path, not stepped onto (`seen` stays the walkable state). Wherever the explorer
  stands, `VIEW_AROUND` makes the six hexes round it viewed and the ring beyond sensed; it runs after every move, after
  the day ends (at the camp) and in the seed. A hex stays viewed until the night forgets it, as any other. So a player can
  no longer walk past a settlement unseen: the ground does not have to be covered to be searched.
- The sun clears the mist along the top row from the left edge to where it is (the moon too, at night), and the robot along
  the bottom row to where it is, each including its own hex; the cleared hexes show open sky.

**The robot's colours (2026-11-17).** The robot is magenta and purple: a light purple head, a purple body, arms and legs,
a dark violet dead eye and a hot magenta lit eye and lamp. The design system's palette has no magenta or purple (only
periwinkle), so these four colours are a recorded deviation, held in `src/game/robot.ts`, for brand review.
