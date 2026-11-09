// covers-app: FR-013, SC-004
import { describe, expect, it } from "vitest";
import { inRanges } from "../../../src/application/ranges.js";
import { openApplication } from "../../../src/worker/application/lifecycle.js";
import { readMarkers } from "../../../src/worker/application/marker.js";
import { input, query, realEngine } from "./helpers.js";

const step = inRanges({
  label: "Item",
  property: "n",
  step: 10,
  statement: "MATCH (i:Item) WHERE i.n >= $from AND i.n < $to AND i.v2 IS NULL SET i.v2 = i.n * 2",
});

async function store(count: number, start = 0) {
  const e = await realEngine();
  openApplication(e, input({ version: 1 }));
  query(e, "UNWIND range($a, $b) AS k CREATE (:Item {id: 'i' + toString(k), n: k})", { a: start, b: start + count - 1 });
  return e;
}

describe("inRanges", () => {
  it("returns plain data that survives structured clone", () => {
    expect(structuredClone(step)).toEqual(step);
    expect(step.kind).toBe("ranges");
  });

  it("updates each node once across windows with an inclusive lower and exclusive upper bound", async () => {
    const e = await store(25);
    const windows: Array<{ from: number; to: number }> = [];
    const execute = e.execute.bind(e);
    e.execute = (s, p = null) => {
      if (s.includes("$from")) windows.push(JSON.parse(p!));
      return execute(s, p);
    };
    expect(openApplication(e, input({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(windows).toEqual([{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 20, to: 30 }]);
    expect(query(e, "MATCH (i:Item) WHERE i.v2 = i.n * 2 RETURN count(i) AS c").rows[0]!.c).toBe(25);
    expect(readMarkers(e)[0]!.version).toBe(2);
  });

  it("finishes after an interruption with no node updated twice and none skipped", async () => {
    const e = await store(25);
    const execute = e.execute.bind(e);
    let seen = 0;
    e.execute = (s, p = null) => {
      if (s.includes("$from") && ++seen === 3) throw new Error("interrupted");
      return execute(s, p);
    };
    expect(openApplication(e, input({ version: 2, migrations: { "2": [step] } }))).toMatchObject({ ok: false, reason: "migration-failed" });
    e.execute = execute;
    expect(readMarkers(e)[0]!.version).toBe(1);
    expect(query(e, "MATCH (i:Item) WHERE i.v2 IS NOT NULL RETURN count(i) AS c").rows[0]!.c).toBe(20);
    expect(openApplication(e, input({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(query(e, "MATCH (i:Item) WHERE i.v2 = i.n * 2 RETURN count(i) AS c").rows[0]!.c).toBe(25);
  });

  it("runs no window when no node has the property, and handles a negative start", async () => {
    const e = await store(0);
    expect(openApplication(e, input({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    const f = await store(7, -3);
    expect(openApplication(f, input({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(query(f, "MATCH (i:Item) WHERE i.v2 IS NULL RETURN count(i) AS c").rows[0]!.c).toBe(0);
  });

  it("never matches the marker, even when it carries the property", async () => {
    const e = await store(5);
    query(e, "MATCH (m:_RelateApplication) SET m.n = 1");
    expect(openApplication(e, input({ version: 2, migrations: { "2": [step] } })).ok).toBe(true);
    expect(query(e, "MATCH (m:_RelateApplication) RETURN m.v2 AS v").rows[0]!.v).toBeNull();
  });
});
