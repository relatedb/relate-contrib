// covers-ph: FR-001, FR-002, FR-018, SC-004
// Packs the package and the core, installs them with the engine and Phaser in a clean project outside this repository, and runs
// the README's example against the real engine. This shows the package works as published: its files, exports and peer
// ranges, that nothing in it points back into this repository, and that its declarations resolve. SC-004's fifteen
// minutes is a reader's figure and is not measured here; the check shows only that the README's example runs as written.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const core = join(repo, "packages/web");
// the engine the workspace is built and tested on (the catalog entry), installed from the registry as a consumer would
const engine = `@relate/relate-wasm@${/"@relate\/relate-wasm":\s*"?([0-9][^"\s]*)"?/.exec(readFileSync(join(repo, "pnpm-workspace.yaml"), "utf8"))![1]}`;

let work = "";
let consumer = "";
let tarball = "";

const run = (command: string, args: string[], cwd: string): string =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" }, maxBuffer: 64 * 1024 * 1024 });
const tarballIn = (dir: string, prefix: string): string => join(dir, readdirSync(dir).find((f) => f.startsWith(prefix) && f.endsWith(".tgz"))!);

/** The README's first example, as written. */
const readme = readFileSync(join(pkg, "README.md"), "utf8");
const example = /## Example\n\n```js\n([\s\S]*?)```/.exec(readme)?.[1] ?? "";

const files: Record<string, string> = {
  "check.mjs": `import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// the engine, in memory, initialised from the installed package's binary
const dir = dirname(createRequire(import.meta.url).resolve("@relate/relate-wasm"));
const mod = await import(join(dir, "relate.js"));
await mod.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
const db = new mod.RelateDb();
// the client the example expects, over the in-memory engine: what the cache reads of a core client
const client = {
  status: "ready",
  generation: 1,
  async query(statement, params) {
    return JSON.parse(db.execute(statement, params && Object.keys(params).length ? JSON.stringify(params) : null));
  },
  on: () => () => {},
  onGeneration: () => () => {},
};
await client.query("CREATE (:Cell {id: 'a'})");

${example}
console.log(JSON.stringify({ result, cells: Object.keys(cache.state.cells).sort(), exports: Object.keys(await import("@relate/contrib-phaser")).sort(), version: cache.version > 0, pending: cache.pending }));
`,
  "types.ts": `import { Bridge, ReplyCache, StatementError, createThrowawayClient, versionWatch, watchCache, type ActResult, type CacheClient } from "@relate/contrib-phaser";
import type { Client } from "@relate/contrib-web";

declare const client: Client;
const cache = new ReplyCache<{ n: number }>({ client, initial: { n: 0 }, load: async (b: Bridge) => { await b.enqueue("RETURN 1"); return (s) => void (s.n = 1); } });
export const r: Promise<ActResult> = cache.act("k", { optimistic: (s) => { s.n++; return () => void s.n--; }, run: async (commit) => commit((s) => void (s.n = 2)) });
export const isStatement = (e: unknown): boolean => e instanceof StatementError;
export const throwaway = createThrowawayClient({ engineUrl: "x", navigation: "multi-page" }, { nodes: [], links: [] } as never);
export const watch = versionWatch(cache);
export const asCacheClient: CacheClient = client;
export const w = (scene: { events: { on(e: string, f: () => void): unknown; off(e: string, f: () => void): unknown } }) => watchCache(scene, cache, () => undefined);
`,
  "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", module: "ES2022", moduleResolution: "Bundler", strict: true, skipLibCheck: true, noEmit: true }, include: ["types.ts"] }),
};

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "relate-phaser-clean-install-"));
  expect(work.startsWith(repo)).toBe(false); // the project is outside this repository
  run("pnpm", ["run", "build"], core);
  run("pnpm", ["run", "build"], pkg);
  run("pnpm", ["pack", "--pack-destination", work], core);
  run("pnpm", ["pack", "--pack-destination", work], pkg);
  tarball = tarballIn(work, "relate-contrib-phaser-");

  consumer = join(work, "consumer");
  mkdirSync(consumer, { recursive: true });
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  writeFileSync(join(consumer, "pnpm-workspace.yaml"), "allowBuilds:\n  esbuild: true\n");
  run("pnpm", ["add", "--prefer-offline", tarball, tarballIn(work, "relate-contrib-web-"), engine, "phaser@4.2.1", "typescript@^7"], consumer);
  for (const [path, text] of Object.entries(files)) writeFileSync(join(consumer, path), text);
}, 600_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

describe("the packed package in a clean project", () => {
  it("ships its build output and declarations only, below 1.0, with the core and Phaser as peers and nothing bundled", () => {
    const listing = run("tar", ["-tzf", tarball], work).split("\n").filter(Boolean);
    for (const f of ["package/package.json", "package/dist/index.js", "package/dist/index.d.ts", "package/dist/bridge.js", "package/dist/cache.js"]) expect(listing, f).toContain(f);
    expect(listing.some((f) => /\b(tests|src|specs|vendor|node_modules)\//.test(f))).toBe(false);
    const manifest = JSON.parse(readFileSync(join(consumer, "node_modules/@relate/contrib-phaser/package.json"), "utf8"));
    expect(Number(manifest.version.split(".")[0])).toBe(0);
    expect(manifest.dependencies).toBeUndefined();
    expect(Object.keys(manifest.peerDependencies).sort()).toEqual(["@relate/contrib-web", "phaser"]);
    const installed = join(consumer, "node_modules/@relate/contrib-phaser");
    for (const f of readdirSync(installed, { recursive: true, encoding: "utf8" }).filter((f) => /\.(js|ts|json)$/.test(f))) {
      expect(readFileSync(join(installed, f), "utf8"), f).not.toContain(repo); // nothing points back into this repository
    }
  });

  it("runs the README's example on the real engine, and exports no statements, seeding or drawing", () => {
    expect(example.length).toBeGreaterThan(0);
    const out = JSON.parse(run("node", ["check.mjs"], consumer).trim().split("\n").at(-1)!);
    expect(out.result).toEqual({ ok: true });
    expect(out.cells).toEqual(["a", "z"]);
    expect(out.pending).toBeNull();
    expect(out.exports).toEqual(["Bridge", "ReplyCache", "StatementError", "createThrowawayClient", "versionWatch", "watchCache"]);
  });

  it("has declarations that resolve against the core's types", () => {
    expect(() => run("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], consumer)).not.toThrow();
  });

  it("has a README with the example, what stays in the game, and the limits of the first release", () => {
    expect(readme).toContain("## What stays in your game");
    expect(readme).toContain("## Limits of the first release");
    expect(readme).toMatch(/Unstable below 1\.0/);
    expect(readme).toMatch(/Statements\.\*\* The package ships none/);
    expect(readme).toMatch(/not enforce it/);
    expect(example).toContain("cache.act");
  });
});
