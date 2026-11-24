// ADR-011, 2.5 (amended 2026-11-16, the waymarker expedition): every statement against the real engine, in its
// WebAssembly build, in Node. Skipped when the database's browser package is not installed.
import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../src/game/statements.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, "../node_modules/@relate/relate-wasm");
const wasm = resolve(pkg, "relate_bg.wasm");

type Row = Record<string, unknown>;
interface Db {
  execute(query: string, params?: string | null): string;
}

describe.skipIf(!existsSync(wasm))("statements, in the engine's WebAssembly build", () => {
  let db: Db;
  const run = (q: string, params?: Record<string, unknown>): Row[] => {
    const res = JSON.parse(db.execute(q, params ? JSON.stringify(params) : null)) as { error: string | null; rows: Row[] };
    expect(res.error, `${q.trim().split("\n")[0]}`).toBeNull();
    return res.rows;
  };
  const extend = (to: string, now = 1) => {
    const rows = run(S.EXTEND, { to, now });
    // The engine does not promise a collection order; compare sensed sets sorted.
    for (const r of rows) r["sensed"] = [...(r["sensed"] as string[])].sort();
    return rows;
  };
  const at = () => run("MATCH (pl:Player) RETURN pl.at AS at")[0]!["at"];
  const player = () => run(S.READ_PLAYER)[0]!;
  const hex = (id: string) => run("MATCH (h:Hex {id: $id}) RETURN h.state AS s", { id })[0]!["s"];
  const edges = () =>
    run("MATCH (a)-[r]->(b) WHERE type(r) IN ['LOOSE','SECURED'] RETURN a.id AS a, type(r) AS t, b.id AS b ORDER BY a, b");

  beforeAll(async () => {
    const mod = await import(resolve(pkg, "relate.js"));
    mod.initSync({ module: readFileSync(wasm) });
    db = new mod.RelateDb() as Db;
    // H (camp, anchor) - a - b - c - T1 (tower, anchor); H - d - e - f - T2 (tower, anchor); a - g (a side branch,
    // sensed); e - x (hidden); a cache Thing on e.
    run(`CREATE (:Hex {id:'H', origin:true, anchor:true, state:'path'}),
              (:Hex {id:'a', state:'sensed'}), (:Hex {id:'b', state:'hidden', terrain:'badlands', cost:2}), (:Hex {id:'c', state:'hidden'}),
              (:Hex {id:'T1', anchor:true, tower:true, state:'hidden'}),
              (:Hex {id:'d', state:'sensed'}), (:Hex {id:'e', state:'hidden'}), (:Hex {id:'f', state:'hidden'}),
              (:Hex {id:'T2', anchor:true, tower:true, state:'hidden'}),
              (:Hex {id:'g', state:'hidden', terrain:'grass'}), (:Hex {id:'x', state:'hidden', terrain:'water', cost:13}),
              (:Player {id:'player', at:'H', steps:12, markers:2}), (:Robot {id:'robot'})`);
    run(`MATCH (h:Hex {id:'H'}),(a:Hex {id:'a'}),(b:Hex {id:'b'}),(c:Hex {id:'c'}),(t1:Hex {id:'T1'}),
              (d:Hex {id:'d'}),(e:Hex {id:'e'}),(f:Hex {id:'f'}),(t2:Hex {id:'T2'}),(g:Hex {id:'g'}),(x:Hex {id:'x'})
         CREATE (h)-[:ADJ]->(a),(a)-[:ADJ]->(b),(b)-[:ADJ]->(c),(c)-[:ADJ]->(t1),(h)-[:ADJ]->(d),(d)-[:ADJ]->(e),
                (e)-[:ADJ]->(f),(f)-[:ADJ]->(t2),(a)-[:ADJ]->(g),(e)-[:ADJ]->(x)`);
    run(`MATCH (e:Hex {id:'e'}) CREATE (:Thing {id:'cache1', kind:'cache'})-[:ON]->(e)`);
  });

  it("extends the path from the camp, one step a hex, sensing the neighbours", () => {
    expect(extend("a", 1)[0]).toMatchObject({ id: "a", anchor: false, caches: 0, steps: 11, markers: 2, sensed: ["b", "g"].sort() });
    expect(extend("b", 2)[0]).toMatchObject({ id: "b", steps: 9, sensed: ["c"] }); // badlands: two steps
    expect(extend("c", 3)[0]).toMatchObject({ id: "c", steps: 8, sensed: ["T1"] });
    expect(at()).toBe("c");
  });

  it("refuses an extension that would touch the path or start a second one mid-path", () => {
    expect(extend("a")).toHaveLength(0); // a hex of the path itself
    expect(run("MATCH (pl:Player) SET pl.at = 'H'")); // for the next case: at the camp, but a path is in play
    expect(extend("d")).toHaveLength(0);
    expect(run("MATCH (pl:Player) SET pl.at = 'c'"));
  });

  it("places a waymarker: the path is secured, and the explorer stays with the steps remaining", () => {
    expect(run(S.PLACE_WAYMARKER)[0]).toMatchObject({ waymark: "c", secured: 3, at: "c", steps: 8, markers: 1 });
    expect(edges().map((e) => e["t"])).toEqual(["SECURED", "SECURED", "SECURED"]);
    expect(hex("a")).toBe("path"); // banked: the day's ground stays
  });

  it("refuses a waymarker without a path to bank, and on an anchor", () => {
    expect(run(S.PLACE_WAYMARKER)).toHaveLength(0); // at the new anchor: no loose path
    // Standing on an anchor is no good either way, even with a path to bank.
    run("MATCH (pl:Player) SET pl.at = 'H'");
    run("MATCH (h:Hex {id:'H'}), (d:Hex {id:'d'}) CREATE (h)-[:LOOSE {since: 4}]->(d)");
    expect(run(S.PLACE_WAYMARKER)).toHaveLength(0); // the camp is an anchor already
    run("MATCH ()-[r:LOOSE]->() DELETE r");
  });

  it("travels back to the waymarker for one step, and extends on to the tower, which secures", () => {
    expect(run(S.TRAVEL, { to: "c" })[0]).toMatchObject({ at: "c", steps: 7 });
    expect(extend("T1", 5)[0]).toMatchObject({ id: "T1", anchor: true, steps: 6 });
    expect(run(S.SECURE)[0]).toMatchObject({ secured: 1 });
  });

  it("reports the win per tower: one joined, one not", () => {
    expect(run(S.TOWERS).sort((r, s) => String(r["id"]).localeCompare(String(s["id"])))).toEqual([
      { id: "T1", joined: true },
      { id: "T2", joined: false },
    ]);
  });

  it("refuses travel while a path is in play, and reels it back in for a step", () => {
    expect(extend("c", 6)[0]).toMatchObject({ id: "c" }); // cross onto the secured path
    expect(run(S.TRAVEL, { to: "H" })).toHaveLength(0);
    expect(run(S.REEL_IN)[0]).toMatchObject({ at: "T1", steps: 4 });
    expect(hex("c")).toBe("path"); // a hex of the secured path stays on it
    expect(run(S.TRAVEL, { to: "H" })[0]).toMatchObject({ at: "H", steps: 3 });
  });

  it("finds a cache on entering: one waymarker gained, found only once", () => {
    expect(extend("d", 7)[0]).toMatchObject({ id: "d", steps: 2, sensed: ["e"] });
    expect(run(S.TETHERED)[0]).toMatchObject({ tethered: true });
    expect(run(S.CUE_SOURCE, { ids: ["e"] })).toEqual([{ id: "e", own: true, kind: "cache" }]);
    expect(extend("e", 8)[0]).toMatchObject({ id: "e", caches: 1, markers: 2, steps: 1, sensed: ["f", "x"].sort() });
    expect(run("MATCH (t:Thing {id:'cache1'})-[o:ON]->() RETURN count(o) AS c")[0]).toMatchObject({ c: 0 }); // spent
  });

  it("ends the day on exhaustion: home, refilled, and everything the secured network does not disclose fogs over", () => {
    const res = run(S.END_DAY, { budget: 12, part: "head", n: 1, last: false })[0]!;
    res["fogged"] = [...(res["fogged"] as string[])].sort();
    expect(res).toMatchObject({ at: "H", steps: 12, lost: 2 });
    // Everything loose-path-adjacent fogs, including hexes the secured network discloses again at once.
    expect(new Set(res["fogged"] as string[])).toEqual(new Set(["d", "e", "f", "g", "x"]));
    expect(hex("d")).toBe("sensed"); // the camp's neighbour is disclosed again at once
    expect(hex("e")).toBe("hidden");
    expect(hex("x")).toBe("hidden"); // never sensed, stays hidden
    expect(hex("g")).toBe("sensed"); // a neighbour of the secured path stays sensed
    expect(hex("c")).toBe("path"); // the banked network keeps its ground
    expect(edges().every((e) => e["t"] === "SECURED")).toBe(true);
  });

  it("finishes the win: the second tower joined, both rows say so", () => {
    expect(extend("d", 9)[0]).toMatchObject({ id: "d", steps: 11 });
    expect(extend("e", 10)[0]).toMatchObject({ id: "e", caches: 0, markers: 2 }); // the cache is spent for good
    expect(extend("f", 11)[0]).toMatchObject({ id: "f", steps: 9 });
    expect(extend("T2", 12)[0]).toMatchObject({ id: "T2", anchor: true, steps: 8 });
    expect(run(S.SECURE)[0]).toMatchObject({ secured: 4 }); // the whole H-d-e-f-T2 path was loose
    expect(run(S.TOWERS).every((r) => r["joined"] === true)).toBe(true);
  });

  it("ends the day cleanly when nothing needs to fog", () => {
    run("MATCH (pl:Player) SET pl.steps = 0");
    expect(run(S.END_DAY, { budget: 12, part: "eyes", n: 2, last: false })[0]).toMatchObject({ at: "H", steps: 12, lost: 0, fogged: ["g", "x"] });
    expect(hex("g")).toBe("sensed"); // re-sensed from the secured network at once
    expect(hex("x")).toBe("sensed"); // x neighbours e, which is now secured
  });

  it("adds a robot part each night, and the seventh night ends the game", () => {
    expect(run(S.READ_PARTS)).toEqual([{ kind: "head", n: 1 }, { kind: "eyes", n: 2 }]);
    expect(run(S.READ_PLAYER)[0]).toMatchObject({ over: false });
    run(S.END_DAY, { budget: 12, part: "power", n: 7, last: true });
    expect(run(S.READ_PARTS).map((r) => r["kind"])).toEqual(["head", "eyes", "power"]);
    expect(run(S.READ_PLAYER)[0]).toMatchObject({ over: true });
    run(S.UNDO_CLEAR_PARTS);
    run(S.UNDO_PARTS, { parts: [{ kind: "head", n: 1 }] });
    expect(run(S.READ_PARTS)).toEqual([{ kind: "head", n: 1 }]);
    run("MATCH (pl:Player) REMOVE pl.over");
    expect(run(S.GAME_OVER)[0]).toMatchObject({ over: true });
    run("MATCH (h:Hex) WHERE h.anchor = true SET h.feature = 'x'"); // the camp and the towers carry a feature
    expect(run(S.MARKERS_USED)[0]).toMatchObject({ markers: 0 }); // so they are not waymarkers
    run("MATCH (h:Hex {id:'g'}) SET h.anchor = true");
    expect(run(S.MARKERS_USED)[0]).toMatchObject({ markers: 1 }); // a placed waymarker is
    run("MATCH (h:Hex {id:'g'}) REMOVE h.anchor");
    run("MATCH (pl:Player) REMOVE pl.over");
  });

  it("charges the terrain's cost and refuses what the day cannot afford", () => {
    run("MATCH (pl:Player) SET pl.at = 'H', pl.steps = 2");
    expect(extend("d", 13)[0]).toMatchObject({ id: "d", steps: 1 }); // grass: one step
    run("MATCH (pl:Player) SET pl.steps = 12"); // a full day
    expect(extend("e", 14)[0]).toMatchObject({ id: "e", steps: 11 });
    expect(extend("x", 15)).toHaveLength(0); // water: 13 is more than any day's 12
    run("MATCH (pl:Player) SET pl.steps = 13");
    expect(extend("x", 16)[0]).toMatchObject({ id: "x", steps: 0 }); // affordable only by impossible means
    // leave the board as the later tests expect it
    run("MATCH ()-[r:LOOSE]->() DELETE r");
    run("MATCH (pl:Player) SET pl.at = 'H', pl.steps = 12");
    run("MATCH (h:Hex) WHERE h.id IN ['e'] SET h.state = 'sensed'");
    run("MATCH (h:Hex) WHERE h.id IN ['x'] SET h.state = 'hidden'");
  });

  it("steps over known ground for one step, and reads the player and the edges", () => {
    expect(run(S.STEP, { to: "a" })[0]).toMatchObject({ at: "a", steps: 11 });
    expect(player()).toMatchObject({ at: "a", steps: 11, markers: 2 });
    expect(run(S.READ_EDGES).every((r) => r["kind"] === "SECURED")).toBe(true);
    const hidden = run(S.READ_BOARD).filter((r) => r["state"] === "hidden");
    expect(hidden.every((r) => r["terrain"] === null && r["feature"] === null && r["anchor"] === false)).toBe(true);
  });
});

