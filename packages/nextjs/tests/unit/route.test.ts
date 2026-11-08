// covers: FR-005, FR-006, FR-007, FR-009, FR-010
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGraphRoute } from "../../src/server/route.js";

const doc = (extra: Array<{ id: string }> = []) => ({ version: 1 as const, nodes: [{ id: "a", labels: ["X"] }, ...extra], links: [] });
const get = (route: ReturnType<typeof createGraphRoute>, id: string, file: string) => route.GET(new Request("http://x/"), { params: Promise.resolve({ id, file }) });

afterEach(() => vi.unstubAllEnvs());

describe("the route builder", () => {
  it("lists a descriptor and a revision-named data file for every graph, and serves both", async () => {
    const route = createGraphRoute({ g: { source: () => doc(), indexes: [{ label: "X", property: "id" }] } });
    const params = await route.generateStaticParams();
    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({ id: "g", file: "descriptor.json" });
    const dataFile = params[1]!.file;
    expect(dataFile).toMatch(/^graph\.[0-9a-f]{12}\.json$/);
    const descriptor = await (await get(route, "g", "descriptor.json")).json();
    expect(descriptor).toMatchObject({ version: 1, id: "g", data: { url: `/relate/g/${dataFile}`, nodes: 1, links: 0 }, indexes: [{ label: "X", property: "id" }] });
    expect(descriptor.revision).toBe(dataFile.slice(6, 18));
    const data = await get(route, "g", dataFile);
    expect(data.status).toBe(200);
    expect((await data.json()).nodes).toHaveLength(1);
  });

  it("puts the base path in the descriptor's data location", async () => {
    vi.stubEnv("RELATE_NEXTJS_BASE_PATH", "/docs");
    const route = createGraphRoute({ g: { source: () => doc() } });
    const descriptor = await (await get(route, "g", "descriptor.json")).json();
    expect(descriptor.data.url).toMatch(/^\/docs\/relate\/g\/graph\.[0-9a-f]{12}\.json$/);
  });

  it("gives one revision for one content in another order", async () => {
    const a = createGraphRoute({ g: { source: () => doc([{ id: "b" }, { id: "c" }]) } });
    const b = createGraphRoute({ g: { source: () => doc([{ id: "c" }, { id: "b" }]) } });
    expect((await a.generateStaticParams())[1]).toEqual((await b.generateStaticParams())[1]);
  });

  it("answers an undeclared name or file as not found", async () => {
    const route = createGraphRoute({ g: { source: () => doc() } });
    expect((await get(route, "other", "descriptor.json")).status).toBe(404);
    expect((await get(route, "g", "notes.txt")).status).toBe(404);
  });

  it("fails the build, naming the graph, when a data file's revision is not the evaluation's, and answers 404 otherwise", async () => {
    const route = createGraphRoute({ g: { source: () => doc() } });
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    await expect(get(route, "g", "graph.000000000000.json")).rejects.toThrow(/graph "g": revision mismatch.*not deterministic/);
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    expect((await get(route, "g", "graph.000000000000.json")).status).toBe(404);
    vi.stubEnv("NODE_ENV", "development");
    expect((await get(route, "g", "graph.000000000000.json")).status).toBe(404);
  });

  it("fails when a document is invalid, naming the graph and the path; in development it answers 500 and lists the other files", async () => {
    const bad = { source: () => ({ version: 1 as const, nodes: [{ id: "a" }, { id: "a" }], links: [] }) };
    await expect(createGraphRoute({ g: bad }).generateStaticParams()).rejects.toThrow(/graph "g": nodes\[1\]/);
    vi.stubEnv("NODE_ENV", "development");
    const route = createGraphRoute({ g: bad });
    expect(await route.generateStaticParams()).toEqual([{ id: "g", file: "descriptor.json" }]);
    const response = await get(route, "g", "descriptor.json");
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/graph "g": nodes\[1\]/);
  });

  it("evaluates a source once per process in production and on every call in development", async () => {
    let calls = 0;
    const source = () => (calls++, doc());
    const route = createGraphRoute({ g: { source } });
    await route.generateStaticParams();
    await get(route, "g", "descriptor.json");
    expect(calls).toBe(1);
    vi.stubEnv("NODE_ENV", "development");
    await get(route, "g", "descriptor.json");
    await get(route, "g", "descriptor.json");
    expect(calls).toBe(3);
  });

  it("rejects a bad declaration when the route is built", () => {
    expect(() => createGraphRoute({ "Bad Name": { source: () => doc() } })).toThrow(/graph "Bad Name"/);
  });
});
