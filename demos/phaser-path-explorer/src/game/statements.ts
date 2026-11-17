// The game's verbs as statements (ADR-011, 2.5, amended 2026-11-16: the waymarker expedition). Each verb is one
// statement, so each is atomic; values are bound parameters. tests/statements.test.ts runs every one against the
// real engine in WebAssembly.
//
// The economy: a day is a budget of steps ($budget refills it when the day ends). Moving costs one step — extending,
// stepping, reeling in, travelling between anchors. A waymarker is placed on the hex the explorer stands on: the path
// from the previous anchor is secured, and a new path can grow from that waymarker with the steps still remaining.
// When the steps run out, or the player ends the day, the explorer returns to the camp, the loose path is abandoned
// and everything the secured network does not disclose fogs over. The camp and the towers are fixed anchors (the
// towers carry a `tower` flag); arriving on a tower secures the path but does not end the day.
//
// Reachability uses `shortestPath`, which has no hop cap. It needs two distinct nodes, so the hex being tested is
// compared with the target first. A flag that is absent is null, so statements use IS NULL or coalesce.

/**
 * Extend the path one hex. $to: the target hex id, $now: a counter for `since`. The target may be unexplored or
 * remembered ground, or a hex already on a path (the path then crosses it); it may not touch the path itself.
 * Costs one step. A cache on the entered hex is found once: its marker is taken (the ON edge is removed, so it
 * cannot be found twice) and one waymarker is gained.
 */
export const EXTEND = `
MATCH (pl:Player {id: 'player'}), (p:Hex {id: pl.at})-[:ADJ]-(h:Hex {id: $to})
WHERE h.state IN ['viewed', 'sensed', 'seen', 'path'] AND pl.steps >= coalesce(h.cost, 1)
  AND NOT EXISTS { (h)-[:LOOSE]-(:Hex) }
  AND ( (p.anchor AND NOT EXISTS { (:Hex)-[:LOOSE]->(:Hex) })
        OR (EXISTS { (:Hex)-[:LOOSE]->(p) } AND NOT EXISTS { (p)-[:LOOSE]->(:Hex) }) )
CREATE (p)-[:LOOSE {since: $now}]->(h)
SET h.state = 'path', h.mapped = CASE WHEN h.tower = true THEN true ELSE h.mapped END,
    pl.steps = pl.steps - coalesce(h.cost, 1), pl.at = h.id
WITH h, pl
OPTIONAL MATCH (t:Thing {kind: 'cache'})-[o:ON]->(h)
DELETE o
WITH h, pl, count(o) AS caches
SET pl.markers = pl.markers + caches
WITH h, pl, caches
OPTIONAL MATCH (h)-[:ADJ]-(n:Hex) WHERE n.state = 'hidden'
SET n.state = 'sensed'
RETURN h.id AS id, coalesce(h.anchor, false) AS anchor, pl.steps AS steps, pl.markers AS markers,
       caches AS caches, collect(n.id) AS sensed`;

/** Secure: at the head of the path on an anchor (a tower, or the camp), every loose edge becomes secured. Matches nothing otherwise. */
export const SECURE = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at, anchor: true})
WHERE EXISTS { (:Hex)-[:LOOSE]->(h) }
MATCH (a:Hex)-[r:LOOSE]->(b:Hex)
CREATE (a)-[:SECURED {since: r.since}]->(b) DELETE r
RETURN count(r) AS secured`;

/**
 * Place a waymarker on the hex the explorer stands on, without ending the day. Requires a waymarker to spend, the
 * hex not to be an anchor already, and the explorer to be at the head of the day's path. The loose path becomes
 * secured; the explorer and the remaining steps stay where they are, ready for a new path from this anchor.
 */
export const PLACE_WAYMARKER = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at})
WHERE pl.markers > 0 AND h.anchor IS NULL
  AND NOT EXISTS { (h)-[:LOOSE]->(:Hex) }
MATCH (prev:Hex)-[:LOOSE]->(h)
SET h.anchor = true, pl.markers = pl.markers - 1
WITH pl, h
MATCH (a:Hex)-[r:LOOSE]->(b:Hex)
CREATE (a)-[:SECURED {since: r.since}]->(b) DELETE r
WITH pl, h, count(r) AS secured
RETURN h.id AS waymark, secured AS secured, pl.at AS at, pl.steps AS steps, pl.markers AS markers`;

