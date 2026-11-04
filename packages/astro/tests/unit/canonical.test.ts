// covers: FR-007, SC-002
import { describe, expect, it } from "vitest";
import { canonicalText, prepare, revisionOf } from "../../src/sources.js";

const doc = (over: Record<string, unknown> = {}) => ({
  version: 1,
  nodes: [
    { id: "b", labels: ["X"], properties: { z: 1, a: [3, 1, 2] } },
    { id: "a", labels: ["X"] },
  ],
  links: [
    { source: "b", target: "a", type: "T" },
    { source: "a", target: "b", type: "T", properties: { w: 2 } },
  ],
  ...over,
});

describe("canonical form and revision", () => {
  it("is the same for the same content in another order of keys, nodes and links", () => {
    const reordered = {
      links: [
        { type: "T", target: "b", source: "a", properties: { w: 2 } },
        { target: "a", source: "b", type: "T" },
      ],
      nodes: [
        { labels: ["X"], id: "a" },
        { properties: { a: [3, 1, 2], z: 1 }, id: "b", labels: ["X"] },
      ],
      version: 1,
    };
    expect(prepare("g", reordered).revision).toBe(prepare("g", doc()).revision);
    expect(canonicalText(reordered as never)).toBe(canonicalText(doc() as never));
  });

  it("changes when one property changes", () => {
    const changed = doc({ nodes: [{ id: "b", labels: ["X"], properties: { z: 2, a: [3, 1, 2] } }, { id: "a", labels: ["X"] }] });
    expect(prepare("g", changed).revision).not.toBe(prepare("g", doc()).revision);
  });

  it("keeps the order of an array property, because the order is data", () => {
    const swapped = doc({ nodes: [{ id: "b", labels: ["X"], properties: { z: 1, a: [1, 2, 3] } }, { id: "a", labels: ["X"] }] });
    expect(prepare("g", swapped).revision).not.toBe(prepare("g", doc()).revision);
  });

  it("ignores a revision the author wrote into the document", () => {
    expect(prepare("g", doc({ revision: "mine" })).revision).toBe(prepare("g", doc()).revision);
    expect(canonicalText(doc({ revision: "mine" }) as never)).not.toContain("mine");
  });

  it("is 12 hexadecimal digits, and counts the nodes and links", () => {
    const r = prepare("g", doc());
    expect(r.revision).toMatch(/^[0-9a-f]{12}$/);
    expect(r.revision).toBe(revisionOf(r.text));
    expect([r.nodes, r.links]).toEqual([2, 2]);
  });

  it("fails with the graph's name and the path of the first problem", () => {
    expect(() => prepare("g", doc({ nodes: [{ id: "a" }, { id: "a" }] }))).toThrow(/graph "g": nodes\[1\]/);
  });
});
