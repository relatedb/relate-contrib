// covers: FR-001, FR-003, FR-032, SC-001, SC-007
// Packs the adapter and the core, installs both tarballs in a clean Next project outside this repository (with the engine
// package and Next installed beside them, as a user would), builds a site with a registered graph and an inline graph under
// each of Next's two bundlers, serves each build with `next start`, and runs it in Chromium. This shows the package works as
// published: its files, exports and peer ranges, and the placement of the worker and the engine binary by the bundler.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium } from "@playwright/test";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const core = join(repo, "packages/core");
const engine = join(repo, "vendor/cypherlite-wasm/pkg");

let work = "";
let consumer = "";
let adapterTarball = "";
const servers: ChildProcess[] = [];
const outputs: Record<string, string> = {};

const run = (command: string, args: string[], cwd: string, env: Record<string, string> = {}): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", ...env }, maxBuffer: 64 * 1024 * 1024 });

const tarballIn = (dir: string, prefix: string): string => join(dir, readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"))!);

const files: Record<string, string> = {
  "next.config.mjs": `import { withRelatedWeb } from "@relate/web-next";
export default withRelatedWeb({ distDir: process.env.DIST ?? ".next" });
`,
  "lib/graphs.js": `export const graphs = { things: { source: () => ({ version: 1, nodes: Array.from({ length: 7 }, (_, i) => ({ id: "t" + i, labels: ["Thing"] })), links: [] }), indexes: [{ label: "Thing", property: "id" }] } };
`,
  "app/related-web/[id]/[file]/route.js": `import { createGraphRoute } from "@relate/web-next/server";
import { graphs } from "../../../../lib/graphs.js";
export const dynamic = "force-static";
export const dynamicParams = false;
export const { GET, generateStaticParams } = createGraphRoute(graphs);
`,
  "app/providers.jsx": `"use client";
import { RelatedWebProvider } from "@relate/web-next/client";
const engineUrl = new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url);
export function Providers({ catalog, children }) { return <RelatedWebProvider catalog={catalog} engineUrl={engineUrl}>{children}</RelatedWebProvider>; }
`,
  "app/layout.jsx": `import { catalog } from "@relate/web-next/server";
import { graphs } from "../lib/graphs.js";
import { Providers } from "./providers.jsx";
export default function Layout({ children }) { return <html lang="en"><body><Providers catalog={catalog(graphs)}>{children}</Providers></body></html>; }
`,
  "app/counts.jsx": `"use client";
import { useQuery } from "@relate/web-next/client";
export function Counts() {
  const things = useQuery("things", "MATCH (n:Thing) RETURN count(n) AS c");
  const mini = useQuery("mini", "MATCH (n:Item) RETURN count(n) AS c");
  return <p>Registered: <span data-registered>{things.rows ? String(things.rows[0].c) : "…"}</span> · inline: <span data-inline>{mini.rows ? String(mini.rows[0].c) : "…"}</span></p>;
}
`,
  "app/page.jsx": `import { GraphData } from "@relate/web-next/server";
import { Counts } from "./counts.jsx";
export default function Page() {
  return <main><title>consumer</title><Counts /><GraphData id="mini" page="/" document={{ version: 1, nodes: [{ id: "x", labels: ["Item"] }, { id: "y", labels: ["Item"] }], links: [] }} /></main>;
}
`,
};

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "relate-web-next-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], core);
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], core);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  adapterTarball = tarballIn(work, "relate-web-next-");

  consumer = join(work, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n  sharp: true\n");
  run("pnpm", ["add", "--prefer-offline", adapterTarball, tarballIn(work, "related-web-core-"), `file:${engine}`, "next@^16.4.5", "react@^19", "react-dom@^19"], consumer);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(consumer, path, ".."), { recursive: true });
    writeFileSync(join(consumer, path), text);
  }
  for (const bundler of ["turbopack", "webpack"]) {
    outputs[bundler] = run("pnpm", ["exec", "next", "build", ...(bundler === "webpack" ? ["--webpack"] : [])], consumer, { DIST: `.next-${bundler}` });
  }
}, 600_000);

afterAll(() => {
  for (const s of servers) s.kill();
  if (work) rmSync(work, { recursive: true, force: true });
});

async function serve(bundler: string, port: number): Promise<void> {
  const child = spawn("pnpm", ["exec", "next", "start", "-p", String(port)], { cwd: consumer, env: { ...process.env, DIST: `.next-${bundler}` }, stdio: "ignore" });
  servers.push(child);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start (${bundler}) did not come up`);
}

describe("the packed adapter in a clean project", () => {
  it("ships its build, the engine binary's URL is the site's to pass, and nothing of the repository", () => {
    const listing = run("tar", ["-tzf", adapterTarball], work).split("\n");
    for (const f of ["dist/index.js", "dist/server/index.js", "dist/server/GraphData.js", "dist/client/index.js", "dist/client/Provider.js"]) expect(listing).toContain(`package/${f}`);
    expect(listing.some((f) => /\b(tests|conformance-site|vendor|node_modules)\//.test(f))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/@relate/web-next/package.json"), "utf8"));
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@neo4j-labs/cypherlite-wasm", "next", "react", "related-web-core"]);
    expect(JSON.stringify(manifest)).not.toContain(repo);
    // no engine binary inside the package (FR-003)
    expect(listing.some((f) => f.endsWith(".wasm"))).toBe(false);
  });

  for (const [bundler, port] of [["turbopack", 5391], ["webpack", 5392]] as const) {
    it(`builds with ${bundler}, places the engine binary and the worker, and a page answers queries on both graphs`, async () => {
      expect(outputs[bundler]).toMatch(/related-web\/things\/descriptor\.json/);
      await serve(bundler, port);
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage();
        const requests: string[] = [];
        page.on("request", (r) => requests.push(new URL(r.url()).pathname));
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => document.querySelector("[data-registered]")?.textContent !== "…" && document.querySelector("[data-inline]")?.textContent !== "…", undefined, { timeout: 120_000 });
        expect(await page.locator("[data-registered]").textContent()).toBe("7");
        expect(await page.locator("[data-inline]").textContent()).toBe("2");
        expect(requests.some((p) => p.endsWith(".wasm"))).toBe(true); // placed by the bundler, no workaround
        expect(requests.filter((p) => p.startsWith("/related-web/things/graph.")).length).toBe(1);
      } finally {
        await browser.close();
      }
    }, 300_000);
  }
});
