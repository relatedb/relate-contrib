// covers: FR-006, FR-007, FR-008, FR-009, SC-002, SC-005
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalText, revisionOf } from "@relate/web/build";
import { afterAll, describe, expect, it } from "vitest";
import { makeSite, type Site } from "../helpers/framework-site.js";

const loaders = (extra = "") => ({
  "docs/data/pantry.graph.json.js": `import { document } from "@relate/observable/loader";\nimport source from "../lib/pantry.js";\nawait document("pantry", source);\n`,
  "docs/data/pantry.descriptor.json.js": `import { descriptor } from "@relate/observable/loader";\nimport source from "../lib/pantry.js";\nawait descriptor("pantry", source, { indexes: [{ label: "Page", property: "id" }] });\n${extra}`,
  "docs/index.md": "# pantry\n\n```js\nconst d = await FileAttachment(\"data/pantry.descriptor.json\").json();\nconst g = await FileAttachment(\"data/pantry.graph.json\").json();\ndisplay(html`<p id=\"n\">${d.data.nodes} ${g.nodes.length}</p>`);\n```\n",
});

const source = (nodes: unknown[], links: unknown[]) => `export default () => ({ version: 1, nodes: ${JSON.stringify(nodes)}, links: ${JSON.stringify(links)} });\n`;
const NODES = [
  { id: "a", labels: ["Page"], properties: { title: "A", words: 10 } },
  { id: "b", labels: ["Page"], properties: { title: "B", words: 20 } },
  { id: "c", labels: ["Page"], properties: { title: "C", words: 30 } },
];
const LINKS = [
  { source: "a", target: "b", type: "LINKS_TO" },
  { source: "b", target: "c", type: "LINKS_TO", properties: { rank: 1 } },
];

const sites: Site[] = [];
const make = (name: string, lib: string): Site => {
  const s = makeSite(name, { ...loaders(), "docs/lib/pantry.js": lib });
  sites.push(s);
  return s;
};
afterAll(() => sites.forEach((s) => s.remove()));

const published = (site: Site, prefix: string): string => {
  const dir = join(site.dist, "_file/data");
  return site.read(join("dist/_file/data", readdirSync(dir).find((f) => f.startsWith(prefix))!));
};

describe("the document and descriptor loaders, in a build", () => {
  let base: Site;
  let result: { status: number | null; output: string };

  it("publishes the document and a descriptor whose revision is the document's, with counts and indexes", async () => {
    base = make("graphs-base", source(NODES, LINKS));
    result = await base.build();
    expect(result.status, result.output).toBe(0);
    const document = JSON.parse(published(base, "pantry.graph."));
    const descriptor = JSON.parse(published(base, "pantry.descriptor."));
    const { revision: carried, ...rest } = document;
    const text = canonicalText(rest);
    expect(JSON.stringify(rest)).toBe(text); // the canonical form, plus the revision key
    expect(descriptor.revision).toBe(await revisionOf(text));
    expect(carried).toBe(descriptor.revision);
    expect(descriptor).toMatchObject({ version: 1, id: "pantry", data: { url: "data/pantry.graph.json", nodes: 3, links: 2 }, indexes: [{ label: "Page", property: "id" }] });
    expect(descriptor.revision).toMatch(/^[0-9a-f]{12}$/);
  });

  it("gives the same revision from the same content in a different order of keys, nodes and links", async () => {
    const shuffled = make(
      "graphs-shuffled",
      source(
        [...NODES].reverse().map((n) => ({ properties: { words: n.properties.words, title: n.properties.title }, labels: n.labels, id: n.id })),
        [...LINKS].reverse().map((l) => ({ type: l.type, target: l.target, source: l.source, ...("properties" in l ? { properties: l.properties } : {}) })),
      ),
    );
    expect((await shuffled.build()).status).toBe(0);
    expect(JSON.parse(published(shuffled, "pantry.descriptor.")).revision).toBe(JSON.parse(published(base, "pantry.descriptor.")).revision);
  });

  it("gives another revision when one property changes", async () => {
    const changed = make("graphs-changed", source(NODES.map((n, i) => (i === 1 ? { ...n, properties: { ...n.properties, words: 21 } } : n)), LINKS));
    expect((await changed.build()).status).toBe(0);
    expect(JSON.parse(published(changed, "pantry.descriptor.")).revision).not.toBe(JSON.parse(published(base, "pantry.descriptor.")).revision);
  });
});

describe("a graph that cannot be published stops the build with the graph's name and the first problem", () => {
  it("an invalid document (a node without an id)", async () => {
    const bad = make("graphs-invalid", source([{ labels: ["Page"] }], []));
    const result = await bad.build();
    expect(result.status).not.toBe(0);
    expect(bad.loader("docs/data/pantry.graph.json.js").stderr).toMatch(/graph "pantry": nodes\[0\]/);
    expect(bad.loader("docs/data/pantry.descriptor.json.js").stderr).toMatch(/graph "pantry": nodes\[0\]/);
  });

  it("a malformed id", () => {
    const site = makeSite("graphs-id", {
      "docs/data/x.graph.json.js": `import { document } from "@relate/observable/loader";\nimport source from "../lib/s.js";\nawait document("Bad Name", source);\n`,
      "docs/lib/s.js": source(NODES, LINKS),
    });
    sites.push(site);
    const run = site.loader("docs/data/x.graph.json.js");
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/graph "Bad Name": id/);
  });

  it("a source that throws", () => {
    const site = make("graphs-throws", `export default () => { throw new Error("the pantry is empty"); };\n`);
    const run = site.loader("docs/data/pantry.graph.json.js");
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/graph "pantry": the source failed: the pantry is empty/);
  });

  it("a source that is not a function", () => {
    const site = make("graphs-not-function", `export default { version: 1, nodes: [], links: [] };\n`);
    const run = site.loader("docs/data/pantry.graph.json.js");
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/graph "pantry": the source must be a function/);
  });

  it("an index the descriptor rules refuse", () => {
    const site = makeSite("graphs-index", {
      "docs/data/pantry.descriptor.json.js": `import { descriptor } from "@relate/observable/loader";\nimport source from "../lib/pantry.js";\nawait descriptor("pantry", source, { indexes: [{ label: "", property: "id" }] });\n`,
      "docs/lib/pantry.js": source(NODES, LINKS),
    });
    sites.push(site);
    const run = site.loader("docs/data/pantry.descriptor.json.js");
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/graph "pantry": indexes/);
  });
});
