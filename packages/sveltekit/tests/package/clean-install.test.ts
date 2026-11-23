// covers: FR-001, FR-002, FR-003, FR-031, SC-007
// Packs the adapter, the core and the engine, installs them in a clean SvelteKit 3 project outside this repository (with SvelteKit,
// Svelte, Vite and both adapters beside them, as a user would), writes a site with a registered graph and an inline graph, builds it
// with the static output and with the Node output, serves each and runs the page in Chromium, then starts the development server and
// loads the page again. This shows the package works as published: its files, exports and peer ranges, and that the site's own build
// compiles its Svelte source, rune module included.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
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
// the engine the workspace is built and tested on (the catalog entry), installed from the registry as a consumer would
const engine = `@relate/relate-wasm@${/"@relate\/relate-wasm":\s*"?([0-9][^"\s]*)"?/.exec(readFileSync(join(repo, "pnpm-workspace.yaml"), "utf8"))![1]}`;

let work = "";
let consumer = "";
let adapterTarball = "";
const children: ChildProcess[] = [];
let staticServer: Server | undefined;

const run = (command: string, args: string[], cwd: string, env: Record<string, string> = {}): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", ...env }, maxBuffer: 64 * 1024 * 1024 });
const tarballIn = (dir: string, prefix: string): string => join(dir, readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"))!);

const files: Record<string, string> = {
  "vite.config.js": `import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
const out = process.env.OUT ?? "build";
const adapter = process.env.ADAPTER === "node" ? adapterNode({ out }) : adapterStatic({ pages: out, assets: out, strict: true });
export default defineConfig({ plugins: [sveltekit({ adapter, outDir: ".svelte-kit-" + out })], server: { host: "127.0.0.1", port: Number(process.env.PORT ?? 5499) } });
`,
  "tsconfig.json": `{ "extends": "$app/tsconfig", "include": ["src", "*"] }\n`,
  "src/app.html": `<!doctype html><html lang="en"><head><meta charset="utf-8" />%sveltekit.head%</head><body><div style="display: contents">%sveltekit.body%</div></body></html>\n`,
  "src/lib/graphs.ts": `export const graphs = { things: { source: () => ({ version: 1, nodes: Array.from({ length: 7 }, (_, i) => ({ id: "t" + i, labels: ["Thing"] })), links: [] }), indexes: [{ label: "Thing", property: "id" }] } };\n`,
  "src/routes/relate/[id]/[file]/+server.ts": `import { createGraphRoute } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const prerender = true;
export const { GET, entries } = createGraphRoute(graphs);
`,
  "src/routes/+layout.ts": `export const prerender = true;\n`,
  "src/routes/+layout.server.ts": `import { catalog } from "@relate/contrib-sveltekit/server";
import { graphs } from "#lib/graphs.ts";
export const load = () => ({ catalog: catalog(graphs) });
`,
  "src/routes/+layout.svelte": `<script>
  import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
  import { RelateProvider } from "@relate/contrib-sveltekit";
  let { data, children } = $props();
</script>
<RelateProvider catalog={data.catalog} {engineUrl}>{@render children()}</RelateProvider>
`,
  "src/routes/+page.svelte": `<script>
  import { GraphData, useQuery } from "@relate/contrib-sveltekit";
  const registered = useQuery("things", "MATCH (n:Thing) RETURN count(n) AS c");
  const inline = useQuery("mini", "MATCH (n:Item) RETURN count(n) AS c");
  const mini = { version: 1, nodes: [{ id: "x", labels: ["Item"] }, { id: "y", labels: ["Item"] }], links: [] };
</script>
<GraphData id="mini" document={mini} page="/" />
<p>Registered: <span data-registered>{registered.rows ? String(registered.rows[0].c) : "…"}</span> · inline: <span data-inline>{inline.rows ? String(inline.rows[0].c) : "…"}</span></p>
`,
};

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "relate-sveltekit-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], core);
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], core);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  adapterTarball = tarballIn(work, "relate-contrib-sveltekit-");

  consumer = join(work, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module", imports: { "#lib/*": "./src/lib/*" } }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
  run("pnpm", ["add", "--prefer-offline", adapterTarball, tarballIn(work, "relate-contrib-web-"), engine, "@sveltejs/kit@^3", "svelte@^5", "vite@^8", "@sveltejs/vite-plugin-svelte@^7", "@sveltejs/adapter-static@^4", "@sveltejs/adapter-node@^6", "typescript@^6"], consumer);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(consumer, path, ".."), { recursive: true });
    writeFileSync(join(consumer, path), text);
  }
}, 600_000);

