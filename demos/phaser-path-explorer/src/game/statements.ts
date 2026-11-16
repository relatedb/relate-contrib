// The game's verbs as statements (ADR-011, 2.5, amended 2026-11-16: the waymarker expedition). Each verb is one
// statement, so each is atomic; values are bound parameters. tests/statements.test.ts runs every one against the
// real engine in WebAssembly.
//
// The economy: a day is a budget of steps ($budget refills it). Moving costs one step — extending, stepping,
// reeling in, travelling between anchors. A waymarker is placed on the hex the explorer stands on: the path from
// the previous anchor is secured, the day ends and the explorer returns to the camp. When the steps run out the
// day ends the same way, but the loose path is abandoned and everything the secured network does not disclose
// fogs over. The camp and the towers are fixed anchors (the towers carry a `tower` flag); arriving on a tower
// secures the path but does not end the day.
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
WHERE h.state IN ['sensed', 'seen', 'path'] AND pl.steps > 0
  AND NOT EXISTS { (h)-[:LOOSE]-(:Hex) }
  AND ( (p.anchor AND NOT EXISTS { (:Hex)-[:LOOSE]->(:Hex) })
        OR (EXISTS { (:Hex)-[:LOOSE]->(p) } AND NOT EXISTS { (p)-[:LOOSE]->(:Hex) }) )
CREATE (p)-[:LOOSE {since: $now}]->(h)
SET h.state = 'path', pl.steps = pl.steps - 1, pl.at = h.id
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
 * Place a waymarker on the hex the explorer stands on, and end the day. Requires a waymarker to spend, the hex not
 * to be an anchor already, and the explorer to be at the head of the day's path. $budget: the day's step budget.
 * The loose path becomes secured (so the day's ground is banked), the explorer returns to the camp, the steps refill.
 */
export const PLACE_WAYMARKER = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at}), (home:Hex {origin: true})
WHERE pl.markers > 0 AND h.anchor IS NULL
  AND NOT EXISTS { (h)-[:LOOSE]->(:Hex) }
MATCH (prev:Hex)-[:LOOSE]->(h)
SET h.anchor = true, pl.markers = pl.markers - 1
WITH pl, h, home
MATCH (a:Hex)-[r:LOOSE]->(b:Hex)
CREATE (a)-[:SECURED {since: r.since}]->(b) DELETE r
WITH pl, h, home, count(r) AS secured
SET pl.at = home.id, pl.steps = $budget
RETURN h.id AS waymark, secured AS secured, pl.at AS at, pl.steps AS steps, pl.markers AS markers`;

/**
 * End the day: the steps ran out. The loose path is abandoned, the explorer returns to the camp, the steps refill,
 * and everything the secured network does not disclose fogs over: a hex stays known only if it lies on a secured
 * path, is the camp, or neighbours such a hex (as sensed); every other hex becomes hidden again. Answers with the
 * ids that were fogged, so the client's cache can drop them. $budget: the day's step budget.
 */
export const END_DAY = `
MATCH (pl:Player {id: 'player'}), (home:Hex {origin: true})
OPTIONAL MATCH (a:Hex)-[r:LOOSE]->(b:Hex) DELETE r
WITH pl, home, count(r) AS lost
OPTIONAL MATCH (x:Hex)
  WHERE x.state IN ['sensed', 'seen', 'path'] AND x.origin IS NULL
    AND NOT EXISTS { (x)-[:SECURED]-() }
WITH pl, home, lost, collect(DISTINCT x.id) AS fogged
MATCH (y:Hex) WHERE y.id IN fogged OR y.id = home.id
SET y.state = CASE WHEN y.id IN fogged THEN 'hidden' ELSE y.state END
WITH DISTINCT pl, home, lost, fogged
MATCH (k:Hex) WHERE k.origin IS NOT NULL OR EXISTS { (k)-[:SECURED]-() }
OPTIONAL MATCH (k)-[:ADJ]-(n:Hex) WHERE n.state = 'hidden'
SET n.state = 'sensed'
WITH DISTINCT pl, home, lost, fogged
SET pl.at = home.id, pl.steps = $budget
RETURN pl.at AS at, pl.steps AS steps, lost AS lost, fogged AS fogged`;

/** Step one hex over known ground (on a path, or remembered); lays no path of its own. Costs one step. */
export const STEP = `
MATCH (pl:Player {id: 'player'}), (p:Hex {id: pl.at})-[:ADJ]-(h:Hex {id: $to})
WHERE h.state IN ['seen', 'path'] AND pl.steps > 0
SET pl.at = h.id, pl.steps = pl.steps - 1
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
  CASE WHEN h.state = 'hidden' THEN false ELSE coalesce(h.anchor, false) END AS anchor`;

/** The whole board as the player may know it. */
export const READ_BOARD = `MATCH (h:Hex) RETURN ${HEX_FIELDS}`;

/** Some hexes, as the player may know them. $ids: a list of hex ids. */
export const READ_HEXES = `MATCH (h:Hex) WHERE h.id IN $ids RETURN ${HEX_FIELDS}`;

export const READ_PLAYER = `MATCH (pl:Player {id: 'player'}) RETURN pl.at AS at, pl.steps AS steps, pl.markers AS markers`;

/** The path and the secured routes, for drawing. */
export const READ_EDGES = `MATCH (a:Hex)-[r:LOOSE|SECURED]->(b:Hex) RETURN a.id AS from, b.id AS to, type(r) AS kind`;
