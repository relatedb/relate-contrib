// covers: FR-005, FR-027
// The preview server, which runs loaders on request: the engine and worker are served at the published locations, a source edit
// reaches the output only when the loader script is saved (research V-4), and a failing loader answers with an error.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, utimesSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { frameworkBin, makeSite, type Site } from "../helpers/framework-site.js";

const require = createRequire(import.meta.url);
const engineBytes = readFileSync(require.resolve("@relate/relate-wasm/relate_bg.wasm"));
const PORT = 5394;
const base = `http://127.0.0.1:${PORT}`;
const lib = (words: number) => `export default () => ({ version: 1, nodes: [{ id: "a", properties: { words: ${words} } }], links: [] });\n`;

let site: Site;
let preview: ChildProcess;
const log: string[] = [];

const get = async (path: string): Promise<{ status: number; type: string; body: Buffer }> => {
  const response = await fetch(base + path);
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: Buffer.from(await response.arrayBuffer()) };
};
const revision = async (): Promise<string> => JSON.parse((await get("/_file/data/pantry.descriptor.json")).body.toString()).revision;

beforeAll(async () => {
  site = makeSite("preview", {
    "docs/data/relate.wasm.js": `import { engine } from "@relate/observable/loader";\nawait engine();\n`,
    "docs/data/relate-worker.js.js": `import { worker } from "@relate/observable/loader";\nawait worker();\n`,
    "docs/data/pantry.descriptor.json.js": `import { descriptor } from "@relate/observable/loader";\nimport source from "../lib/pantry.js";\nawait descriptor("pantry", source);\n`,
    "docs/data/broken.graph.json.js": `import { document } from "@relate/observable/loader";\nawait document("broken", () => ({ version: 1, nodes: [{ labels: ["x"] }], links: [] }));\n`,
    "docs/lib/pantry.js": lib(10),
    "docs/index.md": "# preview\n\n```js\nconst a = await FileAttachment(\"data/relate.wasm\").url();\nconst b = await FileAttachment(\"data/relate-worker.js\").url();\nconst c = await FileAttachment(\"data/pantry.descriptor.json\").json();\nconst d = FileAttachment(\"data/broken.graph.json\");\ndisplay(html`<p>${a} ${b} ${c.revision} ${d.name}</p>`);\n```\n",
  });
  preview = spawn(process.execPath, [frameworkBin(), "preview", "--no-open", "--host", "127.0.0.1", "--port", String(PORT)], { cwd: site.dir, env: { ...process.env, OBSERVABLE_TELEMETRY_DISABLE: "true" } });
  preview.stdout!.on("data", (d) => log.push(String(d)));
  preview.stderr!.on("data", (d) => log.push(String(d)));
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + "/")).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("the preview server did not come up:\n" + log.join(""));
}, 120_000);

afterAll(() => {
  preview?.kill();
  site?.remove();
});

describe("the preview server", () => {
  it("serves the engine's binary and the worker at the locations the loaders publish, the worker as a script", async () => {
    const wasm = await get("/_file/data/relate.wasm");
    expect(wasm.status).toBe(200);
    expect(wasm.body.equals(engineBytes)).toBe(true);
    const worker = await get("/_file/data/relate-worker.js");
    expect(worker.status).toBe(200);
    expect(worker.type).toMatch(/javascript/);
    expect(worker.body.length).toBeGreaterThan(10_000);
  });

  it("does not follow an edit to a graph source until the loader script is saved", async () => {
    const first = await revision();
    site.write("docs/lib/pantry.js", lib(11));
    await new Promise((r) => setTimeout(r, 1500));
    expect(await revision()).toBe(first); // the loader's cache is newer than the loader script (V-4)
    const loader = join(site.dir, "docs/data/pantry.descriptor.json.js");
    const later = new Date(Date.now() + 5000);
    utimesSync(loader, later, later); // saving the loader script
    await new Promise((r) => setTimeout(r, 1500));
    expect(await revision()).not.toBe(first);
  });

  it("answers a request for a file whose loader fails with an error status, naming the problem in its log", async () => {
    const response = await get("/_file/data/broken.graph.json");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(log.join("")).toMatch(/exited with code 1|broken/);
  });
});
