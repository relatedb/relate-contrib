// covers: FR-014, FR-030, SC-006
import { afterAll, describe, expect, it } from "vitest";
import { build, type Built } from "../helpers/build-site.js";

const layoutServer = `import { catalog } from "@relate/contrib-sveltekit/server";
export const load = () => ({ catalog: catalog({ registered: { source: () => ({ version: 1, nodes: [], links: [] }) } }) });
`;
const layout = `<script>
  import { RelateProvider } from "@relate/contrib-sveltekit";
  let { data, children } = $props();
</script>
<RelateProvider catalog={data.catalog} engineUrl="/engine.wasm">{@render children()}</RelateProvider>
`;
const page = (body: string) => `<script>
  import { GraphData } from "@relate/contrib-sveltekit";
  const ok = { version: 1, nodes: [{ id: "a" }], links: [] };
</script>
${body}
`;
const site = (body: string, route = "p") => ({ "src/routes/+layout.server.ts": layoutServer, "src/routes/+layout.svelte": layout, "src/routes/+page.svelte": `<a href="/${route}">${route}</a>`, [`src/routes/${route}/+page.svelte`]: page(body) });

const built: Built[] = [];
afterAll(() => built.forEach((b) => b.remove()));
const make = async (name: string, body: string): Promise<Built> => {
  const b = await build({ name, files: site(body) });
  built.push(b);
  return b;
};

describe("a page that cannot render its inline graph fails the build, naming the page and the problem", () => {
  it("for an invalid document", async () => {
    const b = await make("inline-invalid", `<GraphData id="g" document={{ version: 1, nodes: [{ labels: ["x"] }], links: [] }} page="/p" />`);
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/\/p: inline graph "g": nodes\[0\]/);
  });

  it("for an invalid config", async () => {
    const b = await make("inline-config", `<GraphData id="g" document={ok} config={{ indexes: [{ label: "", property: "id" }] }} page="/p" />`);
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/inline graph "g": config\.indexes/);
  });

  it("for an id used twice in one render", async () => {
    const b = await make("inline-duplicate", `<GraphData id="g" document={ok} page="/p" /><GraphData id="g" document={ok} page="/p" />`);
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/\/p: inline graph "g": the name is used twice on this page/);
  });

  it("for an id that is also registered", async () => {
    const b = await make("inline-registered", `<GraphData id="registered" document={ok} page="/p" />`);
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/\/p: inline graph "registered": the name is also a registered graph/);
  });

  it("and a good page builds, with its element in the prerendered file", async () => {
    const b = await make("inline-good", `<GraphData id="g" document={ok} page="/p" />`);
    expect(b.status, b.output).toBe(0);
    expect(b.read("p.html")).toMatch(/<script type="application\/json" data-relate-graph="g">\{"document":\{"version":1,"nodes":\[\{"id":"a"\}\],"links":\[\]\},"config":\{\}\}<\/script>/);
  });
});
