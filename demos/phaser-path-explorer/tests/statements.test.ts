// ADR-010, 2.5 and 2.8: every statement against the real engine, in its WebAssembly build, in Node.
// Skipped when the engine's browser package has not been built (`pnpm run build:wasm` at the repository root).
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
  const extend = (to: string, now = 1) => run(S.EXTEND, { to, now });
  const at = () => run("MATCH (pl:Player) RETURN pl.at AS at")[0]!["at"];
  const edges = () =>
    run("MATCH (a)-[r]->(b) WHERE type(r) IN ['LOOSE','SECURED'] RETURN a.id AS a, type(r) AS t, b.id AS b ORDER BY a, b");

  beforeAll(async () => {
    const mod = await import(resolve(pkg, "relate.js"));
    mod.initSync({ module: readFileSync(wasm) });
    db = new mod.RelateDb() as Db;
    // H (camp, anchor) -a- b - c - T (anchor); H - d - e - s (snag); a - u
    run(`CREATE (:Hex {id:'H', origin:true, anchor:true, state:'path'}), (:Hex {id:'a', state:'sensed'}),
         (:Hex {id:'b', state:'hidden'}), (:Hex {id:'c', state:'hidden'}), (:Hex {id:'T', anchor:true, state:'hidden'}),
         (:Hex {id:'d', state:'sensed'}), (:Hex {id:'e', state:'hidden'}), (:Hex {id:'s', snag:true, state:'hidden'}),
         (:Hex {id:'u', state:'sensed'}), (:Player {id:'player', at:'H', waymarks:9, health:3})`);
    run(`MATCH (h:Hex {id:'H'}),(a:Hex {id:'a'}),(b:Hex {id:'b'}),(c:Hex {id:'c'}),(t:Hex {id:'T'}),(d:Hex {id:'d'}),
         (e:Hex {id:'e'}),(s:Hex {id:'s'}),(u:Hex {id:'u'})
         CREATE (h)-[:ADJ]->(a),(a)-[:ADJ]->(b),(b)-[:ADJ]->(c),(c)-[:ADJ]->(t),(h)-[:ADJ]->(d),(d)-[:ADJ]->(e),
                (e)-[:ADJ]->(s),(a)-[:ADJ]->(u)`);
  });

  it("extends a thread from the camp, one hex at a time, sensing the neighbours", () => {
    expect(extend("a", 1)[0]).toMatchObject({ id: "a", anchor: false, snag: false, sensed: ["b"] });
    expect(extend("b", 2)[0]).toMatchObject({ id: "b", sensed: ["c"] });
    expect(extend("c", 3)[0]).toMatchObject({ id: "c", sensed: ["T"] });
    expect(at()).toBe("c");
  });

  it("refuses a skip while a thread is in play and the explorer is not on an anchor", () => {
    expect(run(S.SKIP, { to: "H" })).toHaveLength(0);
  });

  it("secures the thread when it reaches an anchor", () => {
    expect(extend("T", 4)[0]).toMatchObject({ id: "T", anchor: true });
    expect(run(S.SECURE)[0]).toMatchObject({ secured: 4 });
    expect(edges().map((e) => e["t"])).toEqual(["SECURED", "SECURED", "SECURED", "SECURED"]);
    expect(run(S.SECURE)[0]).toMatchObject({ secured: 0 }); // harmless to run again
  });

  it("skips between anchors over secured paths", () => {
    expect(run(S.SKIP, { to: "H" })[0]).toMatchObject({ at: "H" });
  });

  it("crosses a secured path: an extension onto a hex of the path is allowed, and reeling in leaves that hex on the path", () => {
    expect(extend("a", 5)[0]).toMatchObject({ id: "a", anchor: false });
    expect(run(S.REEL_IN)[0]).toMatchObject({ at: "H" });
    const a = run("MATCH (h:Hex {id: 'a'}) RETURN h.state AS s")[0]!["s"];
    expect(a).toBe("path");
    expect(edges().every((e) => e["t"] === "SECURED")).toBe(true);
  });

  it("starts a new thread only from an anchor, and a snag cuts the explorer off", () => {
    expect(extend("d", 6)[0]).toMatchObject({ id: "d", snag: false });
    expect(extend("e", 7)[0]).toMatchObject({ id: "e", sensed: ["s"] });
    expect(extend("s", 8)[0]).toMatchObject({ id: "s", snag: true });
    expect(run(S.TETHERED)[0]).toMatchObject({ tethered: false });
    expect(run(S.HASTY_RETREAT)).toHaveLength(0); // cut off: no retreat
    // the loose thread stays attached as a stub: no edge was laid onto the snag
    expect(edges().filter((e) => e["t"] === "LOOSE")).toEqual([
      { a: "H", t: "LOOSE", b: "d" },
      { a: "d", t: "LOOSE", b: "e" },
    ]);
  });

  it("lets the cut-off explorer step back over known ground and is tethered again", () => {
    expect(run(S.STEP, { to: "e" })[0]).toMatchObject({ at: "e" });
    expect(run(S.TETHERED)[0]).toMatchObject({ tethered: true });
  });

  it("refuses a second thread from a hex that is not the head", () => {
    run(S.STEP, { to: "d" });
    expect(extend("e", 9)).toHaveLength(0);
    run(S.STEP, { to: "e" });
  });

  it("reels in the last loose edge and refunds the waymark", () => {
    const before = run("MATCH (pl:Player) RETURN pl.waymarks AS w")[0]!["w"] as number;
    expect(run(S.REEL_IN)[0]).toMatchObject({ at: "d" });
    expect(run("MATCH (pl:Player) RETURN pl.waymarks AS w")[0]!["w"]).toBe(before + 1);
  });

  it("makes a hasty retreat home and abandons the loose thread", () => {
    expect(run(S.HASTY_RETREAT)[0]).toMatchObject({ at: "H", lost: 1 });
    expect(edges().every((e) => e["t"] === "SECURED")).toBe(true);
  });

  it("prunes a secured path, marks what is cut off, refunds it and carries the explorer home", () => {
    run("MATCH (pl:Player) SET pl.at = 'T'");
    const before = run("MATCH (pl:Player) RETURN pl.waymarks AS w")[0]!["w"] as number;
    const res = run(S.PRUNE, { a: "a", b: "b" })[0] as { ids: string[]; waymarks: number; at: string };
    expect([...res.ids].sort()).toEqual(["T", "b", "c"]);
    expect(res.at).toBe("H");
    expect(res.waymarks).toBe(before + 3);
    expect(edges()).toEqual([{ a: "H", t: "SECURED", b: "a" }]);
    const states = Object.fromEntries(run("MATCH (h:Hex) RETURN h.id AS id, h.state AS s").map((r) => [r["id"], r["s"]]));
    expect(states).toMatchObject({ H: "path", a: "path", b: "seen", c: "seen", T: "seen", s: "seen" });
  });

  it("reads the cue source: Things on a hex and on its neighbours", () => {
    run("MATCH (s:Hex {id:'s'}) CREATE (:Thing {id:'t1', kind:'thorn'})-[:ON]->(s)");
    const rows = run(S.CUE_SOURCE, { ids: ["e", "s"] });
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: "e", own: false, kind: "thorn" },
        { id: "s", own: true, kind: "thorn" },
      ]),
    );
  });

  it("finds orphans on a 440-hex chain, with no hop bound", () => {
    run("UNWIND range(0, 439) AS i CREATE (:Hex {id: 'x' + toString(i), state: 'path', origin: CASE WHEN i = 0 THEN true END})");
    run("MATCH (a:Hex), (b:Hex) WHERE a.id STARTS WITH 'x' AND b.id STARTS WITH 'x' AND toInteger(substring(b.id, 1)) = toInteger(substring(a.id, 1)) + 1 CREATE (a)-[:SECURED]->(b)");
    // cutting at the far end orphans one hex, and cutting in the middle orphans the second half
    const res = run(
      "MATCH (:Hex {id: 'x219'})-[r:SECURED]->(:Hex {id: 'x220'}) DELETE r WITH count(r) AS n MATCH (t:Hex) WHERE t.id STARTS WITH 'x' AND t.origin IS NULL AND NOT EXISTS { MATCH p = shortestPath((t)-[:SECURED*]-(:Hex {origin: true})) } RETURN count(t) AS orphans",
    );
    expect(res[0]).toMatchObject({ orphans: 220 });
  });
});
