// covers: FR-013, FR-014, FR-015
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GraphData, inlineText } from "../../src/server/GraphData.js";

const doc = { version: 1 as const, nodes: [{ id: "a", labels: ["X"] }, { id: "b" }], links: [{ source: "a", target: "b", type: "T" }] };

describe("GraphData", () => {
  it("renders one script element with escaped JSON and writes no descriptor or revision", () => {
    const html = renderToStaticMarkup(<GraphData id="notebook" document={doc} config={{ indexes: [{ label: "X", property: "id" }] }} />);
    expect(html.startsWith('<script type="application/json" data-related-graph="notebook">')).toBe(true);
    expect((html.match(/<script/g) ?? []).length).toBe(1);
    const payload = JSON.parse(html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
    expect(payload.document.nodes).toHaveLength(2);
    expect(payload.config).toEqual({ indexes: [{ label: "X", property: "id" }] });
    expect(html).not.toContain("revision");
  });

  it("escapes what could close the element", () => {
    const html = renderToStaticMarkup(<GraphData id="g" document={{ ...doc, nodes: [{ id: "</script><!--" }] , links: [] }} />);
    expect(html.slice("<script".length, -"</script>".length)).not.toContain("</script>");
    expect(html).toContain("\\u003c/script\\u003e");
  });

  it("lets a page carry several graphs with different names", () => {
    const seen = new Set<string>();
    expect(() => {
      inlineText({ id: "alpha", document: doc }, seen, []);
      inlineText({ id: "beta", document: doc }, seen, []);
    }).not.toThrow();
  });

  it("fails for an invalid document, a duplicate name and a registered name, naming the page and the graph", () => {
    expect(() => inlineText({ id: "g", page: "/inline", document: { ...doc, nodes: [{ id: "a" }, { id: "a" }] } }, new Set(), [])).toThrow(/\/inline: inline graph "g": nodes\[1\]/);
    const seen = new Set<string>();
    inlineText({ id: "g", document: doc }, seen, []);
    expect(() => inlineText({ id: "g", page: "/p", document: doc }, seen, [])).toThrow(/\/p: inline graph "g": the name is used twice/);
    expect(() => inlineText({ id: "shared", page: "/p", document: doc }, new Set(), ["shared"])).toThrow(/inline graph "shared": the name is also a registered graph/);
    expect(() => inlineText({ id: "g", document: doc, config: { colour: 1 } as never }, new Set(), [])).toThrow("config.colour: unknown setting");
  });
});
