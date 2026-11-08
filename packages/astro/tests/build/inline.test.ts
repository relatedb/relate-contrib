// covers: FR-013, FR-014, FR-015, SC-006
import { afterEach, describe, expect, it } from "vitest";
import { buildSite, type Site } from "../helpers/build-site.js";

const doc = `{ version: 1, nodes: [{ id: "a", labels: ["P"] }, { id: "b" }], links: [{ source: "a", target: "b", type: "T" }] }`;
const pageWith = (body: string, frontmatter = "") => `---\nimport GraphData from "@relate/astro/graph-data";\n${frontmatter}\n---\n<html><body>${body}</body></html>\n`;
const registered = `{ graphs: { shared: { source: "./src/shared.ts" } } }`;
const sharedSource = `export default () => ({ version: 1, nodes: [{ id: "s" }], links: [] });\n`;

let site: Site | undefined;
afterEach(() => site?.cleanup());

describe("inline graphs at build time", () => {
  it("writes the document into the page as inert JSON, with its config", async () => {
    site = await buildSite({
      files: { "src/pages/index.astro": pageWith(`<GraphData id="recipe" document={${doc}} config={{ indexes: [{ label: "P", property: "id" }] }} />`) },
    });
    const html = site.read("index.html");
    const m = html.match(/<script type="application\/json" data-relate-graph="recipe">([^<]*)<\/script>/);
    expect(m).not.toBeNull();
    const payload = JSON.parse(m![1]!);
    expect(payload.document.nodes).toHaveLength(2);
    expect(payload.config.indexes).toEqual([{ label: "P", property: "id" }]);
    expect(site.files().some((f) => f.startsWith("_relate/"))).toBe(false); // no descriptor, no data file
  });

  it("builds one graph per page from each page's own content, with nothing in the integration options", async () => {
    const dynamic = `---\nimport GraphData from "@relate/astro/graph-data";\nexport function getStaticPaths() { return [{ params: { slug: "a" } }, { params: { slug: "b" } }]; }\nconst { slug } = Astro.params;\nconst document = { version: 1, nodes: [{ id: slug }], links: [] };\n---\n<html><body><GraphData id="recipe" document={document} /></body></html>\n`;
    site = await buildSite({ files: { "src/pages/recipes/[slug].astro": dynamic } });
    for (const slug of ["a", "b"]) {
      const m = site.read(`recipes/${slug}.html`).match(/data-relate-graph="recipe">([^<]*)</);
      expect(JSON.parse(m![1]!).document.nodes.map((n: { id: string }) => n.id)).toEqual([slug]);
    }
  });

  it("accepts two graphs with different names on one page, and the same name on different pages", async () => {
    const two = pageWith(`<GraphData id="one" document={${doc}} /><GraphData id="two" document={${doc}} />`);
    const other = pageWith(`<GraphData id="one" document={${doc}} />`);
    site = await buildSite({ files: { "src/pages/index.astro": two, "src/pages/other.astro": other } });
    expect(site.read("index.html").match(/data-relate-graph=/g)).toHaveLength(2);
    expect(site.read("other.html")).toContain('data-relate-graph="one"');
  });

  it("fails the build for an invalid document, naming the page and the path", async () => {
    const bad = pageWith(`<GraphData id="g" document={{ version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] }} />`);
    await expect(buildSite({ files: { "src/pages/index.astro": bad } })).rejects.toThrow(/inline graph "g": nodes\[1\]/);
  });

  it("fails the build for an invalid config", async () => {
    const bad = pageWith(`<GraphData id="g" document={${doc}} config={{ indexes: [{ label: "P" }] }} />`);
    await expect(buildSite({ files: { "src/pages/index.astro": bad } })).rejects.toThrow(/config\.indexes\[0\]/);
  });

  it("fails the build for a duplicate name on a page", async () => {
    const bad = pageWith(`<GraphData id="g" document={${doc}} /><GraphData id="g" document={${doc}} />`);
    await expect(buildSite({ files: { "src/pages/index.astro": bad } })).rejects.toThrow(/inline graph "g": the name is used twice/);
  });

  it("fails the build for a name that is also registered", async () => {
    const bad = pageWith(`<GraphData id="shared" document={${doc}} />`);
    await expect(buildSite({ files: { "src/pages/index.astro": bad, "src/shared.ts": sharedSource }, options: registered })).rejects.toThrow(/inline graph "shared": the name is also a registered graph/);
  });
});
