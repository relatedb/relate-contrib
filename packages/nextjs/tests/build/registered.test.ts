// covers: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, SC-002, SC-006, SC-007
import { afterAll, describe, expect, it } from "vitest";
import { buildSite } from "../helpers/build-site.js";
import type { Built, Bundler } from "../helpers/build-site.js";

const built: Built[] = [];
const build = (...args: Parameters<typeof buildSite>) => {
  const b = buildSite(...args);
  built.push(b);
  return b;
};
afterAll(() => built.forEach((b) => b.remove()));

const doc = (nodes: string) => `export const graphs = { g: { source: () => (${nodes}) } };\n`;
const nodesA = `{ version: 1, nodes: [{ id: "a" }, { id: "b" }], links: [{ source: "a", target: "b", type: "T" }] }`;
const nodesB = `{ version: 1, nodes: [{ id: "b" }, { id: "a" }], links: [{ source: "a", target: "b", type: "T" }] }`;
const nodesC = `{ version: 1, nodes: [{ id: "a", properties: { n: 2 } }, { id: "b" }], links: [{ source: "a", target: "b", type: "T" }] }`;

for (const bundler of ["turbopack", "webpack"] as Bundler[]) {
  describe(`build, ${bundler}`, () => {
    it("publishes a descriptor and a revision-named data file, under the base path in the descriptor, with the same revision for the same content in another order", () => {
      const a = build({ bundler, basePath: "/docs", files: { "lib/graphs.js": doc(nodesA) } });
      expect(a.status, a.output).toBe(0);
      const descriptor = JSON.parse(a.read("relate/g/descriptor.json"));
      expect(descriptor).toMatchObject({ version: 1, id: "g", data: { nodes: 2, links: 1 } });
      expect(descriptor.data.url).toBe(`/docs/relate/g/graph.${descriptor.revision}.json`);
      expect(JSON.parse(a.read(`relate/g/graph.${descriptor.revision}.json`)).nodes).toHaveLength(2);
      const b = build({ bundler, basePath: "/docs", files: { "lib/graphs.js": doc(nodesB) } });
      expect(JSON.parse(b.read("relate/g/descriptor.json")).revision).toBe(descriptor.revision);
      const c = build({ bundler, files: { "lib/graphs.js": doc(nodesC) } });
      expect(JSON.parse(c.read("relate/g/descriptor.json")).revision).not.toBe(descriptor.revision);
    });

    it("fails the build, naming the graph and the path of the first problem, for an invalid document", () => {
      const b = build({ bundler, files: { "lib/graphs.js": doc(`{ version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] }`) } });
      expect(b.status).not.toBe(0);
      expect(b.output).toMatch(/graph "g": nodes\[1\]/);
    });

    // The check compares two processes' evaluations (ADR-005), so the build is given several worker processes. With one
    // (Next's default on a machine with few cores, such as a CI runner) the source is evaluated once and nothing differs.
    it("fails the build, naming the graph, for a source that gives different content on each call", () => {
      const b = build({ bundler, config: "experimental: { cpus: 4 },", files: { "lib/graphs.js": `export const graphs = { g: { source: () => ({ version: 1, nodes: [{ id: "a" }, { id: String(Math.random()) }], links: [] }) } };\n` } });
      expect(b.status).not.toBe(0);
      expect(b.output).toMatch(/graph "g": revision mismatch/);
    });
  });
}

describe("build, server", () => {
  it("builds for the Node server and lists the graph's files as static routes", () => {
    const b = build({ mode: "server", files: { "lib/graphs.js": doc(nodesA) } });
    expect(b.status, b.output).toBe(0);
    expect(b.output).toMatch(/relate\/g\/descriptor\.json/);
  });

  it("rejects a name that breaks the id rule when the route is built", () => {
    const b = build({ files: { "lib/graphs.js": `export const graphs = { "Bad Name": { source: () => ({ version: 1, nodes: [], links: [] }) } };\n` } });
    expect(b.status).not.toBe(0);
    expect(b.output).toMatch(/graph "Bad Name"/);
  });
});
