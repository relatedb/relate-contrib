// covers: FR-010, SC-002
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { checkAgreement } from "@relate/web/validate";
import { afterAll, describe, expect, it } from "vitest";
import { makeSite, type Site } from "../helpers/framework-site.js";

const files = (lib: string) => ({
  "docs/data/pantry.graph.json.js": `import { document } from "@relate/observable/loader";\nimport source from "../lib/pantry.js";\nawait document("pantry", source);\n`,
  "docs/data/pantry.descriptor.json.js": `import { descriptor } from "@relate/observable/loader";\nimport source from "../lib/pantry.js";\nawait descriptor("pantry", source);\n`,
  "docs/index.md": "# pantry\n\n```js\nconst d = await FileAttachment(\"data/pantry.descriptor.json\").json();\nconst g = await FileAttachment(\"data/pantry.graph.json\").json();\ndisplay(html`<p>${d.revision} ${g.nodes.length}</p>`);\n```\n",
  "docs/lib/pantry.js": lib,
});
const lib = (words: number) => `export default () => ({ version: 1, nodes: [{ id: "a", properties: { words: ${words} } }], links: [] });\n`;
const revisionOf = (site: Site): string => {
  const dir = join(site.dist, "_file/data");
  return JSON.parse(site.read(join("dist/_file/data", readdirSync(dir).find((f) => f.startsWith("pantry.descriptor."))!))).revision;
};

const sites: Site[] = [];
afterAll(() => sites.forEach((s) => s.remove()));

describe("a loader's cached output (research V-4, ADR-006 §2.2)", () => {
  it("follows an edit to the graph source after a clean, and not without one", async () => {
    const site = makeSite("fresh", files(lib(10)));
    sites.push(site);
    expect((await site.build()).status).toBe(0);
    const first = revisionOf(site);

    site.write("docs/lib/pantry.js", lib(11));
    expect((await site.run(["build"])).status).toBe(0); // no clean: Framework reuses the cached output
    expect(revisionOf(site)).toBe(first);

    expect((await site.build()).status).toBe(0); // clean, then build
    expect(revisionOf(site)).not.toBe(first);
  });

  it("builds twice to the same revision from an unchanged source", async () => {
    const site = makeSite("fresh-twice", files(lib(10)));
    sites.push(site);
    await site.build();
    const first = revisionOf(site);
    await site.build();
    expect(revisionOf(site)).toBe(first);
  });

  it("gives a document and a descriptor that the core's agreement check refuses when the source is not deterministic", () => {
    const site = makeSite("fresh-random", files(`export default () => ({ version: 1, nodes: [{ id: "a", properties: { n: Math.random() } }], links: [] });\n`));
    sites.push(site);
    const document = JSON.parse(site.loader("docs/data/pantry.graph.json.js").stdout.toString());
    const descriptor = JSON.parse(site.loader("docs/data/pantry.descriptor.json.js").stdout.toString());
    expect(document.revision).not.toBe(descriptor.revision);
    const agreement = checkAgreement(descriptor, document);
    expect(agreement.ok).toBe(false);
    expect(agreement).toMatchObject({ path: "revision" });
  });
});
