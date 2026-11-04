// covers: FR-022
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { visitGraph } from "../../src/client/registry.js";

const inlineScripts: string[] = [];
beforeEach(() => {
  vi.stubGlobal("document", {
    querySelectorAll: () => inlineScripts.map((name) => ({ getAttribute: () => name, textContent: JSON.stringify({ document: { version: 1, nodes: [], links: [] } }) })),
  });
});
afterEach(() => {
  inlineScripts.length = 0;
  vi.unstubAllGlobals();
});

describe("the direct lookup", () => {
  it("rejects a page-lifetime registered graph, naming it and saying where to ask", () => {
    expect(() => visitGraph("recipes")).toThrow(/"recipes" has the "page" lifetime; ask for it from the page's setup \(onPage\)/);
  });

  it("rejects an inline graph of the current page", () => {
    inlineScripts.push("notebook");
    expect(() => visitGraph("notebook")).toThrow(/"notebook" is an inline graph of a page; ask for it from the page's setup/);
  });

  it("rejects an unknown name, listing the registered names", () => {
    expect(() => visitGraph("nope")).toThrow(/no registered graph named "nope" \(registered: site, recipes\)/);
  });
});
