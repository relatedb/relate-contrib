// Builds a small fixture SvelteKit app with the adapter under test. The app lives in `conformance-site/.fixtures/<unique>` so that it
// resolves SvelteKit, Svelte, the adapters and `@relate/sveltekit` from the conformance site's `node_modules`, as a workspace package does.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const site = fileURLToPath(new URL("../../conformance-site/", import.meta.url));
const fixtures = join(site, ".fixtures");
const vite = join(site, "node_modules/.bin/vite");

export interface Fixture {
  name: string;
  /** Files by path relative to the app, on top of the defaults. */
  files?: Record<string, string>;
  adapter?: "static" | "node";
  base?: string;
  env?: Record<string, string>;
}

export interface Built {
  dir: string;
  /** The output directory (`build`). */
  out: string;
  status: number | null;
  output: string;
  read(path: string): string;
  exists(path: string): boolean;
  list(path: string): string[];
  remove(): void;
}

const config = (adapter: string) => `import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
const adapter = process.env.ADAPTER === "node" ? adapterNode({ out: "build" }) : adapterStatic({ pages: "build", assets: "build", strict: true });
export default defineConfig({ plugins: [sveltekit({ adapter, paths: { base: process.env.BASE ?? "" } })], server: { host: "127.0.0.1", port: Number(process.env.PORT ?? 5486), fs: { allow: ["../../../../.."] } } });
`;

const defaults: Record<string, string> = {
  "package.json": JSON.stringify({ name: "fixture", private: true, type: "module", imports: { "#lib/*": "./src/lib/*" } }),
  "src/app.html": `<!doctype html><html><head>%sveltekit.head%</head><body><div style="display: contents">%sveltekit.body%</div></body></html>\n`,
  "src/routes/+layout.ts": `export const prerender = true;\n`,
  "src/routes/+page.svelte": `<h1>fixture</h1>\n`,
};

/** Write a fixture app and run `vite build` in it. */
export function build(fixture: Fixture): Promise<Built> {
  const dir = join(fixtures, `${fixture.name}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const files = { ...defaults, "vite.config.js": config(fixture.adapter ?? "static"), ...fixture.files };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const built = (status: number | null, output: string): Built => ({
    dir,
    out: join(dir, "build"),
    status,
    output,
    read: (path) => readFileSync(join(dir, "build", path), "utf8"),
    exists: (path) => existsSync(join(dir, "build", path)),
    list: (path) => (existsSync(join(dir, "build", path)) ? readdirSync(join(dir, "build", path)) : []),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  });
  return new Promise((resolve) => {
    const child = spawn(vite, ["build"], { cwd: dir, env: { ...process.env, ADAPTER: fixture.adapter ?? "static", ...(fixture.base ? { BASE: fixture.base } : {}), ...fixture.env } });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (status) => resolve(built(status, output)));
  });
}

/** Run a Node output (`node build`) on a port; stop it with `stop()`. */
export async function serveNode(built: Built, port: number): Promise<{ origin: string; stop(): void }> {
  const child: ChildProcess = spawn(process.execPath, [built.out], { cwd: built.dir, env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) }, stdio: "ignore" });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(origin + "/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return { origin, stop: () => void child.kill() };
}

export const isDirectory = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

/** Write a fixture app and start `vite dev` in it on a port; stop it with `stop()`. */
export async function startDev(fixture: Fixture, port: number): Promise<{ dir: string; origin: string; write(path: string, text: string): void; stop(): void }> {
  const dir = join(fixtures, `${fixture.name}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const files = { ...defaults, "vite.config.js": config(fixture.adapter ?? "static"), ...fixture.files };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const child: ChildProcess = spawn(vite, ["dev"], { cwd: dir, env: { ...process.env, NODE_ENV: "development", PORT: String(port), ...fixture.env }, stdio: "ignore" });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(origin + "/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  return {
    dir,
    origin,
    write(path, text) {
      writeFileSync(join(dir, path), text);
    },
    stop() {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
