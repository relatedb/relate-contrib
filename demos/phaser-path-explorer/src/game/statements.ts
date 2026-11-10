// The game's verbs as statements (ADR-010, 2.5). Each verb is one statement, so each is atomic; values are bound
// parameters. tests/statements.test.ts runs every one against the real engine in WebAssembly.
//
// Reachability uses `shortestPath`, which has no hop cap. It needs two distinct nodes, so the hex being tested is
// compared with the target first. A flag that is absent is null, so statements use IS NULL or coalesce.

/**
 * Extend one hex. $to: the target hex id, $now: a counter for `since`. The target may be unexplored or remembered
 * ground, or a hex already on a path (the thread then crosses it); it may not touch the thread itself.
 */
export const EXTEND = `
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
RETURN h.id AS id, coalesce(h.anchor, false) AS anchor, coalesce(h.snag, false) AS snag, collect(n.id) AS sensed`;

/** Secure: at the head of the thread on an anchor, every loose edge becomes secured. Matches nothing otherwise. */
export const SECURE = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at, anchor: true})
WHERE EXISTS { (:Hex)-[:LOOSE]->(h) }
MATCH (a:Hex)-[r:LOOSE]->(b:Hex)
CREATE (a)-[:SECURED {since: r.since}]->(b) DELETE r
RETURN count(r) AS secured`;

/** Cue source for sensed hexes. $ids: a list of hex ids. */
export const CUE_SOURCE = `
MATCH (n:Hex) WHERE n.id IN $ids
MATCH (n)-[:ADJ*0..1]-(m:Hex)<-[:ON]-(t:Thing)
RETURN n.id AS id, m = n AS own, t.kind AS kind`;

/** Step one hex over known ground (on a path, or remembered); lays no thread. */
export const STEP = `
MATCH (pl:Player {id: 'player'}), (p:Hex {id: pl.at})-[:ADJ]-(h:Hex {id: $to})
WHERE h.state IN ['seen', 'path']
SET pl.at = h.id RETURN pl.at AS at`;

/** Reel in: the explorer at the head of the thread steps back and takes the last loose edge in. A hex that is on a secured path stays on it. */
export const REEL_IN = `
MATCH (pl:Player {id: 'player'}), (prev:Hex)-[r:LOOSE]->(p:Hex {id: pl.at})
WHERE NOT EXISTS { (p)-[:LOOSE]->(:Hex) }
DELETE r
SET p.state = CASE WHEN EXISTS { (p)-[:SECURED]-(:Hex) } THEN 'path' ELSE 'seen' END,
    pl.waymarks = pl.waymarks + 1, pl.at = prev.id
RETURN pl.at AS at`;

/** Is the explorer connected to an anchor? */
export const TETHERED = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at})
RETURN (coalesce(h.anchor, false)
        OR EXISTS { MATCH p = shortestPath((h)-[:LOOSE|SECURED*]-(:Hex {anchor: true})) }) AS tethered`;

/** Skip between anchors over secured paths; refused while a thread is in play. $to: the target anchor id. */
export const SKIP = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at, anchor: true}), (t:Hex {id: $to, anchor: true})
WHERE NOT EXISTS { (:Hex)-[:LOOSE]->(:Hex) }
  AND (h = t OR EXISTS { MATCH p = shortestPath((h)-[:SECURED*]-(t)) })
SET pl.at = t.id RETURN pl.at AS at`;

/** Hasty retreat: only while the explorer's hex still reaches the camp; abandon the loose thread and go home. */
export const HASTY_RETREAT = `
MATCH (pl:Player {id: 'player'}), (h:Hex {id: pl.at}), (home:Hex {origin: true})
WHERE (coalesce(h.origin, false)
       OR EXISTS { MATCH p = shortestPath((h)-[:LOOSE|SECURED*]-(:Hex {origin: true})) })
OPTIONAL MATCH (x:Hex)<-[r:LOOSE]-(:Hex)
SET x.state = CASE WHEN EXISTS { (x)-[:SECURED]-(:Hex) } THEN 'path' ELSE 'seen' END DELETE r
WITH pl, home, count(r) AS lost
SET pl.at = home.id
RETURN pl.at AS at, lost`;

/** Prune a secured path. $a, $b: the ids of its two ends. Carries the explorer home if they stood on what was cut off. */
export const PRUNE = `
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
RETURN ids, pl.waymarks AS waymarks, pl.at AS at`;

// --- reads. A hidden hex gives away nothing but its place: terrain, feature and anchor come back null (ADR-010, 2.3). ---

const HEX_FIELDS = `
  h.id AS id, h.col AS col, h.row AS row, h.state AS state,
  CASE WHEN h.state = 'hidden' THEN null ELSE h.terrain END AS terrain,
  CASE WHEN h.state = 'hidden' THEN null ELSE h.feature END AS feature,
  CASE WHEN h.state = 'hidden' THEN false ELSE coalesce(h.anchor, false) END AS anchor`;

/** The whole board as the player may know it. */
export const READ_BOARD = `MATCH (h:Hex) RETURN ${HEX_FIELDS}`;

/** Some hexes, as the player may know them. $ids: a list of hex ids. */
export const READ_HEXES = `MATCH (h:Hex) WHERE h.id IN $ids RETURN ${HEX_FIELDS}`;

export const READ_PLAYER = `MATCH (pl:Player {id: 'player'}) RETURN pl.at AS at, pl.health AS health, pl.waymarks AS waymarks`;

/** The thread and the paths, for drawing. */
export const READ_EDGES = `MATCH (a:Hex)-[r:LOOSE|SECURED]->(b:Hex) RETURN a.id AS from, b.id AS to, type(r) AS kind`;
