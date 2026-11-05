// covers: FR-003, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, SC-002, SC-006
import { afterEach, describe, expect, it } from "vitest";
import { buildSite, type Site } from "../helpers/build-site.js";

const page = `---\n---\n<html><body>hi</body></html>\n`;
const good = `export default () => ({ version: 1, nodes: [{ id: "a", labels: ["P"], properties: { n: 1 } }, { id: "b", labels: ["P"] }], links: [{ source: "a", target: "b", type: "T" }] });\n`;
const options = (extra = "") => `{ graphs: { g: { source: "./src/graph.ts", indexes: [{ label: "P", property: "id" }]${extra} } } }`;

let site: Site | undefined;
afterEach(() => site?.cleanup());

const descriptorOf = (s: Site, name = "g") => JSON.parse(s.read(`_relate/${name}/descriptor.json`));

describe("registered graphs at build time", () => {
  it("publishes a revision-named data file and a descriptor that agree", async () => {
    site = await buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good }, options: options() });
    const d = descriptorOf(site);
    expect(d).toMatchObject({ version: 1, id: "g", data: { nodes: 2, links: 1 }, indexes: [{ label: "P", property: "id" }] });
    expect(d.revision).toMatch(/^[0-9a-f]{12}$/);
    expect(d.data.url).toBe(`/_relate/g/graph.${d.revision}.json`);
    const data = JSON.parse(site.read(`_relate/g/graph.${d.revision}.json`));
    expect(data.nodes).toHaveLength(2);
    expect(data.revision).toBeUndefined();
  });

  it("publishes a JSON file source the same way", async () => {
    const json = JSON.stringify({ version: 1, nodes: [{ id: "x" }], links: [] });
    site = await buildSite({ files: { "src/pages/index.astro": page, "src/data.json": json }, options: `{ graphs: { j: { source: "./src/data.json" } } }` });
    const d = descriptorOf(site, "j");
    expect(d.data.nodes).toBe(1);
    expect(site.exists(`_relate/j/graph.${d.revision}.json`)).toBe(true);
  });

  it("gives the same revision for the same content in two builds, and another when a property changes", async () => {
    const a = await buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good }, options: options() });
    const b = await buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good }, options: options() });
    const c = await buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good.replace("properties: { n: 1 }", "properties: { n: 2 }") }, options: options() });
    try {
      expect(descriptorOf(a).revision).toBe(descriptorOf(b).revision);
      expect(descriptorOf(c).revision).not.toBe(descriptorOf(a).revision);
    } finally {
      a.cleanup();
      b.cleanup();
      c.cleanup();
    }
  });

  it("evaluates a source once per build", async () => {
    const counting = `export default () => { globalThis.__evaluations = (globalThis.__evaluations ?? 0) + 1; return { version: 1, nodes: [{ id: "a" }], links: [] }; };\n`;
    (globalThis as { __evaluations?: number }).__evaluations = 0;
    site = await buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": counting }, options: options() });
    expect((globalThis as { __evaluations?: number }).__evaluations).toBe(1);
  });

  it("includes a non-root base path in the descriptor's data URL", async () => {
    site = await buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good }, options: options(), base: "/docs" });
    const d = descriptorOf(site);
    expect(d.data.url).toBe(`/docs/_relate/g/graph.${d.revision}.json`);
  });

  it("fails the build for an invalid document, naming the graph and the path of the first problem", async () => {
    const bad = `export default () => ({ version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] });\n`;
    await expect(buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": bad }, options: options() })).rejects.toThrow(/graph "g": nodes\[1\]/);
  });

  it("fails the build when a source throws", async () => {
    const boom = `export default () => { throw new Error("no content"); };\n`;
    await expect(buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": boom }, options: options() })).rejects.toThrow(/graph "g": the source failed: no content/);
  });

  it("reports an output setting other than static", async () => {
    await expect(buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good }, options: options(), output: "server" })).rejects.toThrow(/only static output is supported/);
  });

  it("fails at configuration time for a malformed name", async () => {
    await expect(buildSite({ files: { "src/pages/index.astro": page, "src/graph.ts": good }, options: `{ graphs: { "bad name": { source: "./src/graph.ts" } } }` })).rejects.toThrow(/graphs\.bad name/);
  });
});