// ADR-011, amended 2026-11-19: branch flags. A flag is placed on a secured path hex, for a waymarker, so a thread can start there.
describe.skipIf(!existsSync(wasm))("branch flags, in the engine's WebAssembly build", () => {
  let mod: { initSync(o: { module: Buffer }): void; RelateDb: new () => Db };
  const fresh = (markers: number): Db => {
    const db = new mod.RelateDb();
    const q = (s: string, p?: Record<string, unknown>) => {
      const res = JSON.parse(db.execute(s, p ? JSON.stringify(p) : null)) as { error: string | null };
      expect(res.error).toBeNull();
    };
    // H (the camp, an anchor) - a (a secured path hex) - b (a secured path hex) ; a - n (sensed ground), b - m (hidden)
    q(`CREATE (:Hex {id:'H', origin:true, anchor:true, state:'path'}), (:Hex {id:'a', state:'path'}), (:Hex {id:'b', state:'path'}),
              (:Hex {id:'n', state:'sensed', cost:1}), (:Hex {id:'m', state:'hidden'}),
              (:Player {id:'player', at:'a', steps:5, markers:${markers}})`);
    q(`MATCH (h:Hex {id:'H'}),(a:Hex {id:'a'}),(b:Hex {id:'b'}),(n:Hex {id:'n'}),(m:Hex {id:'m'})
       CREATE (h)-[:ADJ]->(a),(a)-[:ADJ]->(b),(a)-[:ADJ]->(n),(b)-[:ADJ]->(m),(h)-[:SECURED {since:1}]->(a),(a)-[:SECURED {since:1}]->(b)`);
    return db;
  };
  const rows = (db: Db, s: string, p?: Record<string, unknown>) => {
    const res = JSON.parse(db.execute(s, p ? JSON.stringify(p) : null)) as { error: string | null; rows: Row[] };
    expect(res.error).toBeNull();
    return res.rows;
  };

  beforeAll(async () => {
    mod = (await import(resolve(pkg, "relate.js"))) as typeof mod;
    mod.initSync({ module: readFileSync(wasm) });
  });

  it("extends from a path hex that is not an anchor: the hex left becomes an anchor, a waymarker and a step are spent", () => {
    const db = fresh(1);
    expect(rows(db, S.BRANCH_EXTEND, { to: "n", now: 1 })[0]).toMatchObject({ id: "n", anchor: false, steps: 4, markers: 0, branch: "a" });
    expect(rows(db, "MATCH (h:Hex {id:'a'}) RETURN h.anchor AS anchor")[0]!["anchor"]).toBe(true);
    expect(rows(db, "MATCH (a:Hex {id:'a'})-[:LOOSE]->(n:Hex {id:'n'}) RETURN count(*) AS n")[0]!["n"]).toBe(1);
  });

  it("refuses to branch without a waymarker, from an anchor, onto a path, or while a thread is in play", () => {
    expect(rows(fresh(0), S.BRANCH_EXTEND, { to: "n", now: 1 })).toHaveLength(0);
    const db = fresh(2);
    expect(rows(db, S.BRANCH_EXTEND, { to: "b", now: 1 })).toHaveLength(0); // b is on the path: stepping, not extending
    rows(db, "MATCH (pl:Player) SET pl.at = 'H'");
    expect(rows(db, S.BRANCH_EXTEND, { to: "a", now: 1 })).toHaveLength(0); // the camp is an anchor: EXTEND is the statement for it
    rows(db, "MATCH (pl:Player) SET pl.at = 'a'");
    rows(db, "MATCH (a:Hex {id:'a'}),(n:Hex {id:'n'}) CREATE (a)-[:LOOSE {since:2}]->(n)");
    expect(rows(db, S.BRANCH_EXTEND, { to: "n", now: 3 })).toHaveLength(0); // a thread is in play
  });

  it("drops a flag on a path hex for a waymarker and no steps, and refuses on an anchor, with a thread in play or with none left", () => {
    const db = fresh(1);
    expect(rows(db, S.PLACE_FLAG)[0]).toMatchObject({ flag: "a", at: "a", steps: 5, markers: 0 });
    expect(rows(db, S.PLACE_FLAG)).toHaveLength(0); // on an anchor now, and with none left
    expect(rows(fresh(0), S.PLACE_FLAG)).toHaveLength(0);
    const busy = fresh(1);
    rows(busy, "MATCH (a:Hex {id:'a'}),(n:Hex {id:'n'}) CREATE (a)-[:LOOSE {since:2}]->(n)");
    expect(rows(busy, S.PLACE_FLAG)).toHaveLength(0);
  });
});
