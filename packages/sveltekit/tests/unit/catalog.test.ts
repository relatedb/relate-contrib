// covers: FR-011
import { describe, expect, it } from "vitest";
import { catalog } from "../../src/server/catalog.js";

const source = () => ({ version: 1 as const, nodes: [], links: [] });

describe("the catalog", () => {
  const graphs = { example: { source, lifetime: "visit" as const, indexes: [{ label: "Page", property: "id" }] }, other: { source } };

  it("is plain data: it round-trips through JSON unchanged", () => {
    const c = catalog(graphs);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("holds ids, lifetimes and indexes, and no locations or sources", () => {
    expect(catalog(graphs)).toEqual([
      { id: "example", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
      { id: "other", lifetime: "page", indexes: [] },
    ]);
    expect(JSON.stringify(catalog(graphs))).not.toMatch(/url|descriptor|\/relate\//);
  });
});
