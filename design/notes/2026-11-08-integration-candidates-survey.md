# Integration candidates beyond the web frameworks: survey for the hackathon

This note records a survey, run on 2026-11-08, of third-party libraries that RelateDB (relate, the embedded openCypher property-graph engine this repository integrates with web frameworks) could ship starters or helpers for, ahead of a launch hackathon. Next, SvelteKit and Observable Framework are done (`packages/`); the relate core team is covering common UI components and agent integration. This survey covers what they are not: games, third-party graph visualization, geospatial visualization, and the building blocks of do-it-yourself SaaS apps (datagrids, admin frameworks, editors). Headless CMS integrations were dropped at the outset. The note binds no decision; a choice among these would go through an RFC or, for small helpers, straight to a spec.

## 1. How reliable this is

Six research agents surveyed one area each. Three kinds of claim appear below and are labeled:

- **Verified**: npm weekly downloads (from the npm API, week of 2026-11-01 to 11-07), GitHub stars and last-push dates (GitHub API), and claims about the engine read from `/Users/abk/Developer/relatedb/relate`. Where a figure comes from a search snippet or an aggregator page, that is said.
- **Unverified**: release dates, rendering-scale limits, licence details read from third-party summaries, exact library interface shapes recalled from memory, and everything about runtimes the engine docs do not mention. Prices and licence terms move; check them before shipping.
- Two spot checks were made by hand: the engine really has points only (§3.4), and the engine's own WASM playground depends on NVL (§3.1).

## 2. What a "starter" is here

The surveys separated three kinds of work, which differ a great deal in cost:

| Kind | Needs | Examples |
|---|---|---|
| Result transform | A function from query results to a library's data model | graph viz, datagrids, map layers |
| Provider/contract | An implementation of a small, stable interface a framework already defines | an admin data provider |
| Pattern kit | A runnable app and a recipe for one awkward problem | games, the editor starter |

Only a few of these are packages in the sense `@relate/sveltekit` is. Most are small helpers plus a template app.

## 3. Findings by area

### 3.1 Graph visualization

| Library | npm/week | Stars | Licence | Needs from us | Verdict |
|---|---|---|---|---|---|
| Cytoscape.js | 26.0M | 11.3k | MIT | `{data:{id,label}}` elements; no layout step | First |
| Sigma.js + graphology | 773k | 12.2k | MIT | A graphology `Graph` with x/y per node, so a layout step | Second |
| force-graph / 3d-force-graph | 1.5M / 0.6M | 2.2k / 6.5k | MIT | `{nodes, links}`; the library mutates the objects, so pass copies | Third |
| xyflow (React Flow) | 20.6M | 38.9k | MIT | nodes with positions; no layout engine | Fourth; suits node editors and schema views, not a graph browser |
| vis-network | 1.1M | 3.6k | Apache-2.0 or MIT | DataSet of nodes and edges, built-in physics | Viable, no need to lead |
| AntV G6 | 321k | 12.4k | MIT | `{nodes, edges}`; many layouts | Viable |
| Reagraph | 104k | 1.1k | Apache-2.0 | React only | Skip for now |
| NVL (`@neo4j-nvl/base`) | 28k | repo not found | Custom ("SEE LICENSE IN LICENSE.txt") | `nodes`, `relationships` | **Hold: licence unclear** |
| d3-force | 36.8M | 2.0k | ISC | layout only | Ship as a helper that supplies x/y |

- Nothing here blocks on an asynchronous, worker-hosted data source; data is pushed in after an `await`. The friction is coordinates (Sigma and xyflow need a layout step) and mutation (force-graph).
- Expanding a node's neighbours is incremental in Cytoscape, Sigma/graphology, vis-network and NVL, and re-render-from-state in force-graph and xyflow.
- **NVL.** The engine's own WASM playground depends on it (`examples/wasm-playground/package.json`, `@neo4j-nvl/*` ^1.2.0). The agent could not read NVL's licence terms; one third-party registry says LPL-1.02 and an unofficial guide says Neo4j-products-only (both unverified). If the terms restrict use to Neo4j, that matters for the playground and for any starter. This needs a direct answer from Neo4j's side, not a guess.
- Practical scale limits (a few thousand nodes for canvas, tens of thousands for WebGL) are estimates; measure before promising numbers.
- Commercial options (Ogma, KeyLines/ReGraph) and Cosmograph (GPU, very large graphs) were noted, not studied.

### 3.2 Games