/**
 * End the day: the steps ran out. The loose path is abandoned, the explorer returns to the camp, the steps refill,
 * and everything the secured network does not disclose fogs over: a hex stays known only if it lies on a secured
 * path, is the camp, or neighbours such a hex (as sensed); every other hex becomes hidden again. Answers with the
 * ids that were fogged, so the client's cache can drop them. Each night the robot gains a part ($part, numbered $n), and the
 * game is over when $last says it was the seventh. $budget: the day's step budget.
 */
export const END_DAY = `
MATCH (pl:Player {id: 'player'}), (home:Hex {origin: true})
OPTIONAL MATCH (a:Hex)-[r:LOOSE]->(b:Hex) DELETE r
WITH pl, home, count(r) AS lost
OPTIONAL MATCH (x:Hex)
  WHERE x.state IN ['viewed', 'sensed', 'seen', 'path'] AND x.origin IS NULL
    AND NOT EXISTS { (x)-[:SECURED]-() }
WITH pl, home, lost, collect(DISTINCT x.id) AS fogged
MATCH (y:Hex) WHERE y.id IN fogged OR y.id = home.id
SET y.state = CASE WHEN y.id IN fogged THEN 'hidden' ELSE y.state END
WITH DISTINCT pl, home, lost, fogged
MATCH (k:Hex) WHERE k.origin IS NOT NULL OR EXISTS { (k)-[:SECURED]-() }
OPTIONAL MATCH (k)-[:ADJ]-(n:Hex) WHERE n.state = 'hidden'
SET n.state = 'sensed'
WITH DISTINCT pl, home, lost, fogged
MATCH (rb:Robot)
CREATE (rb)-[:HAS]->(:Part {kind: $part, n: $n})
WITH DISTINCT pl, home, lost, fogged
SET pl.at = home.id, pl.steps = $budget, pl.over = CASE WHEN $last THEN true ELSE pl.over END
RETURN pl.at AS at, pl.steps AS steps, lost AS lost, fogged AS fogged`;

/** Step one hex over known ground (on a path, or remembered); lays no path of its own. Costs one step. */
export const STEP = `
MATCH (pl:Player {id: 'player'}), (p:Hex {id: pl.at})-[:ADJ]-(h:Hex {id: $to})
WHERE h.state IN ['seen', 'path'] AND pl.steps >= coalesce(h.cost, 1)
SET pl.at = h.id, pl.steps = pl.steps - coalesce(h.cost, 1)
RETURN pl.at AS at, pl.steps AS steps`;

/** Reel in: the explorer at the head of the path steps back and takes the last loose edge in. Costs one step; a hex on a secured path stays on it. */
export const REEL_IN = `
MATCH (pl:Player {id: 'player'}), (prev:Hex)-[r:LOOSE]->(p:Hex {id: pl.at})
WHERE NOT EXISTS { (p)-[:LOOSE]->(:Hex) } AND pl.steps > 0
DELETE r
SET p.state = CASE WHEN EXISTS { (p)-[:SECURED]-(:Hex) } THEN 'path' ELSE 'seen' END,
    pl.steps = pl.steps - 1, pl.at = prev.id
RETURN pl.at AS at, pl.steps AS steps`;

