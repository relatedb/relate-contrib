# Path explorer: a Phaser demo where exploring is querying

This note sketches a demo game for relate, the embedded openCypher property-graph engine that this repository integrates with web frameworks. The game runs in the browser on Phaser (a 2D game framework), keeps its world in a relate graph hosted in a Web Worker through `@relate/web` (the core package, `packages/web`), and borrows its look from the "Relate by ABK" design system (a design-system artifact that defines pixel hex terrain, round-node hex graph diagrams and 16x16 sprites). It is the "Phaser demo" that RFC-005 (`design/rfc/RFC-005-community-integrations.md`) and the survey in `design/notes/2026-11-08-integration-candidates-survey.md` (§3.2) call for. It replaces an earlier road-building idea. Nothing here is decided: it binds no ADR, and nothing has been measured. "Phaser path explorer" is a working name.

## 1. The idea

An explorer starts at a camp in the middle of an unexplored hex map. The player extends a trail one hex at a time, branches it from any trail hex, or prunes a branch. Everything off the trail is hidden. Hexes next to the trail are *sensed*: they show idiomatic cues about what lies there, never numbers or labels. Some of what is out there is dangerous (a leaking radioactive barrel), some is rewarding (a supply cache), and some is both (a rich cache that something got to first). The player deduces from cues and explores to confirm.

This is progressive disclosure as a mechanic: the player searches a problem space by growing a connected structure into it, paying for each step and abandoning dead ends. Minesweeper and fog-of-war hex games are the nearest relatives (§9). The player is a character in a setting, not an organism, so the growing structure is a trail the character cuts and marks.

Starting scope (decided in conversation, 2026-11-10): open world with no scoring or win condition; static dangers only; the first move is always safe; cues are visual and never numeric. The aim is to make the mechanics feel good first and decide later what winning means, if anything.

## 2. Setting

A post-collapse frontier: badlands, scrub, ruins, leaking drums of something that glows. This is a proposal, chosen because radioactive barrels were the first example and the design system's terrain palette (water, sand, grass, forest, hills, mountain, badlands) already reads as an overworld. The character is an explorer (one of the design system's `Sprite` figures; whether to use the mascot Archie is open, §10). The camp is a tent feature on the centre hex.

## 3. Mechanics

