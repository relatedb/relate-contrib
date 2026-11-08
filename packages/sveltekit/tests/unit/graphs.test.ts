// covers: FR-004, FR-012
import { describe, expect, it } from "vitest";
import { declare } from "../../src/server/graphs.js";

const source = () => ({ version: 1 as const, nodes: [], links: [] });

describe("the declaration check", () => {
  it("accepts a map and a list, with the defaults", () => {
    expect(declare({ pantry: { source } })).toEqual([{ id: "pantry", source, indexes: [], lifetime: "page" }]);
    expect(declare([{ id: "pantry", source, lifetime: "visit", indexes: [{ label: "Page", property: "id" }] }])[0]).toMatchObject({ lifetime: "visit", indexes: [{ label: "Page", property: "id" }] });
  });

  it("fails, naming the graph and the problem, for an id that breaks ADR-003's id rule", () => {
    expect(() => declare({ "Bad Name": { source } })).toThrow(/graph "Bad Name": id/);
    expect(() => declare({ "": { source } })).toThrow(/graph ""/);
  });

  it("fails for a duplicate id", () => {
    expect(() => declare([{ id: "a", source }, { id: "a", source }])).toThrow(/graph "a": the id is declared twice/);
  });

  it("fails for a source that is not a function and for a lifetime that is not listed", () => {
    expect(() => declare({ a: { source: {} as never } })).toThrow(/graph "a": the source must be a function/);
    expect(() => declare({ a: { source, lifetime: "forever" as never } })).toThrow(/graph "a": lifetime "forever"/);
  });

  it("fails for malformed indexes", () => {
    expect(() => declare({ a: { source, indexes: [{ label: "", property: "id" }] } })).toThrow(/graph "a": indexes/);
  });
});