afterAll(() => {
  staticServer?.close();
  for (const c of children) c.kill();
  if (work) rmSync(work, { recursive: true, force: true });
});

const build = (adapter: "static" | "node"): string => run("pnpm", ["exec", "vite", "build"], consumer, { ADAPTER: adapter, OUT: `build-${adapter}` });

async function until(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not come up`);
}

async function loadPage(url: string): Promise<{ registered: string | null; inline: string | null; requests: string[] }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector("[data-registered]")?.textContent !== "…" && document.querySelector("[data-inline]")?.textContent !== "…", undefined, { timeout: 120_000 });
    return { registered: await page.locator("[data-registered]").textContent(), inline: await page.locator("[data-inline]").textContent(), requests };
  } finally {
    await browser.close();
  }
}

describe("the packed adapter in a clean project", () => {
  it("ships its Svelte source, JavaScript modules and server build, with the peers declared and no runtime dependency or repository path", () => {
    const listing = run("tar", ["-tzf", adapterTarball], work).split("\n");
    for (const f of ["src/index.js", "src/index.d.ts", "src/RelateProvider.svelte", "src/GraphData.svelte", "src/use-graph.svelte.js", "src/registry.js", "dist/server/index.js", "dist/server/route.js"]) expect(listing).toContain(`package/${f}`);
    expect(listing.some((f) => /\b(tests|conformance-site|vendor|node_modules)\//.test(f))).toBe(false);
    expect(listing.some((f) => f.endsWith(".wasm") || f.endsWith(".svelte.ts"))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/@relate/contrib-sveltekit/package.json"), "utf8"));
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@relate/contrib-web", "@relate/relate-wasm", "@sveltejs/kit", "svelte"]);
    expect(JSON.stringify(manifest)).not.toContain(repo);
  });

  it("builds with the static output, places the binary and the worker, and a page answers queries on both graphs", async () => {
    const output = build("static");
    expect(output).toMatch(/Wrote site to "build-static"/);
    expect(existsSync(join(consumer, "build-static/relate/things/descriptor.json"))).toBe(true);
    const root = join(consumer, "build-static");
    const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".wasm": "application/wasm", ".css": "text/css" };
    staticServer = createServer((req, res) => {
      let file = join(root, normalize(decodeURIComponent(new URL(req.url!, "http://x").pathname)));
      if (existsSync(file) && statSync(file).isDirectory()) file = existsSync(file + ".html") ? file + ".html" : join(file, "index.html");
      if (!existsSync(file)) return void res.writeHead(404).end("not found");
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    }).listen(5497, "127.0.0.1");
    const result = await loadPage("http://127.0.0.1:5497/");
    expect(result.registered).toBe("7");
    expect(result.inline).toBe("2");
    expect(result.requests.some((p) => /relate_bg\.[\w-]+\.wasm$/.test(p))).toBe(true);
    expect(result.requests.some((p) => /workers\/worker-[\w-]+\.js$/.test(p))).toBe(true);
    expect(result.requests.filter((p) => p.startsWith("/relate/things/graph.")).length).toBe(1);
  });

  it("builds with the Node output and a page served by the Node server answers the same queries", async () => {
    build("node");
    const child = spawn(process.execPath, ["build-node"], { cwd: consumer, env: { ...process.env, HOST: "127.0.0.1", PORT: "5498" }, stdio: "ignore" });
    children.push(child);
    await until("http://127.0.0.1:5498/");
    const result = await loadPage("http://127.0.0.1:5498/");
    expect(result.registered).toBe("7");
    expect(result.inline).toBe("2");
  });

  it("starts the development server and the page answers the same queries (a rune module in Svelte source survives dependency optimization)", async () => {
    const child = spawn("pnpm", ["exec", "vite", "dev"], { cwd: consumer, env: { ...process.env, PORT: "5499" }, stdio: "ignore" });
    children.push(child);
    await until("http://127.0.0.1:5499/");
    const result = await loadPage("http://127.0.0.1:5499/");
    expect(result.registered).toBe("7");
    expect(result.inline).toBe("2");
  });
});
