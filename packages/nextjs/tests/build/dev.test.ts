// covers: FR-005, FR-006, FR-009, SC-006
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDev } from "../helpers/build-site.js";
import type { Dev } from "../helpers/build-site.js";

const doc = (extra: string) => `export const graphs = { g: { source: () => ({ version: 1, nodes: [{ id: "a" }${extra}], links: [] }) } };\n`;

let dev: Dev;
beforeAll(async () => {
  dev = await startDev({ files: { "lib/graphs.js": doc("") } });
}, 300_000);
afterAll(() => dev?.stop());

const get = (path: string) => fetch(dev.url + path);
const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

describe("the development server", () => {
  it("serves the descriptor and the data file, and answers an undeclared name as not found", async () => {
    const descriptor = (await (await get("/relate/g/descriptor.json")).json()) as { revision: string; data: { url: string; nodes: number } };
    expect(descriptor.data.nodes).toBe(1);
    expect((await get(descriptor.data.url)).status).toBe(200);
    expect((await get("/relate/nothing/descriptor.json")).status).toBe(404);
  });

  it("follows an edit of the source: a new revision is served, and the old revision's file is not found", async () => {
    const before = (await (await get("/relate/g/descriptor.json")).json()) as { revision: string; data: { url: string } };
    dev.write("lib/graphs.js", doc(', { id: "b" }'));
    await settle();
    let after = before;
    for (let i = 0; i < 30 && after.revision === before.revision; i++) {
      after = (await (await get("/relate/g/descriptor.json")).json()) as typeof before;
      if (after.revision === before.revision) await settle(500);
    }
    expect(after.revision).not.toBe(before.revision);
    // the router's list of files may lag the source for a moment, so the new file is polled for
    let status = (await get(after.data.url)).status;
    for (let i = 0; i < 20 && status !== 200; i++) {
      await settle(500);
      status = (await get(after.data.url)).status;
    }
    expect(status, "the new revision's file").toBe(200);
    expect((await get(before.data.url)).status).toBe(404);
  });

  it("answers a source that is invalid with an error that names the graph and the path, and keeps running", async () => {
    dev.write("lib/graphs.js", doc(', { id: "a" }'));
    let response = await get("/relate/g/descriptor.json");
    for (let i = 0; i < 30 && response.status === 200; i++) {
      await settle(500);
      response = await get("/relate/g/descriptor.json");
    }
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/graph "g": nodes\[1\]/);
    expect((await get("/")).status).toBe(200);
  });
});