The trail is a **thread** the explorer extends from an anchor. An *anchor* is a fixed point: the camp (home), and landmarks found on the map (a tower, a tent, a town; the design system's own features). The thread has two states:

- **Loose.** The thread from the last anchor to the explorer, being extended one hex per turn. It is the weakest state: it can be reeled back in, re-routed or branched freely, it can snag, and it is the only way to explore.
- **Secured.** When the thread reaches a second anchor, every loose edge becomes a secured path between the two. A secured path stays until the player prunes it.

On the overlay, anchors are the round node discs, a secured path is a plain link (`->`), and a loose thread is a wavy link (`~>`), using the design system's arrow notation (a wavy shaft is already part of it).

| Verb | What it does |
|---|---|
| **Extend** | Move onto a sensed or seen hex next to the explorer, laying one loose edge and paying one waymark. The hex's unrevealed neighbours become sensed. Only one loose thread exists at a time, from one anchor. |
| **Reel in** | Step back along the loose thread, removing its last edge and refunding its waymark. |
| **Secure** | Arriving at an anchor makes the whole loose thread secured. |
| **Step** | Move one hex over known ground: a hex on a path or remembered ground. A step lays no thread. It is the only way back for an explorer cut off by a snag. |
| **Skip** | From an anchor, move to any other anchor connected to it by secured paths, in one turn. |
| **Hasty retreat** | While the loose thread still reaches an anchor, skip home at once. The loose thread is abandoned, and its waymarks are lost. |
| **Prune** | Remove a secured path. Anything no longer connected to the camp stops being path, returns its waymarks, and stays on the map as remembered ground. |
| **Snag** | Extending onto a snagging hex (thorny ground, say) breaks the thread there: no edge is laid, the waymark is spent, and the explorer stands cut off from every anchor. A cut-off explorer cannot skip or hasty-retreat and must walk back over known ground, one hex a turn. |

All of these are one query each over one idea: *is this hex still connected to an anchor?* The orphan query decides prune, a snag decides whether a retreat is allowed, and a skip is reachability over secured paths.

Supporting rules, each a candidate to change or cut once it is played:

- **Waymarks are the thread stock.** A loose hex costs one; a snag loses the loose segment's waymarks; securing keeps them; pruning and reeling in refund them; caches add some. A finite spool keeps the explorer near anchors, and finding anchors extends the reach.
- **Health.** Entering a hazard hex costs health and reveals the hazard permanently. At zero, the explorer wakes at the camp and the loose thread is lost. Rest at the camp restores health.
- **Safe start.** The camp hex and its six neighbours never hold a hazard. Worlds are generated from a seed string, so a seed gives a repeatable map (a daily seed for free).
- **A snag is deterministic at first**: thorny ground always snags, readable from its cue. A seeded roll per hex keeps maps repeatable and adds luck; later.
- **Anchors are found, not placed**, at first. Carrying a few stakes to place is a natural later addition.

A snag only costs something if turns cost something, otherwise being cut off is an inconvenience: a clock (supplies per turn, nightfall) or later moving predators supplies the pressure. This is the first thing to decide in play.

## 4. Cues: danger and reward without numbers

Minesweeper's clue is explicit and uniform. Here the clue is **idiomatic**, and the player learns the idiom. A sensed hex shows cues about its own contents and a weaker echo of what is on its neighbours. Two independent channels let danger and reward overlap:

| Channel | Idiom (first batch, from existing design-system parts) |
|---|---|
| Reward | a ring of mushroom sprites (food); a glint (cache); a worn path through scrub (ruin) |
| Danger | forest or grass turned badlands in patches (contamination near a barrel); a bug sprite (a nest); a thin column of smoke |
| Both | a glint inside scorched ground: something valuable that something else got to first |

Rules for cues:

- A cue is a *terrain variant or a small sprite on a sensed tile*, never text and never a count. Text appears only after entering a hex, as a journal line in the terminal type (VT323): a consequence, not a hint.
- Cues must differ in shape or lightness, not hue alone. The design system says status never travels by hue alone, and a game that hides information in hue would exclude some players.
- Cues are probabilistic at the edges: the same cue may come from several things, and later batches add decoys (a harmless ruin that looks like a nest). Start with one-to-one cues and add ambiguity as the variety grows.
- Every added cue kind is a row in a data table (§7), not code, so iterating on variety means editing data.

## 5. The graph

```
(:Hex {q, r, col, row, terrain, state, anchor, origin})   state: hidden | sensed | seen | path; anchor and origin are flags (the camp is both)
(:Hex)-[:ADJ]->(:Hex)                                       the lattice, six neighbours; one direction per pair, queried undirected
(:Thing {kind, danger, reward})-[:ON]->(:Hex)               ground truth: barrels, caches, nests; hidden from the client
(:Hex)-[:LOOSE {since}]->(:Hex)                             the thread being extended, from one anchor
(:Hex)-[:SECURED {since}]->(:Hex)                           a path between anchors
(:Player {at, health, waymarks})                            at is the id of the hex the explorer stands on
```

Hexes with a snag carry a `snag` flag, hidden until entered like any `Thing`.

The grid is 440 hexes (22 columns by 20 rows) at first, drawn at 3 screen pixels per lattice cell: in a 1440 by 900 window the whole board fits, the pixel art stays crisp and the towers and cues stay readable (at 2x the sprites get too small, and at 4x the board overflows). The client cache holds only what has been revealed; the rest exists only in the worker. Disclosure is a query result.

Queries, in openCypher. These are the first sketches; the statements in ADR-011 §2.5 supersede them (they add the trail edge, the waymark cost and a one-statement prune), and ADR-011 §2.2 corrects the asset split below: terrain painters are code to port, not data (the statements here are sketches; support for each pattern in the engine is to be confirmed, §10):

```cypher
// Extend: lay trail, reveal neighbours, and return the new cues
MATCH (h:Hex {q: $q, r: $r}) SET h.state = 'trail'
WITH h MATCH (h)-[:ADJ]-(n:Hex) WHERE n.state = 'hidden' SET n.state = 'sensed'
WITH n MATCH (n)-[:ADJ*0..1]-(m:Hex)<-[:ON]-(t:Thing)
RETURN n.q AS q, n.r AS r, m = n AS own, t.kind AS kind

// Prune: after deleting the TRAIL edge, find what lost its connection to the camp.
// First sketch: `*0..450`. ADR-011 §2.5 replaces it with `shortestPath`, which needs no bound
// (see "Checked against the engine").
MATCH (t:Hex {state: 'trail'})
WHERE NOT (t)-[:TRAIL*0..450]-(:Hex {origin: true})
RETURN t.q AS q, t.r AS r
```

### Checked against the engine

On 2026-11-10 the statements above were run, with a small seeded graph, against the engine built from `relate` at its `main` (`relate-cli` 0.1.0, in-memory store). Results:

| Pattern | Result |
|---|---|
| Extend: `SET` in a `WITH` chain, reveal of neighbours | Works. |
| Cue: `(n)-[:ADJ*0..1]-(m)<-[:ON]-(t)`, with `m = n AS own` | Works. |
| Orphan query as first written, `NOT (t)-[:TRAIL*]-(origin)` | **Wrong in two ways.** The camp itself is reported as orphaned (a `*` path needs one hop), and any trail hex more than 32 hops from the camp is falsely orphaned (an unbounded `*` stops at 32 hops, as `docs/limitations.md` says). In a 41-hex chain, hexes 33 to 40 were wrongly returned. |
| Orphan query with `*0..300` | Correct: returned only the unconnected loop. 300 is within the engine's default 500-hop bound for explicit lengths and above the 224 hexes of the map. |
| `shortestPath` between hexes in a `MATCH` | Works (5 hops on the seed); it has no hop cap. |
| Fixed-length loop, `(a)-[:TRAIL*3]-(a)`, and `*1..` back to the start | Work: a three-hex loop is found (counted once per direction). Loop detection is available. |
| `NOT EXISTS { MATCH p = shortestPath(...) }` as the orphan test | Returned nothing for a genuinely orphaned loop. **This was a mistake in the test, not the engine** (see the run below): the test also said `NOT t.origin`, and a hex with no `origin` property gives null, which drops the row. |

Run again on 2026-11-10 for the anchor and thread mechanic, on a durable store with bound parameters (strings and numbers, and an array bound from a file):

| Pattern | Result |
|---|---|
| Relationship-type alternation in a variable-length pattern, `[:LOOSE\|SECURED*0..450]` | Works. |
| `EXISTS { (h)-[:LOOSE\|SECURED*0..450]-(:Hex {anchor: true}) }` as a connected-to-an-anchor test | Works; false for a hex cut off by a snag. |
| A property map that refers to another variable, `(p:Hex {id: pl.at})` | Works. |
| Conditional edge creation: `FOREACH (_ IN CASE WHEN h.snag THEN [] ELSE [1] END \| CREATE ...)` | Works: a snag lays no edge and the player still moves. |
| Changing a relationship's type: `CREATE` the new one with the old one's property, then `DELETE` the old | Works. |
| Skip over secured paths, hasty retreat that deletes the loose thread, and prune over both types in one statement | Work. |

Run again on the same day against the engine commit the repository pins (`vendor/relate` at `31269e3`, Relate 0.16.1), with the revised statements of ADR-011 §2.5 in a scenario of a thread, a secure, a skip, a refused second thread, a snag, a step back, a reel-in, a hasty retreat and a prune. All behaved as described, except one pattern the engine rejects: a relationship cannot be created from a function call such as `startNode(r)` inside `FOREACH`, so securing is its own statement. A prune's list of orphans repeated a hex once per edge until `collect(DISTINCT ...)` was used.

With the board at 22 by 20 (440 hexes) the bound was raised to 450 and run at the pinned commit on a 440-hex chain: no orphans while intact, 220 when cut in half. A suggestion to use `shortestPath` instead was then tested on the same chain, with a detached three-hex loop added:

| Form | Result |
|---|---|
| `OPTIONAL MATCH p = shortestPath((t)-[:SECURED\|LOOSE*]-(c {origin: true}))` then `WHERE p IS NULL` | Correct (223 orphans: 220 cut off plus the loop), with no hop cap. |
| `NOT EXISTS { MATCH p = shortestPath(...) }` | Correct and the same count, once the guard is written `t.origin IS NULL`. The earlier failure was the `NOT t.origin` guard, not `shortestPath`. |
| The bounded form `*0..450` | The same count; slower (about 0.95 s against about 0.55 s per run, each including process start). |
| Camp tested against itself | `shortestPath` reports no path, so the camp must be excluded or compared first. |

The whole 25-step scenario (extend, secure, skip, retreat, prune and the rest) gave identical output with `shortestPath` as with the bounded forms. Reachability is therefore asked with `shortestPath` in ADR-011: it needs no bound, so the board size is no longer tied to the engine's 32-hop default for unbounded patterns or its limit of 500 for explicit ones.

One game-rule bug found by the first run: the snag hex was marked as path, so a later prune counted it as an orphan and refunded a waymark that the snag had lost. A snag hex is marked `seen` instead.

Not checked: performance, the engine as it runs in WebAssembly (the checks used the native build), and the `ADJ` direction convention (the seed stored one direction per pair and the queries matched undirected).

Neighbour counting is trivial in JavaScript and does not need the database. The graph earns its place in connectivity (what a prune orphans), reachability (what is next to the trail) and, later, loops and flow.

## 6. Look: three terrain styles as fidelity

The design system offers three looks on one lattice: `pixel` (HexMap), and `flat` and `facet` (HexField). Rather than a toggle, the game maps them to how much the player knows. Slice 1 changed two details. A hidden hex is **fog** (one flat colour) and does not show its terrain, because drawing hidden hexes in the flat look with their real colours would show the whole map (and the client must not hold the ground truth of a hex it has not discovered). And sensed hexes are drawn **flat**, not facet: in play the facet look was too close to the pixel look for a player to tell them apart without being told, while a plain colour reads at once as the same ground with less detail. Hexes the explorer has walked or seen are drawn in the pixel look. The facet look is ported and tested but not used yet.

The trail is drawn with the hex graph vocabulary: round node discs at junctions and camp, links between them, routed with the 60 and 120 degree elbows and the crossing tiles, with the cream casing so it stays legible on every terrain. Link weight can later show how often a branch is walked.

Where the game departs from the design system, on purpose:

- The design system says terrain never carries meaning alone and that no more than three features sit on one map. A game must let terrain and cues carry information and needs more features. The journal line after entry is the paired text.
- No text sits on terrain: labels live in a DOM layer beside the canvas.
- Pixel art is a margin device in the design system. Here it is the world, so this is a deliberate extension, and the design system's brand review (sprites, terrain, Archie) applies before a public release.
- Step, don't tween: two-frame animation and respect for reduced motion.

## 7. A separable library: structure and rules

The hex tiles, pixel art and graph overlay should be extractable into their own library with independent assets. RFC-005 §5.3 says to extract shared libraries when a second demo needs one. To honour both, the boundary is built now and the extraction happens later.

Three layers, none of which imports from the game:

| Layer | Contents | Depends on |
|---|---|---|
| **assets** | Data only: the palette generated from the design system's `tokens.json`; the sprite bitmaps as JSON; the legend (`D w s g f h m b`, features `T t R U`). | nothing |
| **core** | Pure functions: lattice geometry (offset, axial and cube coordinates, hex to pixel); the seeded pixel-terrain rasteriser; flat and facet polygon generators; overlay geometry (node discs, links in the arrow notation, elbows, crossings). Output is pixel buffers and draw lists. | assets |
| **phaser adapter** | Turns buffers into Phaser textures and draw lists into `Graphics`; nothing else. | core, Phaser |

The library speaks the design system's vocabulary (`rows`, `tiles`, `nodes`, `edges`, `pieces`, `pixel`, `look`), so a React page and a Phaser game describe a scene the same way. It knows nothing about Cypher, the graph model or the game's rules: the game turns query results into those props.

Mechanically, until a second consumer appears, this is a folder in the demo with a lint rule that forbids importing from the game, and a data-driven cue table (§4) that lives in the game, not in the library.

Two open items follow from this. The terrain and sprite drawing code lives today in the design system's React and SVG bundle, so extraction means choosing one source of truth: the library becomes the source and the bundle consumes it, or both are kept in step by golden-image tests. And per-tile `look` needs to exist in the library from the start.

## 8. Engine side

- **Database bridge.** The pattern from the survey: never await in the frame loop. Queries go to an outbox flushed once per frame, replies patch a plain cache, and the frame loop reads only the cache. Writes are applied to the cache first and confirmed by the reply.
- **Persistence.** The world seed, the trail and the revealed state persist as an application graph (the `application` option of `createClient`, ADR-009). Nothing but the seed needs to survive a reload if the world is regenerated from it, so the graph holds the player's state and the seed.
- **Sizing.** A few hundred nodes and edges is far below the engine's limits; nothing needs measuring until the map grows.

## 9. Prior art

- Fog of war and exploring a hidden hex map are the standard of hex strategy games; Minesweeper is progressive disclosure with explicit clues. Neither was searched for here beyond the general idea.
- Graph databases behind game logic: the Neo4j MMORPG Here Be Monsters modelled quest unlocks as relationships and found follow-ups with Cypher ([Yan Cui, 2013](https://theburningmonk.com/2013/09/here-be-monsters-updates-and-hello-neo4j/)); Gamesys used Neo4j to balance quests and monsters ([GraphConnect 2013](https://neo4j.com/blog/graph-database/gc13-gamesys-monsters)). Both are server-side; no shipped in-browser, embedded-graph game was found.
- Hex connection and network games (Hex, HeXaK, Railroad Ink, Via Nebula) are summarized in [Connection game](https://www.wikiwand.com/en/articles/Connection_game) and the [route and network building list](https://www.spielbound.org/game-tags/route-network-building?page=5).
- Hex coordinates and neighbours: Amit Patel's [Hexagonal Grids](https://redblobgames.com/grids/hexagons).
- Slime mould as network design (Tero and others, Science, 2010, reproducing something like the Tokyo rail network by reinforcing tubes that carry flow) inspired the trail mechanic. This is from memory and has not been checked.

These come from search results and were not opened; verify before citing in an RFC or ADR.

## 10. Open questions

- **Cue semantics.** Does a sensed hex's cue describe its own contents, its neighbours', or a blend? The sketch uses a blend (own plus a weaker neighbour echo); the right balance is found by playing.
- **A clock for the snag.** What makes being cut off costly: supplies per turn, nightfall, or predators.
- **The loose thread on a retreat.** Abandoned with its waymarks lost is the sharper trade; refunding it makes a retreat free.
- **Why prune.** If waymarks do not make pruning feel meaningful, what does (exposure, sealing, retreat)?
- **Consequence.** Health and a return to camp is the simplest failure. It may be too punishing or too soft.
- **Character.** A generic explorer, or Archie as the camp's guide? The design system allows one Archie per view and says he never carries meaning alone.
- **Engine support.** Checked on the native build (§5): the patterns work, and reachability uses `shortestPath`. The WebAssembly build was checked too: the statements are tested against it in Node (`demos/phaser-path-explorer/tests/statements.test.ts`).
- **Process.** RFC-005 gives each demo a slim ADR. This note became ADR-011 (`design/adr/ADR-011-phaser-path-explorer.md`), with the library boundary of §7 as its main decision.
- **Brand.** Terrain, sprites and Archie need Neo4j brand-team review before a public demo.

## 11. Order of work

Progress: slices 0 (a world in the graph), 1 (disclosure and the bridge) and 2 (the thread: extend, reel in, step, skip, secure, anchors) are built; see `demos/phaser-path-explorer/README.md`.

1. Library skeleton and assets: lattice geometry, palette from `tokens.json`, pixel terrain rasteriser, a static map in the Phaser adapter.
2. Overlay and per-tile look: node discs, links, elbows, and the hidden, sensed and seen states.
3. The world and the bridge: seeded generation with the safe start, the graph seeding, outbox and cache.
4. The verbs: extend, branch and prune, with the reveal and orphan queries.
5. Cues: the data table, a first batch of three idioms, the journal line on entry.
6. Persistence through application mode, then variety: more cues, decoys, then predators.
