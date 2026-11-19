// covers: FR-004, FR-012, SC-006
import { describe, expect, it } from "vitest";
import { declare } from "../../src/server/graphs.js";

const source = () => ({ version: 1 as const, nodes: [], links: [] });

describe("declaring registered graphs", () => {
  it("accepts a map and defaults the lifetime to page and the indexes to none", () => {
    expect(declare({ shared: { source, lifetime: "visit", indexes: [{ label: "Page", property: "id" }] }, local: { source } })).toMatchObject([
      { id: "shared", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
      { id: "local", lifetime: "page", indexes: [] },
    ]);
  });

  it("rejects a name that breaks ADR-003's id rule, naming the graph", () => {
    expect(() => declare({ "Bad Name": { source } })).toThrow(/@relate\/contrib-nextjs: graph "Bad Name"/);
    expect(() => declare({ "": { source } })).toThrow(/graph ""/);
  });

  it("rejects a repeated name in a list of declarations", () => {
    expect(() => declare([{ id: "g", source }, { id: "g", source }])).toThrow('graph "g": the name is declared twice');
  });

  it("rejects a source that is not a function, a lifetime that is not listed, and a malformed index", () => {
    expect(() => declare({ g: { source: 3 as never } })).toThrow('graph "g": source must be a function');
    expect(() => declare({ g: { source, lifetime: "forever" as never } })).toThrow('lifetime "forever" is not "page" or "visit"');
    expect(() => declare({ g: { source, indexes: [{ label: "", property: "x" }] } })).toThrow(/graph "g": indexes\./);
  });
});
