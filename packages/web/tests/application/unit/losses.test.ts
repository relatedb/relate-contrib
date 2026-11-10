// covers-app: FR-021, SC-006
import { describe, expect, it } from "vitest";
import { exportApplication, readDocument } from "../../../src/worker/application/transfer.js";
import { query, world } from "./helpers.js";

async function withNodes(...statements: string[]) {
  const w = await world();
  await w.open({ seed: { version: 1, nodes: [], links: [] }, indexes: [] });
  for (const s of statements) query(w.e, s);
  return w.e;
}
const kinds = (e: Awaited<ReturnType<typeof withNodes>>) => Object.fromEntries(readDocument(e).losses.map((l) => [l.kind, l.count]));

describe("loss detection reads each value with its type", () => {
  it("integers beyond 2^53, in either direction, but not 2^53 - 1", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', big: 9007199254740993, neg: -9007199254740993, ok: 9007199254740991})");
    expect(kinds(e)).toEqual({ "integer-beyond-2^53": 2 });
    const doc = readDocument(e).document;
    expect(doc.nodes[0]!.properties!.ok).toBe(9007199254740991);
  });

  it("whole-number floats but not fractional ones", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', f: 2.0, g: 2.5})");
    expect(kinds(e)).toEqual({ "whole-number-float": 1 });
  });

  it("dates, datetimes and durations", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', d: date('2024-01-02'), dt: datetime('2024-01-02T03:04:05Z'), dur: duration('P1D')})");
    expect(kinds(e)).toEqual({ date: 2, duration: 1 });
    expect(readDocument(e).document.nodes[0]!.properties).toMatchObject({ d: "2024-01-02", dur: "P1D" });
  });

  it("points (left out) and empty lists (left out), but not non-empty lists", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', p: point({x: 1, y: 2}), e: [], l: [1, 2], s: ['x']})");
    expect(kinds(e)).toEqual({ point: 1, "empty-list": 1 });
    expect(Object.keys(readDocument(e).document.nodes[0]!.properties!).sort()).toEqual(["l", "s"]);
  });

  it("a node whose id is not a string or is missing, with the links that end at it", async () => {
    const e = await withNodes(
      "CREATE (:T {id: 7}), (:T {name: 'anon'}), (:T {id: 'ok'})",
      "MATCH (a:T {id: 'ok'}), (b:T {id: 7}) CREATE (a)-[:R]->(b)",
    );
    const report = readDocument(e).losses;
    expect(report).toEqual([{ kind: "node-without-string-id", count: 2, droppedLinks: 1 }]);
    expect(readDocument(e).document.nodes.map((n) => n.id)).toEqual(["ok"]);
  });

  it("reads a property that holds an integer, a string and a float correctly, value by value", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', m: 1}), (:T {id: 'b', m: 'text'}), (:T {id: 'c', m: 2.0}), (:T {id: 'd', m: 3.5})");
    expect(kinds(e)).toEqual({ "whole-number-float": 1 });
    const by = Object.fromEntries(readDocument(e).document.nodes.map((n) => [n.id, n.properties!.m]));
    expect(by).toEqual({ a: 1, b: "text", c: 2, d: 3.5 });
  });

  it("lists: an all-whole float list is a loss, a list with a fractional element is not; large integers and dates inside lists are", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', fl: [1.0, 2.0], fm: [1.5, 2.0], big: [9007199254740993], dl: [date('2024-01-01')]})");
    expect(kinds(e)).toEqual({ "whole-number-float": 1, "integer-beyond-2^53": 1, date: 1 });
    expect(readDocument(e).document.nodes[0]!.properties!.fm).toEqual([1.5, 2]);
  });

  it("a graph with no losses reports none, and values the store cannot hold never arrive (maps, mixed and nested lists)", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', n: 1, s: 'x', b: true, l: [1, 2]})");
    expect(readDocument(e).losses).toEqual([]);
    expect(() => query(e, "CREATE (:T {id: 'm', mp: {a: 1}})")).toThrow(/InvalidPropertyType/);
    expect(() => query(e, "CREATE (:T {id: 'm', ml: [1, 'a']})")).toThrow(/InvalidPropertyType/);
    expect(() => query(e, "CREATE (:T {id: 'm', nl: [[1], [2]]})")).toThrow(/InvalidPropertyType/);
  });

  it("counts relationship properties too", async () => {
    const e = await withNodes("CREATE (:T {id: 'a'})-[:R {w: 2.0}]->(:T {id: 'b'})");
    expect(kinds(e)).toEqual({ "whole-number-float": 1 });
    expect(readDocument(e).document.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("exportApplication rejects (null envelope) without allowLoss and returns the document with it", async () => {
    const e = await withNodes("CREATE (:T {id: 'a', f: 2.0})");
    const a = { name: "x", version: 1 };
    expect(exportApplication(e, a, false)).toMatchObject({ envelope: null, losses: [{ kind: "whole-number-float", count: 1 }] });
    const ok = exportApplication(e, a, true);
    expect(ok.envelope!.document.nodes[0]!.properties).toEqual({ f: 2 });
  });
});