| Engine | npm/week | Notes |
|---|---|---|
| Phaser | 816k | v4 is stable per phaser.io; the import form changed (`import Phaser from 'phaser'` no longer works); MIT; typed |
| PixiJS | 1.83M | renderer, not a framework |
| Three.js (+ react-three-fiber) | 34.6M | 3D renderer; useful for 3D graph views |
| Babylon.js | 376k | full 3D engine |
| PlayCanvas | 178k | |
| Excalibur | 20.8k | TypeScript-first, ECS |
| Kaplay (ex-Kaboom) | 9.7k (+3.1k `kaboom`) | very beginner-friendly; v3001 stable, v4000 in alpha |
| melonJS | 1.9k | niche |
| rot.js (`rot-js`) | 6.4k | roguelike toolkit; BSD-3-Clause; ~2.7k stars; latest 2.2.1 (2024-11-13), the release before it 2021-07-21; repo not archived (added later, §3.2.1) |

Phaser is the main starter by audience; Kaplay is the low-friction second for short jams. No per-engine jam statistics were found (js13k mostly uses raw canvas or tiny libraries; Phaser sponsors js13k). Godot and Bevy web exports can reach a worker-hosted database only through fiddly interop and long builds; they were set aside (Bevy has its own note, `2026-11-08-bevy-integration.md`).

**The pattern** is the real deliverable, and it is a recommendation, not a finding from sources: never await inside the frame loop; push `{id, cypher, params}` onto an outbox flushed once per frame or tick; resolve replies into typed events through the engine's emitter; let the frame loop read only a plain-JS cache that results patch; separate authoritative writes (applied to the cache optimistically), reads prefetched on scene entry, and slow analytics shown as "thinking"; batch statements per round trip and never block input on a reply.

**Starter ideas that use Cypher, not just storage**: a quest and dialogue graph RPG (next-available choices, unfinished prerequisite chains); a social-sim village (gossip as a two-hop traversal); a crafting and tech tree (recipes whose inputs are all held; transitive unlocks); a roguelike map graph (shortest key-to-door path, unreachable rooms, loops); a detective mystery (the suspect with no alibi edge); a procedural world and faction war (influence spread by traversal). Prior art found: a dialogue-as-graph paper on Outer Worlds, a Godot quest-graph editor with optional Neo4j storage, a thesis on graph data for NPC acting.

#### 3.2.1 rot.js: a turn-based starter (added after the survey)

A side conversation proposed rot.js, which the games survey had not covered. Checked on 2026-11-08 against the npm registry, the GitHub API and the published 2.2.1 package's type declarations:

- **Maintenance.** Stable and quiet, not abandoned: 6,369 downloads last week, 2.7k stars, BSD-3-Clause, not archived. The last release was 2.2.1 on 2024-11-13, two years ago, and the one before it was 2.2.0 in July 2021. A small ASCII toolkit that changes rarely suits a pinned hackathon starter, but there should be no expectation of fixes; it is far smaller than Phaser.
- **Turn loop.** `Engine` has `lock()` and `unlock()` ("when this call returns, the loop is locked"), and the scheduler hands out actors with `next()`. An actor's turn can therefore wait on a worker query and call `unlock()` when the reply arrives. This replaces the outbox-and-cache workaround that a frame-based engine needs. The type declarations confirm the methods exist; the behaviour with a promise pending was not run.
- **Graph shape.** `Digger` and `Uniform` extend `Dungeon`, which has `getRooms()` and `getCorridors()`; a `Room` has `getDoors()` and `getCenter()`. Rooms, corridors and doors map to nodes and edges, so Cypher can answer shortest key-to-door paths, unreachable rooms and loops (the roguelike-map idea in the list above). rot.js also ships A* and Dijkstra with unit edge costs, FOV, a display with ASCII and tile backends, and a seedable RNG, which makes demo worlds reproducible.
- **Fit.** A good "turn-based" companion to Phaser and Kaplay: no art needed, small games with graph-driven mechanics (relationships, factions, dialogue, crafting). Graph-backed rooms and doors should live in the database, with rot.js doing display and field of view over a local array rebuilt from it.

### 3.3 Datagrids, and admin frameworks

| Grid | npm/week | Licence | Remote data model |
|---|---|---|---|
| TanStack Table (headless) | 35.3M (react-table) | MIT | `manualSorting`, `manualFiltering`, `manualPagination`; state is plain arrays |
| AG Grid | 5.66M (community) | Community MIT; server-side row model, grouping and aggregation are Enterprise (about $999 per developer per year per a search snippet) | community: infinite row model (sort and filter only) |
| MUI X Data Grid | 4.28M | Community MIT; Pro/Premium paid; which tier has the server-side data source is unverified | `getRows` receives sort, filter and pagination models |
| Glide Data Grid | 770k | MIT | none; you supply cells and a row count |
| Handsontable | 372k | non-commercial or paid, terms in flux | none |
| Tabulator | 253k | MIT | built-in remote pagination and filtering |
| Perspective (FINOS) | 17k | Apache-2.0 | its own WASM engine; Arrow-native |

