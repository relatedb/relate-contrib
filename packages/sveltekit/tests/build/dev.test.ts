// covers: FR-006, FR-032
import { afterAll, describe, expect, it } from "vitest";
import { startDev } from "../helpers/build-site.js";

const graphs = (rev: string, extra = "") => `export const graphs = { example: { source: () => ({ version: 1, nodes: [{ id: "a", properties: { rev: "${rev}" } }], links: [] }) }${extra} };\n`;
const route = `import { createGraphRoute } from "@relate/sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
`;

const stops: Array<() => void> = [];
afterAll(() => stops.forEach((stop) => stop()));

const revision = async (origin: string): Promise<string> => (await (await fetch(`${origin}/relate/example/descriptor.json`)).json()).revision;
const settle = (ms = 1500): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("the development server", () => {
  it("serves the files, follows an edit to a source, and answers the old revision, an unknown id and a throwing source as errors", async () => {
    const dev = await startDev({ name: "dev-files", files: { "src/lib/graphs.ts": graphs("1"), "src/routes/relate/[id]/[file]/+server.ts": route } }, 5494);
    stops.push(dev.stop);
    const first = await revision(dev.origin);
    expect(first).toMatch(/^[0-9a-f]{12}$/);
    const descriptor = await (await fetch(`${dev.origin}/relate/example/descriptor.json`)).json();
    expect((await fetch(dev.origin + descriptor.data.url)).status).toBe(200);

    dev.write("src/lib/graphs.ts", graphs("2"));
    await settle();
    const second = await revision(dev.origin);
    expect(second).not.toBe(first);
    expect((await fetch(`${dev.origin}/relate/example/graph.${second}.json`)).status).toBe(200);
    expect((await fetch(`${dev.origin}/relate/example/graph.${first}.json`)).status).toBe(404);
    expect((await fetch(`${dev.origin}/relate/nothing/descriptor.json`)).status).toBe(404);

    dev.write("src/lib/graphs.ts", graphs("3", `, bad: { source: () => { throw new Error("empty pantry"); } }`));
    await settle();
    const bad = await fetch(`${dev.origin}/relate/bad/descriptor.json`);
    expect(bad.status).toBe(500);
    expect(await bad.text()).toMatch(/graph "bad": the source failed: empty pantry/);
    expect((await fetch(`${dev.origin}/relate/example/descriptor.json`)).status).toBe(200);
  });
});
