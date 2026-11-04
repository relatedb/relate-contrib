// covers: FR-013, FR-014, FR-015
import { describe, expect, it } from "vitest";
import { checkInline, escapeJson } from "../../src/inline.js";

const doc = { version: 1, nodes: [{ id: "a", labels: ["P"] }], links: [] };
const check = (id: string, document: unknown = doc, config?: object, seen = new Set<string>(), registered: string[] = []) => checkInline("/p", id, document, config, seen, registered);

describe("escapeJson", () => {
  it("cannot close or open anything inside a script element", () => {
    const text = escapeJson({ s: "</script><!-- & \u2028 \u2029" });
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual({ s: "</script><!-- & \u2028 \u2029" });
  });
});

describe("checkInline", () => {
  it("accepts a valid document and carries its indexes", () => {
    const r = check("recipe", doc, { indexes: [{ label: "P", property: "id" }] });
    expect(r.document.nodes).toHaveLength(1);
    expect(r.config.indexes).toEqual([{ label: "P", property: "id" }]);
  });

  it("has an empty config by default", () => {
    expect(check("recipe").config).toEqual({});
  });

  it.each([
    ["an invalid document", () => check("g", { version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] }), /\/p: inline graph "g": nodes\[1\]/],
    ["a malformed name", () => check("bad name"), /inline graph "bad name": id/],
    ["a name used twice on the page", () => check("g", doc, undefined, new Set(["g"])), /inline graph "g": the name is used twice/],
    ["a name that is also registered", () => check("g", doc, undefined, new Set(), ["g"]), /inline graph "g": the name is also a registered graph/],
    ["an index with no property", () => check("g", doc, { indexes: [{ label: "P" } as never] }), /config\.indexes\[0\]/],
    ["an unknown setting", () => check("g", doc, { depth: 3 }), /config\.depth: unknown setting/],
  ])("fails for %s, naming the page and the graph", (_label, run, message) => {
    expect(run).toThrow(message);
  });

  it("records the name so a second use on the same page fails", () => {
    const seen = new Set<string>();
    check("g", doc, undefined, seen);
    expect(() => check("g", doc, undefined, seen)).toThrow(/used twice/);
  });
});
