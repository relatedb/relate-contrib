// covers: FR-032
// Packs the core, installs the tarball in a clean project outside this repository (with the engine package installed
// beside it, as a user would), bundles a page with Vite and checks that it runs with the binary's URL passed as an
// option. This shows the package is independently publishable and does not depend on this repository's layout.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const engine = join(repo, "vendor/cypherlite-wasm/pkg");

let work = "";
let tarball = "";
let consumer = "";
let server: Server | null = null;
let port = 0;

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } });

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "graph-web-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  tarball = join(work, execFileSync("ls", [work], { encoding: "utf8" }).split("\n").find((f) => f.endsWith(".tgz"))!);

  consumer = join(work, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
  run("pnpm", ["add", "--prefer-offline", tarball, `file:${engine}`, "vite"], consumer);

  mkdirSync(join(consumer, "src"));
  writeFileSync(
    join(consumer, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"><title>consumer</title></head><body><script type="module" src="/src/main.js"></script></body></html>',
  );
  writeFileSync(
    join(consumer, "src/main.js"),
    `import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import { createClient } from "graph-web-core";
import { validate } from "graph-web-core/validate";
const document = { version: 1, nodes: [{ id: "a", labels: ["Page"] }, { id: "b", labels: ["Page"] }, { id: "c" }], links: [{ source: "a", target: "b", type: "T" }] };
window.validated = validate(document).ok;
const client = createClient({ engineUrl, graph: { document }, navigation: "client-routing" });
client.query("MATCH (n:Page) RETURN count(n) AS c").then((r) => { window.result = r.rows; }, (e) => { window.result = String(e); });
`,
  );
  run("pnpm", ["exec", "vite", "build", "--logLevel", "warn"], consumer);
});

afterAll(() => {
  server?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

describe("the packed core in a clean project", () => {
  it("contains the build and the example site, and no test code, vendored engine or dependencies", () => {
    const listing = run("tar", ["-tzf", tarball], work).split("\n");
    expect(listing).toContain("package/dist/index.js");
    expect(listing).toContain("package/dist/validate.js");
    expect(listing).toContain("package/dist/worker/worker.js");
    expect(listing).toContain("package/dist/conformance/run.js");
    expect(listing.some((f) => f.includes("example-site/public/descriptor.json"))).toBe(true);
    expect(listing.some((f) => /\b(tests|vendor|node_modules)\//.test(f))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/graph-web-core/package.json"), "utf8"));
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies)).toContain("@neo4j-labs/cypherlite-wasm");
  });

  it("works in a bundled page, with the engine binary's URL passed as an option", async () => {
    const dist = join(consumer, "dist");
    const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json" };
    server = createServer((req, res) => {
      const path = join(dist, (req.url ?? "/").split("?")[0]!.replace(/^\/$/, "/index.html"));
      if (!path.startsWith(dist) || !existsSync(path) || !statSync(path).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
    });
    await new Promise<void>((r) => server!.listen(0, r));
    port = (server!.address() as { port: number }).port;

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${port}/`);
      await page.waitForFunction(() => (window as unknown as { result?: unknown }).result !== undefined, undefined, { timeout: 60_000 });
      expect(await page.evaluate(() => (window as unknown as { result: unknown }).result)).toEqual([{ c: 2 }]);
      expect(await page.evaluate(() => (window as unknown as { validated: boolean }).validated)).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