/** Is the explorer connected to an anchor? */
export const TETHERED = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at})
RETURN (coalesce(h.anchor, false)
        OR EXISTS { MATCH p = shortestPath((h)-[:LOOSE|SECURED*]-(:Hex {anchor: true})) }) AS tethered`;

/**
 * Travel between anchors joined by secured paths, for one step instead of one per hex. Refused while a path is in
 * play (an unsecured path must be banked with a waymarker or abandoned at the end of the day). $to: the target anchor.
 */
export const TRAVEL = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at, anchor: true}), (t:Hex {id: $to, anchor: true})
WHERE pl.steps > 0 AND NOT EXISTS { (:Hex)-[:LOOSE]->(:Hex) }
  AND (h = t OR EXISTS { MATCH p = shortestPath((h)-[:SECURED*]-(t)) })
SET pl.at = t.id, pl.steps = pl.steps - 1
RETURN pl.at AS at, pl.steps AS steps`;

/**
 * The win, one row per tower: is it joined to the camp by secured paths? Won when every row says joined (two
 * towers, per the seed's guarantee).
 */
export const TOWERS = `
MATCH (home:Hex {origin: true}), (t:Hex {tower: true})
RETURN t.id AS id, EXISTS { MATCH p = shortestPath((home)-[:SECURED*]-(t)) } AS joined`;

/** Cue source for sensed hexes. $ids: a list of hex ids. Deferred with the cue mechanics (ADR-011, 2.5); kept as the starting point. */
export const CUE_SOURCE = `
MATCH (n:Hex) WHERE n.id IN $ids
MATCH (n)-[:ADJ*0..1]-(m:Hex)<-[:ON]-(t:Thing)
RETURN n.id AS id, m = n AS own, t.kind AS kind`;

// --- reads. A hidden hex gives away nothing but its place: terrain, feature and anchor come back null (ADR-011, 2.3). ---

const HEX_FIELDS = `
  h.id AS id, h.col AS col, h.row AS row, h.state AS state,
  CASE WHEN h.state = 'hidden' THEN null ELSE h.terrain END AS terrain,
  CASE WHEN h.state = 'hidden' THEN null ELSE h.feature END AS feature,
  CASE WHEN h.state = 'hidden' THEN false ELSE coalesce(h.anchor, false) END AS anchor,
  CASE WHEN h.state = 'hidden' THEN null ELSE coalesce(h.cost, 1) END AS cost,
  coalesce(h.mapped, false) AS mapped`;

/** The whole board as the player may know it. */
export const READ_BOARD = `MATCH (h:Hex) RETURN ${HEX_FIELDS}`;

/** Some hexes, as the player may know them. $ids: a list of hex ids. */
export const READ_HEXES = `MATCH (h:Hex) WHERE h.id IN $ids RETURN ${HEX_FIELDS}`;

export const READ_PLAYER = `MATCH (pl:Player {id: 'player'}) RETURN pl.at AS at, pl.steps AS steps, pl.markers AS markers, coalesce(pl.over, false) AS over`;

/** The robot's parts so far, in the order they were added: the days that have passed. */
export const READ_PARTS = `MATCH (:Robot)-[:HAS]->(p:Part) RETURN p.kind AS kind, p.n AS n ORDER BY p.n`;

/** Waymarkers placed: anchors that are neither the camp nor a tower. */
export const MARKERS_USED = `MATCH (h:Hex) WHERE h.anchor = true AND h.feature IS NULL RETURN count(h) AS markers`;

/** The game is over: every settlement is routed, or the last night has fallen. */
export const GAME_OVER = `MATCH (pl:Player {id: 'player'}) SET pl.over = true RETURN pl.over AS over`;

/** The path and the secured routes, for drawing. */
export const READ_EDGES = `MATCH (a:Hex)-[r:LOOSE|SECURED]->(b:Hex) RETURN a.id AS from, b.id AS to, type(r) AS kind`;

// --- undo: put the graph back as a snapshot of the cache says it was. One level, so the statements are a short
// fixed sequence; each is bounded and safe to run again. ---

