// covers: FR-030, SC-007
// Packs the adapter and the core, installs both tarballs in a clean Astro project outside this repository (with the
// engine package and Astro installed beside them, as a user would), builds a site with a registered graph and an
// inline graph, and runs it in Chromium, from the build and from the development server. This shows the package
// works as published: its files, exports, peer ranges and the `.astro` component's resolution.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";
import { spawnDev } from "../helpers/build-site.js";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const core = join(repo, "packages/core");
const engine = join(repo, "vendor/cypherlite-wasm/pkg");

let work = "";
let consumer = "";
let adapterTarball = "";
let server: Server | null = null;

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } });

const tarballIn = (dir: string, prefix: string): string => join(dir, readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"))!);

const page = `---
import GraphData from "related-web-astro/graph-data";
---
<html lang="en">
  <head><meta charset="utf-8" /><title>consumer</title></head>
  <body>
    <p>Registered: <span data-registered>…</span> · inline: <span data-inline>…</span></p>
    <GraphData id="mini" document={{ version: 1, nodes: [{ id: "x", labels: ["Item"] }, { id: "y", labels: ["Item"] }], links: [] }} />
    <script>
      import { onPage } from "related-web-astro/client";
      onPage((page) => {
        page.graph("things").subscribe("MATCH (n:Thing) RETURN count(n) AS c", null, (u) => u.rows && ((document.querySelector("[data-registered]")!).textContent = String(u.rows[0].c)));
        page.graph("mini").subscribe("MATCH (n:Item) RETURN count(n) AS c", null, (u) => u.rows && ((document.querySelector("[data-inline]")!).textContent = String(u.rows[0].c)));
      });
    </script>
  </body>
</html>
`;

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "related-web-astro-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], core);
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], core);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  adapterTarball = tarballIn(work, "related-web-astro-");

  consumer = join(work, "consumer");
  mkdirSync(join(consumer, "src/pages"), { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n  sharp: true\n");
  run("pnpm", ["add", "--prefer-offline", adapterTarball, tarballIn(work, "related-web-core-"), `file:${engine}`, "astro@^7.4.5"], consumer);

  writeFileSync(
    join(consumer, "astro.config.mjs"),
    `import { defineConfig } from "astro/config";
import relatedWeb from "related-web-astro";
export default defineConfig({ output: "static", build: { format: "file" }, integrations: [relatedWeb({ graphs: { things: { source: "./src/things.ts", indexes: [{ label: "Thing", property: "id" }] } } })] });
`,
  );
  // The registered graph is built from a content collection, as a site's would be.
  mkdirSync(join(consumer, "src/content/things"), { recursive: true });
  for (let i = 0; i < 7; i++) writeFileSync(join(consumer, `src/content/things/t${i}.md`), "---\n---\nA thing.\n");
  writeFileSync(
    join(consumer, "src/content.config.ts"),
    `import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
export const collections = { things: defineCollection({ loader: glob({ pattern: "*.md", base: "./src/content/things" }), schema: z.object({}) }) };
`,
  );
  writeFileSync(
    join(consumer, "src/things.ts"),
    `import { getCollection } from "astro:content";
export default async () => ({ version: 1, nodes: (await getCollection("things")).map((t) => ({ id: t.id, labels: ["Thing"] })), links: [] });
`,
  );
  writeFileSync(join(consumer, "src/pages/index.astro"), page);
  run("pnpm", ["exec", "astro", "build"], consumer);
});

afterAll(() => {
  server?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

async function showsResult(url: string): Promise<{ registered: string; inline: string }> {
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage();
    await p.goto(url);
    await p.waitForFunction(() => document.querySelector("[data-registered]")?.textContent !== "…" && document.querySelector("[data-inline]")?.textContent !== "…", undefined, { timeout: 120_000 });
    return { registered: (await p.locator("[data-registered]").textContent())!, inline: (await p.locator("[data-inline]").textContent())! };
  } finally {
    await browser.close();
  }
}

describe("the packed adapter in a clean project", () => {
  it("ships its build and the component, and nothing of the repository", () => {
    const listing = run("tar", ["-tzf", adapterTarball], work).split("\n");
    expect(listing).toContain("package/dist/index.js");
    expect(listing).toContain("package/dist/client/index.js");
    expect(listing).toContain("package/dist/routes/files.js");
    expect(listing).toContain("package/dist/types.d.ts");
    expect(listing).toContain("package/src/GraphData.astro");
    expect(listing.some((f) => /\b(tests|conformance-site|vendor|node_modules)\//.test(f))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/related-web-astro/package.json"), "utf8"));
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@neo4j-labs/cypherlite-wasm", "astro", "related-web-core"]);
    expect(JSON.stringify(manifest)).not.toContain(repo);
  });

  it("builds, places the engine binary with no workaround, and publishes the registered graph", () => {
    const dist = join(consumer, "dist");
    expect(readdirSync(join(dist, "_astro")).some((f) => f.endsWith(".wasm"))).toBe(true);
    const descriptor = JSON.parse(readFileSync(join(dist, "_related/things/descriptor.json"), "utf8"));
    expect(descriptor).toMatchObject({ id: "things", data: { nodes: 7, links: 0 } });
  });

  it("runs in a browser from the build: the registered and the inline graph both answer a query", async () => {
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
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
    const { port } = server!.address() as { port: number };
    expect(await showsResult(`http://127.0.0.1:${port}/`)).toEqual({ registered: "7", inline: "2" });
  });

  it("runs in a browser from the development server, which serves the engine binary and the worker", async () => {
    const dev = await spawnDev(consumer);
    try {
      expect(await showsResult(`${dev.url}/`)).toEqual({ registered: "7", inline: "2" });
    } finally {
      await dev.stop();
    }
  });
});
