// covers-app: FR-013, SC-004
import { describe, expect, it } from "vitest";
import { inRanges } from "../../../src/application/ranges.js";
import { query, world } from "./helpers.js";

const step = inRanges({
  label: "Item",
  property: "n",
  step: 10,
  statement: "MATCH (i:Item) WHERE i.n >= $from AND i.n < $to AND i.v2 IS NULL SET i.v2 = i.n * 2",
});

async function store(count: number, start = 0) {
  const w = await world();
  await w.open({ version: 1 });
  if (count > 0) query(w.e, "UNWIND range($a, $b) AS k CREATE (:Item {id: 'i' + toString(k), n: k})", { a: start, b: start + count - 1 });
  return w;
}

describe("inRanges", () => {
  it("returns plain data that survives structured clone", () => {
    expect(structuredClone(step)).toEqual(step);
    expect(step.kind).toBe("ranges");
  });

  it("updates each node once across windows with an inclusive lower and exclusive upper bound", async () => {
    const w = await store(25);
    const { e } = w;
    const windows: Array<{ from: number; to: number }> = [];
    const execute = e.execute.bind(e);
    e.execute = (s, p = null) => {
      if (s.includes("$from")) windows.push(JSON.parse(p!));
      return execute(s, p);
    };
    expect((await w.open({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(windows).toEqual([{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 20, to: 30 }]);
    expect(query(e, "MATCH (i:Item) WHERE i.v2 = i.n * 2 RETURN count(i) AS c").rows[0]!.c).toBe(25);
    expect((await w.entry())!.version).toBe(2);
  });

  it("finishes after an interruption with no node updated twice and none skipped", async () => {
    const w = await store(25);
    const { e } = w;
    const execute = e.execute.bind(e);
    let seen = 0;
    e.execute = (s, p = null) => {
      if (s.includes("$from") && ++seen === 3) throw new Error("interrupted");
      return execute(s, p);
    };
    expect(await w.open({ version: 2, migrations: { "2": [step] } })).toMatchObject({ ok: false, reason: "migration-failed" });
    e.execute = execute;
    expect(await w.entry()).toMatchObject({ state: "migrating", version: 1, target: 2 });
    expect(query(e, "MATCH (i:Item) WHERE i.v2 IS NOT NULL RETURN count(i) AS c").rows[0]!.c).toBe(20);
    expect((await w.open({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(query(e, "MATCH (i:Item) WHERE i.v2 = i.n * 2 RETURN count(i) AS c").rows[0]!.c).toBe(25);
  });

  it("runs no window when no node has the property, and handles a negative start", async () => {
    const w = await store(0);
    expect((await w.open({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    const f = await store(7, -3);
    expect((await f.open({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(query(f.e, "MATCH (i:Item) WHERE i.v2 IS NULL RETURN count(i) AS c").rows[0]!.c).toBe(0);
  });
});