The valuable piece is a **grid-state-to-Cypher translator**: inputs are a column spec (id, type, a node property or a relationship path with an aggregate, sortable/filterable), a base pattern such as `MATCH (n:Customer)`, and the grid state normalised to sort, a filter tree, a range and group keys; outputs are a data query, a count query, parameters and a row mapper. Sort maps to `ORDER BY`, filters to `WHERE`, ranges to `SKIP`/`LIMIT`; filters on aggregates go after the aggregating `WITH`; filters on a related property use `EXISTS { MATCH … }`. Column ids must be whitelisted against the declared spec and values bound as parameters, so no user text becomes a Cypher identifier. Total counts need a second query. The interface shapes in the report (AG Grid's server-side request, TanStack's state) were recalled from memory and need checking against the API references. Recommended: TanStack Table first (widest reach, no licence issue), AG Grid Community second (translator written against the richer request shape). Perspective over Arrow is a later "explore this result" widget; it duplicates relate's own work and is poor for editing.

| Admin framework | Stars | Licence | Contract |
|---|---|---|---|
| react-admin | ~27k | MIT (optional paid modules) | nine-method data provider; flat filter object, provider defines operator conventions; references are foreign-key fields |
| Refine | ~35k | MIT | structured filters (`{field, operator, value}`, nested or/and); no `getManyReference`; maintenance in late 2026 unverified (repo showed last update Nov 2025) |
| NocoDB, Baserow, Budibase, Appsmith, ToolJet | various | copyleft, source-available or paid in places | standalone products with SQL or REST backends; cannot embed a worker-hosted graph |

