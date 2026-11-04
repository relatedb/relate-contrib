// covers: FR-002, FR-004, FR-005, SC-006
import { describe, expect, it } from "vitest";
import { resolveOptions } from "../../src/options.js";

const exists = () => true;
const root = "/site";

describe("resolveOptions", () => {
  it("defaults to multi-page and the page lifetime", () => {
    const r = resolveOptions({ graphs: { a: { source: "./a.ts" } } }, root, exists);
    expect(r.navigation).toBe("multi-page");
    expect(r.graphs).toEqual([{ name: "a", source: "/site/a.ts", indexes: [], lifetime: "page" }]);
  });

  it("accepts no options at all", () => {
    expect(resolveOptions(undefined, root, exists)).toEqual({ graphs: [], navigation: "multi-page" });
  });

  it("keeps the lifetime, navigation and indexes it is given", () => {
    const r = resolveOptions({ navigation: "client-routing", graphs: { site: { source: "/abs/s.json", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] } } }, root, exists);
    expect(r.navigation).toBe("client-routing");
    expect(r.graphs[0]).toEqual({ name: "site", source: "/abs/s.json", indexes: [{ label: "Page", property: "id" }], lifetime: "visit" });
  });

  it.each([
    ["a name that breaks the id rule", { "bad name!": { source: "./a.ts" } }, /graphs\.bad name!: id/],
    ["an empty name", { "": { source: "./a.ts" } }, /graphs\.: id/],
    ["a lifetime that is not listed", { a: { source: "./a.ts", lifetime: "forever" as never } }, /graphs\.a: lifetime must be/],
    ["an index with no label", { a: { source: "./a.ts", indexes: [{ property: "x" } as never] } }, /graphs\.a: indexes\[0\]/],
    ["a missing source", { a: {} as never }, /graphs\.a: source must be a path/],
  ])("fails for %s", (_label, graphs, message) => {
    expect(() => resolveOptions({ graphs }, root, exists)).toThrow(message);
  });

  it("fails for a navigation value that is not listed", () => {
    expect(() => resolveOptions({ navigation: "spa" as never }, root, exists)).toThrow(/navigation must be/);
  });

  it("fails for a source file that does not exist, naming the entry", () => {
    expect(() => resolveOptions({ graphs: { a: { source: "./gone.ts" } } }, root, () => false)).toThrow(/graphs\.a: the source \.\/gone\.ts does not exist/);
  });
});
