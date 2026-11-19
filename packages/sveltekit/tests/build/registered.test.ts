// covers: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-012, FR-030, SC-002, SC-006
import { canonicalText, revisionOf } from "@relate/contrib-web/build";
import { afterAll, describe, expect, it } from "vitest";
import { build, serveNode, type Built } from "../helpers/build-site.js";

const graphs = `const rev = process.env.REV ?? "1";
const make = () => ({ version: 1, nodes: Array.from({ length: 3 }, (_, i) => ({ id: "n" + i, labels: ["Item"], properties: { rev } })), links: [] });
let n = 0;
const bad = process.env.BAD;
export const graphs =
  bad === "throw" ? { bad: { source: () => { throw new Error("empty pantry"); } } }
  : bad === "random" ? { bad: { source: () => ({ version: 1, nodes: [{ id: "a", properties: { n: n++ } }], links: [] }) } }
  : bad === "invalid" ? { bad: { source: () => ({ version: 1, nodes: [{ labels: ["x"] }], links: [] }) } }
  : bad === "duplicate" ? [{ id: "a", source: make }, { id: "a", source: make }]
  : bad === "malformed" ? { "Bad Name": { source: make } }
  : { example: { source: make, indexes: [{ label: "Item", property: "id" }] } };
`;
const route = `import { createGraphRoute } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs as never);
`;
const files = { "src/lib/graphs.ts": graphs, "src/routes/relate/[id]/[file]/+server.ts": route };

const built: Built[] = [];
const make = async (name: string, options: { adapter?: "static" | "node"; base?: string; env?: Record<string, string> } = {}): Promise<Built> => {
  const b = await build({ name, files, ...options });
  built.push(b);
  return b;
};
afterAll(() => built.forEach((b) => b.remove()));

const expected = async (rev = "1") => {
  const doc = { version: 1 as const, nodes: Array.from({ length: 3 }, (_, i) => ({ id: `n${i}`, labels: ["Item"], properties: { rev } })), links: [] };
  return { text: canonicalText(doc as never), revision: await revisionOf(canonicalText(doc as never)) };
};

describe("a static build", () => {
  let first: Built;
  it("publishes the descriptor and the revision-named data file, with matching revision, counts and indexes", async () => {
    first = await make("registered-static");
    expect(first.status, first.output).toBe(0);
    const { text, revision } = await expected();
    const descriptor = JSON.parse(first.read("relate/example/descriptor.json"));
    expect(descriptor).toEqual({ version: 1, id: "example", revision, data: { url: `/relate/example/graph.${revision}.json`, nodes: 3, links: 0 }, indexes: [{ label: "Item", property: "id" }] });
    expect(first.list("relate/example").sort()).toEqual(["descriptor.json", `graph.${revision}.json`]);
    expect(JSON.parse(first.read(`relate/example/graph.${revision}.json`))).toEqual(JSON.parse(text));
  });

  it("gives one revision from the same content, and another when one property changes (SC-002)", async () => {
    const same = await make("registered-same");
    const changed = await make("registered-changed", { env: { REV: "2" } });
    const rev = (b: Built) => JSON.parse(b.read("relate/example/descriptor.json")).revision;
    expect(rev(same)).toBe(rev(first));
    expect(rev(changed)).not.toBe(rev(first));
    expect(rev(changed)).toBe((await expected("2")).revision);
  });
});

describe("a build under a base path", () => {
  it("publishes the same files and carries the base in the descriptor's data location (FR-010)", async () => {
    const b = await make("registered-base", { base: "/docs" });
    expect(b.status, b.output).toBe(0);
    const d = JSON.parse(b.read("relate/example/descriptor.json"));
    expect(d.data.url).toBe(`/docs/relate/example/graph.${d.revision}.json`);
    expect(b.exists(`relate/example/graph.${d.revision}.json`)).toBe(true);
  });
});

describe("a Node build", () => {
  it("serves the prerendered files and answers anything else as not found (FR-006)", async () => {
    const b = await make("registered-node", { adapter: "node" });
    expect(b.status, b.output).toBe(0);
    expect(b.exists("prerendered/relate/example/descriptor.json")).toBe(true);
    const server = await serveNode(b, 5496);
    try {
      const response = await fetch(`${server.origin}/relate/example/descriptor.json`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/application\/json/);
      const d = await response.json();
      expect((await fetch(server.origin + d.data.url)).status).toBe(200);
      expect((await fetch(`${server.origin}/relate/example/graph.000000000000.json`)).status).toBe(404);
      expect((await fetch(`${server.origin}/relate/nothing/descriptor.json`)).status).toBe(404);
    } finally {
      server.stop();
    }
  });
});

describe("a build that cannot publish stops with the graph's name and the first problem", () => {
  for (const [bad, message] of [
    ["throw", /graph "bad": the source failed: empty pantry/],
    ["random", /graph "bad": the source is not deterministic/],
    ["invalid", /graph "bad": nodes\[0\]/],
    ["duplicate", /graph "a": the id is declared twice/],
    ["malformed", /graph "Bad Name": /],
  ] as const) {
    it(`for BAD=${bad}`, async () => {
      const b = await make(`registered-${bad}`, { env: { BAD: bad } });
      expect(b.status).not.toBe(0);
      expect(b.output).toMatch(message);
    });
  }
});
