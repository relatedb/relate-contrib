// covers: FR-001, FR-026, SC-001, SC-006
// Packs the adapter, the core and the engine, installs them in a clean Framework project outside this repository (with Framework
// beside them, as a user would), adds the four loaders and a page, builds, serves the build and runs the page in Chromium. This
// shows the package works as published: its files, exports and peer ranges, and the placement of the engine and the worker by
// the loaders.
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const core = join(repo, "packages/web");
const engine = join(repo, "vendor/relate-wasm/pkg");

let work = "";
let consumer = "";
let adapterTarball = "";
let server: Server | undefined;

const run = (command: string, args: string[], cwd: string): string => execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", OBSERVABLE_TELEMETRY_DISABLE: "true" }, maxBuffer: 64 * 1024 * 1024 });
const tarballIn = (dir: string, prefix: string): string => join(dir, readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"))!);
const write = (path: string, text: string): void => {
  mkdirSync(join(consumer, path, ".."), { recursive: true });
  writeFileSync(join(consumer, path), text);
};

const files: Record<string, string> = {
  "observablehq.config.js": `export default { root: "docs", pages: [], toc: false, footer: "", sidebar: false, header: "", preserveExtension: true, telemetry: false };\n`,
  "docs/data/relate.wasm.js": `import { engine } from "@relate/observable/loader";\nawait engine();\n`,
  "docs/data/relate-worker.js.js": `import { worker } from "@relate/observable/loader";\nawait worker();\n`,
  "docs/lib/things.js": `export default () => ({ version: 1, nodes: Array.from({ length: 7 }, (_, i) => ({ id: "t" + i, labels: ["Thing"], properties: { n: i } })), links: [] });\n`,
  "docs/data/things.graph.json.js": `import { document } from "@relate/observable/loader";\nimport source from "../lib/things.js";\nawait document("things", source);\n`,
  "docs/data/things.descriptor.json.js": `import { descriptor } from "@relate/observable/loader";\nimport source from "../lib/things.js";\nawait descriptor("things", source, { indexes: [{ label: "Thing", property: "id" }] });\n`,
  "docs/index.md": `# consumer

\`\`\`js
import { open } from "@relate/observable";
const db = await open({
  engine: FileAttachment("data/relate.wasm"),
  worker: FileAttachment("data/relate-worker.js"),
  graph: { descriptor: FileAttachment("data/things.descriptor.json"), data: FileAttachment("data/things.graph.json") },
  invalidation,
});
await db.ready;
const rows = await db.cypher\`MATCH (n:Thing) WHERE n.n >= \${2} RETURN n.n AS n ORDER BY n\`;
display(html\`<p id="out">\${rows.length} \${rows.columns.join(",")} \${rows[0].n}</p>\`);
\`\`\`
`,
};

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "relate-observable-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], core);
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], core);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  adapterTarball = tarballIn(work, "relate-observable-");

  consumer = join(work, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module", scripts: { clean: "rm -rf docs/.observablehq/cache dist" } }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
  run("pnpm", ["add", "--prefer-offline", adapterTarball, tarballIn(work, "relate-web-"), `file:${engine}`, "@observablehq/framework@^1.13.4"], consumer);
  for (const [path, text] of Object.entries(files)) write(path, text);
}, 600_000);

afterAll(() => {
  server?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

const build = (): string => {
  run("pnpm", ["run", "clean"], consumer);
  return run("pnpm", ["exec", "observable", "build"], consumer);
};

describe("the packed adapter in a clean project", () => {
  it("ships its build and nothing of the repository, with the engine and the core as peers and esbuild its one dependency", () => {
    const listing = run("tar", ["-tzf", adapterTarball], work).split("\n");
    for (const f of ["dist/index.js", "dist/open.js", "dist/loader/index.js", "dist/loader/graph.js", "dist/results/index.js"]) expect(listing).toContain(`package/${f}`);
    expect(listing.some((f) => /\b(tests|conformance-site|vendor|node_modules)\//.test(f))).toBe(false);
    expect(listing.some((f) => f.endsWith(".wasm"))).toBe(false); // the binary is the site's, placed by its loader
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/@relate/observable/package.json"), "utf8"));
    expect(Object.keys(manifest.dependencies)).toEqual(["esbuild"]);
    expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@observablehq/framework", "@relate/relate-wasm", "@relate/web"]);
    expect(JSON.stringify(manifest)).not.toContain(repo);
  });

  it("builds, publishes the binary and the worker once each under hashed names, and a loaded page returns a query result", async () => {
    const output = build();
    expect(output).toMatch(/success/);
    const published = readdirSync(join(consumer, "dist/_file/data"));
    expect(published.filter((f) => /^relate\.[0-9a-f]{8}\.wasm$/.test(f))).toHaveLength(1);
    expect(published.filter((f) => /^relate-worker\.[0-9a-f]{8}\.js$/.test(f))).toHaveLength(1);

    const root = join(consumer, "dist");
    const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css" };
    server = createServer((req, res) => {
      let file = join(root, normalize(decodeURIComponent(new URL(req.url!, "http://x").pathname)));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
      if (!existsSync(file)) return void res.writeHead(404).end("not found");
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    }).listen(5393, "127.0.0.1");

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const requests: string[] = [];
      page.on("request", (r) => requests.push(new URL(r.url()).pathname));
      await page.goto("http://127.0.0.1:5393/index.html");
      await page.locator("#out").waitFor({ timeout: 120_000 });
      expect(await page.locator("#out").textContent()).toBe("5 n 2");
      expect(await page.locator(".observablehq--error").count()).toBe(0);
      // the page asks for the binary and the worker at the published locations and nowhere else
      expect(requests.filter((p) => p.endsWith(".wasm"))).toEqual([expect.stringMatching(/^\/_file\/data\/relate\.[0-9a-f]{8}\.wasm$/)]);
      expect(requests.filter((p) => /worker/.test(p))).toEqual([expect.stringMatching(/^\/_file\/data\/relate-worker\.[0-9a-f]{8}\.js$/)]);
    } finally {
      await browser.close();
    }
  });

  it("builds again after a clean to the same published files (the glue and the binary stay paired)", () => {
    const before = readdirSync(join(consumer, "dist/_file/data")).sort();
    build();
    expect(readdirSync(join(consumer, "dist/_file/data")).sort()).toEqual(before);
  });
});
