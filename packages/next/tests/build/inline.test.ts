// covers: FR-013, FR-014, SC-006
import { afterAll, describe, expect, it } from "vitest";
import { buildSite } from "../helpers/build-site.js";
import type { Built } from "../helpers/build-site.js";

const built: Built[] = [];
const build = (...args: Parameters<typeof buildSite>) => {
  const b = buildSite(...args);
  built.push(b);
  return b;
};
afterAll(() => built.forEach((b) => b.remove()));

const page = (jsx: string) => ({
  "app/inline/page.jsx": `import { GraphData } from "@relate/web-next/server";
const ok = { version: 1, nodes: [{ id: "a" }, { id: "b" }], links: [] };
export default function Page() { return <main>${jsx}</main>; }
`,
});

describe("inline graphs in a build", () => {
  it("writes one script element per graph into the page, and nothing else", () => {
    const b = build({ files: page(`<GraphData id="alpha" document={ok} /><GraphData id="beta" document={ok} config={{ indexes: [{ label: "X", property: "id" }] }} />`) });
    expect(b.status, b.output).toBe(0);
    const html = b.read("inline.html");
    expect((html.match(/data-relate-graph="/g) ?? []).length).toBe(2);
    expect(html).toContain('data-relate-graph="alpha"');
  });

  it("fails the build, naming the page and the path of the first problem, for an invalid document", () => {
    const b = build({ files: page(`<GraphData id="notebook" document={{ version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] }} />`) });
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/inline graph "notebook": nodes\[1\]/);
    expect(b.output).toMatch(/\/inline/);
  });

  it("fails for an invalid config", () => {
    const b = build({ files: page(`<GraphData id="notebook" document={ok} config={{ colour: 1 }} />`) });
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/config\.colour: unknown setting/);
  });

  it("fails for a second use of one name in one render", () => {
    const b = build({ files: page(`<GraphData id="twice" document={ok} /><GraphData id="twice" document={ok} />`) });
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/inline graph "twice": the name is used twice/);
  });

  it("fails for a name that is also registered", () => {
    const b = build({ files: page(`<GraphData id="g" document={ok} />`) });
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/inline graph "g": the name is also a registered graph/);
  });
});
