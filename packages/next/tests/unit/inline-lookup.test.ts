// covers: FR-018, FR-021
import { describe, expect, it } from "vitest";
import { findInline } from "../../src/client/inline.js";

interface Stub {
  name: string;
  text: string;
  visible?: boolean;
}

// A document with just the part of the DOM the lookup uses.
const documentOf = (...scripts: Stub[]) => {
  const elements = scripts.map((s) => ({
    getAttribute: (a: string) => (a === "data-related-graph" ? s.name : null),
    textContent: s.text,
    parentElement: { checkVisibility: () => s.visible ?? true },
  }));
  return { elements, root: { querySelectorAll: () => elements } as never };
};
const payload = (n: number) => JSON.stringify({ document: { version: 1, nodes: Array.from({ length: n }, (_, i) => ({ id: String(i) })), links: [] }, config: { indexes: [{ label: "X", property: "id" }] } });

describe("finding an inline graph", () => {
  it("returns nothing when the document has none with that name", () => {
    expect(findInline("a", documentOf({ name: "b", text: payload(1) }).root)).toBeNull();
  });

  it("takes the only match, even when its parent is not visible", () => {
    const d = documentOf({ name: "a", text: payload(2), visible: false });
    const found = findInline("a", d.root);
    expect(found?.element).toBe(d.elements[0]);
    expect(found?.indexes).toEqual([{ label: "X", property: "id" }]);
  });

  it("takes the first match whose parent is visible when several share the name", () => {
    const d = documentOf({ name: "a", text: payload(1), visible: false }, { name: "a", text: payload(3), visible: true }, { name: "a", text: payload(4), visible: true });
    const found = findInline("a", d.root);
    expect(found?.element).toBe(d.elements[1]);
    expect((found?.document as { nodes: unknown[] }).nodes).toHaveLength(3);
  });

  it("returns nothing when several share the name and none is visible", () => {
    expect(findInline("a", documentOf({ name: "a", text: payload(1), visible: false }, { name: "a", text: payload(2), visible: false }).root)).toBeNull();
  });
});
