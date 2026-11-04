// covers: FR-011
import { afterEach, describe, expect, it } from "vitest";
import { startDev, type DevSite } from "../helpers/build-site.js";

const page = `---\n---\n<html><body>hi</body></html>\n`;
const source = (props: string) => `export default () => ({ version: 1, nodes: [{ id: "a", properties: { ${props} } }], links: [] });\n`;
const options = `{ graphs: { g: { source: "./src/graph.ts" } } }`;

let site: DevSite | undefined;
afterEach(async () => {
  await site?.stop();
});

const get = async (path: string) => {
  const res = await fetch(`${site!.url}${path}`);
  return { status: res.status, text: await res.text() };
};
const descriptor = async () => JSON.parse((await get("/_related/g/descriptor.json")).text);

describe("registered graphs in the development server", () => {
  it("serves the descriptor and the data it names", async () => {
    site = await startDev({ files: { "src/pages/index.astro": page, "src/graph.ts": source("n: 1") }, options });
    const d = await descriptor();
    const data = await get(d.data.url);
    expect(data.status).toBe(200);
    expect(JSON.parse(data.text).nodes).toHaveLength(1);
  });

  it("follows an edit of the source: the revision changes", async () => {
    site = await startDev({ files: { "src/pages/index.astro": page, "src/graph.ts": source("n: 1") }, options });
    const before = (await descriptor()).revision;
    site.write("src/graph.ts", source("n: 2"));
    let after = before;
    for (let i = 0; i < 40 && after === before; i++) {
      await new Promise((r) => setTimeout(r, 250));
      after = (await descriptor()).revision;
    }
    expect(after).not.toBe(before);
  });

  it("keeps running when the source fails, prints the error and answers with an error status until it is fixed", async () => {
    site = await startDev({ files: { "src/pages/index.astro": page, "src/graph.ts": source("n: 1") }, options });
    expect((await get("/_related/g/descriptor.json")).status).toBe(200);
    site.write("src/graph.ts", `export default () => ({ version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] });\n`);
    let failing = { status: 200, text: "" };
    for (let i = 0; i < 40 && failing.status === 200; i++) {
      await new Promise((r) => setTimeout(r, 250));
      failing = await get("/_related/g/descriptor.json");
    }
    expect(failing.status).toBe(500);
    expect(failing.text).toMatch(/graph "g": nodes\[1\]/);
    expect(site.logs.join("\n")).toMatch(/graph "g": nodes\[1\]/);
    expect((await get("/index.html")).status).toBe(200); // the server and its pages are still up
    site.write("src/graph.ts", source("n: 3"));
    let fixed = failing;
    for (let i = 0; i < 40 && fixed.status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 250));
      fixed = await get("/_related/g/descriptor.json");
    }
    expect(fixed.status).toBe(200);
  });
});
