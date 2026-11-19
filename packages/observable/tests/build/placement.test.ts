// covers: FR-003, FR-004, FR-005, SC-001
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeSite, type Site } from "../helpers/framework-site.js";

const require = createRequire(import.meta.url);
const engineBytes = readFileSync(require.resolve("@relate/relate-wasm/relate_bg.wasm"));

let site: Site;
let built: { status: number | null; output: string };
const published = (): string[] => readdirSync(join(site.dist, "_file/data"));

beforeAll(async () => {
  site = makeSite("placement", {
    "docs/data/relate.wasm.js": `import { engine } from "@relate/contrib-observable/loader";\nawait engine();\n`,
    "docs/data/relate-worker.js.js": `import { worker } from "@relate/contrib-observable/loader";\nawait worker();\n`,
    "docs/index.md": "# placement\n\n```js\nconst engineUrl = await FileAttachment(\"data/relate.wasm\").url();\nconst workerUrl = await FileAttachment(\"data/relate-worker.js\").url();\ndisplay(html`<p id=\"urls\">${engineUrl} ${workerUrl}</p>`);\n```\n",
  });
  built = await site.build();
});
afterAll(() => site.remove());

describe("the engine and worker loaders", () => {
  it("writes the installed engine's binary, byte for byte", () => {
    const run = site.loader("docs/data/relate.wasm.js");
    expect(run.status).toBe(0);
    expect(run.stdout.equals(engineBytes)).toBe(true);
  });

  it("writes the worker as one ES module with no bare import, holding the engine's glue and the core's worker", () => {
    const run = site.loader("docs/data/relate-worker.js.js");
    expect(run.status, run.stderr).toBe(0);
    const text = run.stdout.toString("utf8");
    expect(text.length).toBeGreaterThan(10_000);
    expect(text).not.toMatch(/^\s*(import|export)\s[^;]*\sfrom\s*["'][^./]/m); // nothing a worker could not resolve
    expect(text).toContain("RelateDb");
    expect(text).toMatch(/onmessage|addEventListener\(["']message/);
  });

  it("stops the build, naming the engine, when the site has none (the working directory has no @relate/relate-wasm)", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "rel-no-engine-"));
    try {
      const run = site.loader("docs/data/relate.wasm.js", realpathSync(elsewhere));
      expect(run.status).toBe(1);
      expect(run.stdout).toHaveLength(0);
      expect(run.stderr).toMatch(/engine\(\).*binary was not found/);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});

describe("a build with the two loaders", () => {
  it("succeeds and publishes the binary and the worker under hashed names, with no copying step", () => {
    expect(built.status, built.output).toBe(0);
    const files = published();
    expect(files.filter((f) => /^relate\.[0-9a-f]{8}\.wasm$/.test(f))).toHaveLength(1);
    expect(files.filter((f) => /^relate-worker\.[0-9a-f]{8}\.js$/.test(f))).toHaveLength(1);
    const wasm = files.find((f) => f.endsWith(".wasm"))!;
    expect(readFileSync(join(site.dist, "_file/data", wasm)).equals(engineBytes)).toBe(true);
  });

  it("gives the page the published locations", () => {
    const page = site.read("dist/index.html");
    expect(page).toMatch(/_file\/data\/relate\.[0-9a-f]{8}\.wasm/);
    expect(page).toMatch(/_file\/data\/relate-worker\.[0-9a-f]{8}\.js/);
  });
});
