// A throwaway Framework project for build tests: a folder under packages/observable/.tmp with the adapter's published files
// copied in (real directories, since Framework's bundler fails on a symlink to a plain directory outside the project;
// research V-6), the engine and Framework linked, and the files a test gives it.
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const packageRoot = join(here, "../..");
export const repoRoot = join(packageRoot, "../..");
const require = createRequire(join(packageRoot, "package.json"));

const frameworkRoot = (): string => dirname(require.resolve("@observablehq/framework/package.json"));
export const frameworkBin = (): string => join(frameworkRoot(), "dist/bin/observable.js");

export interface Result {
  status: number | null;
  output: string;
}

export interface Site {
  dir: string;
  dist: string;
  write(path: string, content: string | Buffer): void;
  read(path: string): string;
  exists(path: string): boolean;
  /** Run the Framework CLI in the site, with telemetry off. */
  run(args: string[], env?: Record<string, string>): Promise<Result>;
  /** Run a data loader script as Framework does: Node, the site as working directory. */
  loader(path: string, cwd?: string): { status: number | null; stdout: Buffer; stderr: string };
  /** Remove the loader cache (Framework has no clean command), then `observable build`. */
  build(): Promise<Result>;
  remove(): void;
}

const copyPackage = (name: string, source: string, target: string, entries: string[]): void => {
  mkdirSync(join(target, "node_modules/@relate", name), { recursive: true });
  for (const entry of entries) if (existsSync(join(source, entry))) cpSync(join(source, entry), join(target, "node_modules/@relate", name, entry), { recursive: true });
};

const baseConfig = `export default { title: "t", root: "docs", pages: [], toc: false, footer: "", sidebar: false, header: "", preserveExtension: true, telemetry: false };\n`;

/** Make a site named `name` with `files` (paths relative to the site) in addition to a package.json and a Framework config. */
export function makeSite(name: string, files: Record<string, string>): Site {
  const dir = join(packageRoot, ".tmp", `${name}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, private: true, type: "module" }));
  writeFileSync(join(dir, "observablehq.config.js"), baseConfig);
  copyPackage("contrib-web", join(repoRoot, "packages/web"), dir, ["package.json", "dist"]);
  copyPackage("contrib-observable", packageRoot, dir, ["package.json", "dist"]);
  symlinkSync(realpathSync(join(repoRoot, "vendor/relate-wasm/pkg")), join(dir, "node_modules/@relate/relate-wasm"));
  mkdirSync(join(dir, "node_modules/@observablehq"), { recursive: true });
  symlinkSync(frameworkRoot(), join(dir, "node_modules/@observablehq/framework"));
  symlinkSync(realpathSync(join(packageRoot, "node_modules/esbuild")), join(dir, "node_modules/esbuild"));

  const site: Site = {
    dir,
    dist: join(dir, "dist"),
    write(path, content) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), content);
    },
    read: (path) => readFileSync(join(dir, path), "utf8"),
    exists: (path) => existsSync(join(dir, path)),
    run(args, env = {}) {
      return new Promise((resolve) => {
        const child = spawn(process.execPath, [frameworkBin(), ...args], { cwd: dir, env: { ...process.env, OBSERVABLE_TELEMETRY_DISABLE: "true", ...env } });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (status) => resolve({ status, output }));
      });
    },
    loader(path, cwd = dir) {
      const run = spawnSync(process.execPath, [join(dir, path)], { cwd, maxBuffer: 64 * 1024 * 1024 });
      return { status: run.status, stdout: run.stdout, stderr: run.stderr.toString() };
    },
    async build() {
      rmSync(join(dir, "docs/.observablehq/cache"), { recursive: true, force: true });
      rmSync(join(dir, "dist"), { recursive: true, force: true });
      return site.run(["build"]);
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
  for (const [path, content] of Object.entries(files)) site.write(path, content);
  return site;
}