A react-admin data provider over a graph is the best return of anything surveyed for a DIY-SaaS pitch: the contract is small and stable, and `ReferenceField`, `ReferenceInput` and `ReferenceManyField` render relationships almost for free. Estimate (the agent's): a minimal provider is 1–2 days (about 300 lines); a reusable schema-driven helper with per-resource configuration 3–5 days. The hard part is the relationship mapping (foreign-key field versus edge, direction, stable ids), not CRUD. Every node needs a stable `id` property; the engine's internal ids may be reused. Many-to-many relationships and relationship properties do not fit the foreign-key model, so a demo should avoid them. Errors need mapping into the framework's error shape.

### 3.4 Editors

| Editor | Licence | Notes |
|---|---|---|
| BlockNote | core MPL-2.0; `@blocknote/xl-*` (AI, multi-column, exporters) GPL-3.0 or commercial | React only; Yjs built in; custom blocks, inline content and suggestion menus; ~10.4k stars. Its own pages and an older release note disagree on GPL versus AGPL |
| Tiptap | core MIT; Hocuspocus (collaboration server) MIT; cloud services paid | React, Vue, vanilla; mention/suggestion utilities; prices reported inconsistently |
| CodeMirror 6 | MIT (unverified) | Markdown source editing; decorations and async completion for `[[` |
| Milkdown | MIT (unverified) | Markdown as native format, Yjs plugin |
| Lexical, Plate, Novel, Yoopta, Editor.js | various | Plate and Novel are React-only; Editor.js is weak on inline nodes and collaboration |

Recommended starter: BlockNote core only (never import an `xl-*` package, which would make the starter GPL-3.0; a CI check on imports would hold that line), Tiptap as the fallback and the choice for Vue or Svelte, CodeMirror 6 for a Markdown-source variant. No Obsidian-like app built on BlockNote or Tiptap was found; a GitHub search for `blocknote wikilink` and `tiptap backlinks` is the next step.

**Document-to-graph mapping (a sketch from the survey, not tested).** One `Doc` node per document (id, title, updated time, embedding, and the editor's JSON as the source of truth). The graph is a rebuildable projection: on a debounced save, delete the document's derived edges and recreate them. `[[wikilink]]` becomes `LINKS_TO` (an unresolved target creates a stub `Doc`, giving backlinks and unlinked mentions); `@mention` becomes `MENTIONS`; `#tag` becomes `TAGGED`; transclusion becomes `EMBEDS`. Only blocks that are link targets, transcluded or database rows need to be nodes. A live-query block stores its Cypher in block properties and re-runs in the worker. Database-view rows are `Doc` nodes with typed properties and relations as edges; rollups are Cypher aggregates. Blocks are ordered with fractional-index ranks. Hardest problems named: moves that keep block ids and transclusion edges, one writer per fact (editor versus database), undo (deriving the graph from the document makes it free for editor edits), rename propagation (link by id, not title), and collaboration with a derived index (each client re-derives, or one authority writes).

### 3.5 Geo

Spot-checked: the engine supports **points only**. `docs/guides/geospatial-queries.md` states "The Cypher dialect has points only", with `point()` in WGS-84 and cartesian forms, `point.distance()`, `point.withinBBox()`, and a `POINT INDEX` (an R-tree used only for those two predicate shapes). A tested recipe exists at `docs/cookbook/nearby-places.md`. There are no geometry types, no line or polygon values, no GeoJSON functions and no GeoArrow output; the guide says to keep GeoJSON as a string and do geometry in the host language (an earlier design note records that geometry types were dropped, ADR-0497). Whether points and the point index work in the WASM build is unverified: the WASM spec does not mention spatial support. This corrects an earlier assumption in this project that Arrow and WKB handling implied richer spatial support.

A deck.gl or MapLibre demo is cheap for point layers (return longitude and latitude, filter by the viewport's bounding box so the index helps) and edges can be drawn as lines in the client. Polygons would be parsed in the browser. The agent's judgment, which this note adopts: a thin piece of glue, about a day, and a weaker showcase of the engine than the other areas. Build it as an example page inside another starter, not as an integration of its own.

### 3.6 Server-side routes (the choice that shapes the SaaS kits)

Documented in the engine's docs: connections in one process share a database, reads are MVCC snapshots, writes serialize at the log append; a durable store takes an exclusive writer lease, so there is **one writer process per store**; the `relate serve` binary exposes Bolt, HTTP and MCP with a **single shared credential** (no per-user or per-tenant authentication) and has no TLS of its own, so it needs a proxy; the Docker image is described as a development and test image. The native Node package (`@relate/relate`, koffi over the C ABI) has prebuilt packages for macOS (arm64, x64), Linux (arm64, x64) and Windows x64.

| Runtime | What works | Basis |
|---|---|---|
| Long-lived Node or container, native package | Full: durable store, concurrent connections, transactions | Documented |
| `relate serve` behind a proxy | Multi-user app, one writer | Documented |
| Vercel or Lambda, native package | Plausible only with the shared library bundled for the right architecture; in-memory or read-only data; durable writes unsafe across instances | Inference; no source found |
| Vercel or Lambda calling a separate `relate serve` | A normal client of a long-lived server | Inference |
| Cloudflare Workers, native package | No (no native libraries) | Inference |
| Cloudflare Workers or Durable Objects, WASM | In-memory plausible; the engine's browser file store is dedicated-worker only, so persistence would be hand-rolled snapshots | Inference; needs an experiment |
| Deno or Bun, WASM | Likely in-memory | Inference |

Consequences for the kits: a shared-data SaaS app needs one long-lived process per store, and the application server must hold the credential and do tenant checks itself. A browser-only (local-first) kit avoids all of this and fits personal tools, the editor starter and the admin demo. Open experiments: whether the point functions run in the WASM build and what a point looks like in WASM output; whether the native package loads on Vercel or Lambda; whether the WASM module imports on Workers; the cost of saving and restoring a snapshot per tenant; whether Bun and Deno run koffi and the WASM build unchanged.

## 4. A first-batch proposal (not decided)

Ranked by time to an impressive demo, reach and how little it depends on unresolved questions:

1. **react-admin data provider** (provider/contract): a small package plus a three-entity demo with a live Cypher panel. Local-first first.
2. **Graph visualization helpers** (result transform): Cytoscape.js, Sigma.js with graphology, force-graph, plus a d3-force layout helper; xyflow for schema and node-editor apps. NVL only after its licence is answered.
3. **Notion-style editor starter** (pattern kit): BlockNote core, with the document-to-graph mapping above, backlinks and a live-query block; the grid below for database views.
4. **TanStack Table with the grid-to-Cypher translator** (result transform), written so AG Grid can adopt the same translator later.
5. **Phaser starter** (pattern kit) with the query-between-frames pattern, and one or two of the Cypher-heavy game ideas; Kaplay as a short-jam variant, and rot.js as the turn-based variant (§3.2.1) where the async query needs no frame-loop workaround.
6. **Geo**: one example page with points on MapLibre, after the WASM check.

Nuxt stays deferred; the framework-agnostic helpers above reach Vue users without it.

## 5. Open questions

- Whether NVL's licence permits non-Neo4j use, and what that means for the playground.
- Whether the first batch is local-first only, or includes a server-backed kit (a container running `relate serve` behind the application server).
- Where the starters live: here, or in the website repository.
- Which items get an RFC and ADR, and which are lighter recipes; the translator and the data provider are the two with real interface design.
- Whether Refine is worth supporting at all, given its unverified maintenance status.
