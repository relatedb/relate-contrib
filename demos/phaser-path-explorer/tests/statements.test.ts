// ADR-011, 2.5 (amended 2026-11-16, the waymarker expedition): every statement against the real engine, in its
// WebAssembly build, in Node. Skipped when the engine's browser package has not been built (`pnpm run build:wasm`).
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
              (:Hex {id:'a', state:'sensed'}), (:Hex {id:'b', state:'hidden'}), (:Hex {id:'c', state:'hidden'}),
              (:Hex {id:'T1', anchor:true, tower:true, state:'hidden'}),
              (:Hex {id:'d', state:'sensed'}), (:Hex {id:'e', state:'hidden'}), (:Hex {id:'f', state:'hidden'}),
              (:Hex {id:'T2', anchor:true, tower:true, state:'hidden'}),
              (:Hex {id:'g', state:'hidden', terrain:'grass'}), (:Hex {id:'x', state:'hidden', terrain:'sand'}),
              (:Player {id:'player', at:'H', steps:12, markers:2})`);
    run(`MATCH (h:Hex {id:'H'}),(a:Hex {id:'a'}),(b:Hex {id:'b'}),(c:Hex {id:'c'}),(t1:Hex {id:'T1'}),
              (d:Hex {id:'d'}),(e:Hex {id:'e'}),(f:Hex {id:'f'}),(t2:Hex {id:'T2'}),(g:Hex {id:'g'}),(x:Hex {id:'x'})
         CREATE (h)-[:ADJ]->(a),(a)-[:ADJ]->(b),(b)-[:ADJ]->(c),(c)-[:ADJ]->(t1),(h)-[:ADJ]->(d),(d)-[:ADJ]->(e),
                (e)-[:ADJ]->(f),(f)-[:ADJ]->(t2),(a)-[:ADJ]->(g),(e)-[:ADJ]->(x)`);
    run(`MATCH (e:Hex {id:'e'}) CREATE (:Thing {id:'cache1', kind:'cache'})-[:ON]->(e)`);
  });

  it("extends the path from the camp, one step a hex, sensing the neighbours", () => {
    expect(extend("a", 1)[0]).toMatchObject({ id: "a", anchor: false, caches: 0, steps: 11, markers: 2, sensed: ["b", "g"].sort() });
    expect(extend("b", 2)[0]).toMatchObject({ id: "b", steps: 10, sensed: ["c"] });
    expect(extend("c", 3)[0]).toMatchObject({ id: "c", steps: 9, sensed: ["T1"] });
    expect(at()).toBe("c");
  });

  it("refuses an extension that would touch the path or start a second one mid-path", () => {
    expect(extend("a")).toHaveLength(0); // a hex of the path itself
    expect(run("MATCH (pl:Player) SET pl.at = 'H'")); // for the next case: at the camp, but a path is in play
    expect(extend("d")).toHaveLength(0);
    expect(run("MATCH (pl:Player) SET pl.at = 'c'"));
  });

  it("places a waymarker: the path is secured, the explorer goes home and the day refills", () => {
    expect(run(S.PLACE_WAYMARKER, { budget: 12 })[0]).toMatchObject({ waymark: "c", secured: 3, at: "H", steps: 12, markers: 1 });
    expect(edges().map((e) => e["t"])).toEqual(["SECURED", "SECURED", "SECURED"]);
    expect(hex("a")).toBe("path"); // banked: the day's ground stays
  });

  it("refuses a waymarker without a path to bank, and on an anchor", () => {
    expect(run(S.PLACE_WAYMARKER, { budget: 12 })).toHaveLength(0); // at the camp: no loose path
    // Standing on an anchor is no good either way, even with a path to bank.
    run("MATCH (h:Hex {id:'H'}), (d:Hex {id:'d'}) CREATE (h)-[:LOOSE {since: 4}]->(d)");
    expect(run(S.PLACE_WAYMARKER, { budget: 12 })).toHaveLength(0); // the camp is an anchor already
    run("MATCH ()-[r:LOOSE]->() DELETE r");
  });

  it("travels to the waymarker for one step, and extends on to the tower, which secures", () => {
    expect(run(S.TRAVEL, { to: "c" })[0]).toMatchObject({ at: "c", steps: 11 });
    expect(extend("T1", 5)[0]).toMatchObject({ id: "T1", anchor: true, steps: 10 });
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
    expect(run(S.REEL_IN)[0]).toMatchObject({ at: "T1", steps: 8 });
    expect(hex("c")).toBe("path"); // a hex of the secured path stays on it
    expect(run(S.TRAVEL, { to: "H" })[0]).toMatchObject({ at: "H", steps: 7 });
  });

  it("finds a cache on entering: one waymarker gained, found only once", () => {
    expect(extend("d", 7)[0]).toMatchObject({ id: "d", steps: 6, sensed: ["e"] });
    expect(run(S.TETHERED)[0]).toMatchObject({ tethered: true });
    expect(run(S.CUE_SOURCE, { ids: ["e"] })).toEqual([{ id: "e", own: true, kind: "cache" }]);
    expect(extend("e", 8)[0]).toMatchObject({ id: "e", caches: 1, markers: 2, steps: 5, sensed: ["f", "x"].sort() });
    expect(run("MATCH (t:Thing {id:'cache1'})-[o:ON]->() RETURN count(o) AS c")[0]).toMatchObject({ c: 0 }); // spent
  });

  it("ends the day on exhaustion: home, refilled, and everything the secured network does not disclose fogs over", () => {
    const res = run(S.END_DAY, { budget: 12 })[0]!;
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
    expect(run(S.END_DAY, { budget: 12 })[0]).toMatchObject({ at: "H", steps: 12, lost: 0, fogged: ["g", "x"] });
    expect(hex("g")).toBe("sensed"); // re-sensed from the secured network at once
    expect(hex("x")).toBe("sensed"); // x neighbours e, which is now secured
  });

  it("steps over known ground for one step, and reads the player and the edges", () => {
    expect(run(S.STEP, { to: "a" })[0]).toMatchObject({ at: "a", steps: 11 });
    expect(player()).toMatchObject({ at: "a", steps: 11, markers: 2 });
    expect(run(S.READ_EDGES).every((r) => r["kind"] === "SECURED")).toBe(true);
    const hidden = run(S.READ_BOARD).filter((r) => r["state"] === "hidden");
    expect(hidden.every((r) => r["terrain"] === null && r["feature"] === null && r["anchor"] === false)).toBe(true);
  });
});
