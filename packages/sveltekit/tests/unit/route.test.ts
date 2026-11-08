// covers: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-030
import { canonicalText, revisionOf } from "@relate/web/build";
import { afterEach, describe, expect, it } from "vitest";
import { createGraphRoute } from "../../src/server/route.js";

const doc = (n = 3) => ({ version: 1 as const, nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, labels: ["Item"] })), links: [] });
const get = (route: ReturnType<typeof createGraphRoute>, id: string, file: string, base = "") =>
  route.GET({ params: { id, file }, url: new URL(`http://x${base}/relate/${id}/${file}`) });

afterEach(() => {
  process.env.NODE_ENV = "test";
});

describe("entries()", () => {
  it("lists a descriptor and a revision-named data file for each graph", async () => {
    const route = createGraphRoute({ a: { source: () => doc(2) }, b: { source: () => doc(3) } });
    const entries = await route.entries();
    expect(entries.map((e) => `${e.id}/${e.file.replace(/[0-9a-f]{12}/, "<rev>")}`)).toEqual(["a/descriptor.json", "a/graph.<rev>.json", "b/descriptor.json", "b/graph.<rev>.json"]);
  });

  it("fails, naming the graph, for a source whose output changes between evaluations (FR-009)", async () => {
    let n = 0;
    const route = createGraphRoute({ vary: { source: () => ({ version: 1 as const, nodes: [{ id: "a", properties: { n: n++ } }], links: [] }) } });
    await expect(route.entries()).rejects.toThrow(/graph "vary": the source is not deterministic/);
  });

  it("fails, naming the graph and the first problem's path, for an invalid document (FR-008)", async () => {
    const route = createGraphRoute({ bad: { source: () => ({ version: 1, nodes: [{ labels: ["x"] }], links: [] }) as never } });
    await expect(route.entries()).rejects.toThrow(/graph "bad": nodes\[0\]/);
  });

  it("fails, naming the graph, for a source that throws", async () => {
    const route = createGraphRoute({ boom: { source: () => { throw new Error("empty pantry"); } } });
    await expect(route.entries()).rejects.toThrow(/graph "boom": the source failed: empty pantry/);
  });
});

describe("GET", () => {
  it("answers the descriptor and the data file named by the revision, with matching revision and counts (FR-005, FR-007)", async () => {
    const route = createGraphRoute({ a: { source: () => doc(4), indexes: [{ label: "Item", property: "id" }] } });
    const [descriptor, data] = (await route.entries()).map((e) => e.file);
    const d = await (await get(route, "a", descriptor!)).json();
    const text = canonicalText(doc(4));
    expect(d.revision).toBe(await revisionOf(text));
    expect(d).toMatchObject({ version: 1, id: "a", data: { url: `/relate/a/graph.${d.revision}.json`, nodes: 4, links: 0 }, indexes: [{ label: "Item", property: "id" }] });
    expect(data).toBe(`graph.${d.revision}.json`);
    const res = await get(route, "a", data!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect((await res.json()).nodes).toHaveLength(4);
  });

  it("gives one revision whatever the order of keys and items in the source (FR-007)", async () => {
    const a = createGraphRoute({ g: { source: () => ({ version: 1 as const, nodes: [{ id: "x", labels: ["A"], properties: { p: 1, q: 2 } }, { id: "y" }], links: [] }) } });
    const b = createGraphRoute({ g: { source: () => ({ links: [], nodes: [{ id: "y" }, { properties: { q: 2, p: 1 }, labels: ["A"], id: "x" }], version: 1 as const }) } });
    expect((await a.entries())[1]!.file).toBe((await b.entries())[1]!.file);
  });

  it("carries the base path, derived from the request, in the descriptor's data location (FR-010)", async () => {
    const route = createGraphRoute({ a: { source: () => doc() } });
    await route.entries();
    expect((await (await get(route, "a", "descriptor.json", "/docs")).json()).data.url).toMatch(/^\/docs\/relate\/a\/graph\.[0-9a-f]{12}\.json$/);
    expect((await (await get(route, "a", "descriptor.json", "")).json()).data.url).toMatch(/^\/relate\/a\/graph\./);
  });

  it("answers an unlisted id, another revision and a path without /relate/ as not found (FR-006)", async () => {
    const route = createGraphRoute({ a: { source: () => doc() } });
    await route.entries();
    expect((await get(route, "nothing", "descriptor.json")).status).toBe(404);
    expect((await get(route, "a", "graph.000000000000.json")).status).toBe(404);
    expect((await get(route, "a", "other.json")).status).toBe(404);
    expect((await route.GET({ params: { id: "a", file: "descriptor.json" }, url: new URL("http://x/elsewhere/a/descriptor.json") })).status).toBe(404);
  });

  it("in development evaluates the source on each request, and a revision that is not current is not found (FR-006)", async () => {
    process.env.NODE_ENV = "development";
    let words = 1;
    const route = createGraphRoute({ a: { source: () => ({ version: 1 as const, nodes: [{ id: "a", properties: { words } }], links: [] }) } });
    const first = (await (await get(route, "a", "descriptor.json")).json()).revision;
    words = 2;
    const second = (await (await get(route, "a", "descriptor.json")).json()).revision;
    expect(second).not.toBe(first);
    expect((await get(route, "a", `graph.${second}.json`)).status).toBe(200);
    expect((await get(route, "a", `graph.${first}.json`)).status).toBe(404);
  });

  it("in development answers a source that throws with an error status and its message", async () => {
    process.env.NODE_ENV = "development";
    const route = createGraphRoute({ a: { source: () => { throw new Error("empty pantry"); } } });
    const res = await get(route, "a", "descriptor.json");
    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/graph "a": the source failed: empty pantry/);
  });
});
