// covers: FR-018, FR-021
import { describe, expect, it } from "vitest";
import { findInline } from "../../src/inline.js";
import { installDocument } from "../helpers/stubs.js";

describe("finding an inline graph", () => {
  it("takes the only element for an id, with its document and indexes", () => {
    installDocument([{ id: "g", document: { version: 1, nodes: [{ id: "a" }], links: [] }, indexes: [{ label: "Item", property: "id" }] }, { id: "other" }]);
    const found = findInline("g")!;
    expect(found.document).toEqual({ version: 1, nodes: [{ id: "a" }], links: [] });
    expect(found.indexes).toEqual([{ label: "Item", property: "id" }]);
  });

  it("with several elements for one id takes the first whose parent is visible", () => {
    const { nodes } = installDocument([{ id: "g", visible: false }, { id: "g", visible: true }, { id: "g", visible: true }]);
    expect(findInline("g")!.element).toBe(nodes[1]);
  });

  it("finds nothing for an id the page does not have", () => {
    installDocument([{ id: "g" }]);
    expect(findInline("nothing")).toBeNull();
    installDocument([{ id: "g", visible: false }, { id: "g", visible: false }]);
    expect(findInline("g")).toBeNull();
  });
});