/** Remove every path edge, loose or secured. */
export const UNDO_CLEAR_EDGES = `MATCH ()-[r:LOOSE|SECURED]->() DELETE r RETURN count(r) AS n`;
/** Lay the loose path back. $edges: [{from, to}]. */
export const UNDO_LOOSE = `UNWIND $edges AS e MATCH (a:Hex {id: e.from}), (b:Hex {id: e.to}) CREATE (a)-[:LOOSE {since: 0}]->(b) RETURN count(*) AS n`;
/** Lay the secured paths back. $edges: [{from, to}]. */
export const UNDO_SECURED = `UNWIND $edges AS e MATCH (a:Hex {id: e.from}), (b:Hex {id: e.to}) CREATE (a)-[:SECURED {since: 0}]->(b) RETURN count(*) AS n`;
/** Put back what the explorer knows of each changed hex. $rows: [{id, state, anchor: true | null, mapped: true | null}]. */
export const UNDO_HEXES = `UNWIND $rows AS x MATCH (h:Hex {id: x.id}) SET h.state = x.state, h.anchor = x.anchor, h.mapped = x.mapped RETURN count(h) AS n`;
/** Put the explorer, the steps and the waymarkers back. */
export const UNDO_PLAYER = `MATCH (pl:Player {id: 'player'}) SET pl.at = $at, pl.steps = $steps, pl.markers = $markers RETURN pl.at AS at`;

/** Take the robot's parts back out, and put them back as they were. $parts: [{kind, n}]. */
export const UNDO_CLEAR_PARTS = `MATCH (:Robot)-[:HAS]->(p:Part) DETACH DELETE p RETURN count(p) AS n`;
export const UNDO_PARTS = `UNWIND $parts AS x MATCH (rb:Robot) CREATE (rb)-[:HAS]->(:Part {kind: x.kind, n: x.n}) RETURN count(*) AS n`;

/** The whole board as it is, hidden or not: for the reveal when the game ends. */
export const READ_TRUTH = `
MATCH (h:Hex)
RETURN h.id AS id, h.col AS col, h.row AS row, h.state AS state, h.terrain AS terrain, h.feature AS feature,
       coalesce(h.anchor, false) AS anchor, coalesce(h.cost, 1) AS cost`;

/**
 * The signposts: from every settlement the explorer has arrived at (and from the camp), the way to each settlement within
 * a day's walk that has not been reached. Only the axial difference comes back, never where the settlement is.
 */
export const READ_SIGNPOSTS = `
MATCH (a:Hex)-[:NEAR]->(b:Hex)
WHERE a.mapped = true AND b.tower = true AND b.mapped IS NULL
RETURN a.id AS at, b.q - a.q AS dq, b.r - a.r AS dr`;

/**
 * The field of view (ADR-011, amended): wherever the explorer stands, the six hexes around it are viewed (hidden or sensed
 * ground becomes viewed: seen in full, with its features, but still reached by extending the path, not stepped onto) and
 * the ring beyond them is sensed. Answers with both sets, so the client's cache can read them.
 */
export const VIEW_AROUND = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at})
OPTIONAL MATCH (h)-[:ADJ]-(n:Hex) WHERE n.state IN ['hidden', 'sensed']
SET n.state = 'viewed'
WITH h, collect(DISTINCT n.id) AS viewed
OPTIONAL MATCH (h)-[:ADJ]-(:Hex)-[:ADJ]-(m:Hex) WHERE m.state = 'hidden'
SET m.state = 'sensed'
RETURN viewed, collect(DISTINCT m.id) AS sensed`;

// --- the demo behind the splash: a throwaway world where the explorer wanders with a lantern (not part of the game) ---

/** Move the demo's explorer. $to: a hex id. */
export const DEMO_AT = `MATCH (pl:Player {id: 'player'}) SET pl.at = $to RETURN pl.at AS at`;

/** Put the fog back on every hex that is not in $ids. */
export const DEMO_DARKEN = `MATCH (h:Hex) WHERE NOT h.id IN $ids AND h.state <> 'hidden' SET h.state = 'hidden' RETURN count(h) AS n`;

/** Light some hexes. $ids: hex ids; $state: 'viewed' (in sight) or 'sensed' (the dimmed ring beyond). */
export const DEMO_LIGHT = `MATCH (h:Hex) WHERE h.id IN $ids SET h.state = $state RETURN count(h) AS n`;
