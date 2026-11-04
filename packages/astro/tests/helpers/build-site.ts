// Builds or serves a small fixture Astro site with the integration under test. A fixture is a map of file paths to
// text, written to a temporary directory inside this package (so the packages resolve as they do for the
// conformance site) and removed afterwards.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { build, type AstroInlineConfig } from "astro";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export interface Fixture {
  /** Files of the site, relative to its root: `src/pages/index.astro`, `src/graph.ts`, ... */
  files: Record<string, string>;
  /** Integration options, as source text evaluated in the site's astro.config (default: `{}`). */
  options?: string;
  base?: string;
  output?: "static" | "server";
}

export interface Site {
  root: string;
  /** Read a file of the build output (dist/) as text. */
  read(path: string): string;
  exists(path: string): boolean;
  files(): string[];
  cleanup(): void;
}

function writeSite(fixture: Fixture): string {
  mkdirSync(join(pkg, "tests/.tmp"), { recursive: true });
  const root = mkdtempSync(join(pkg, "tests/.tmp/site-"));
  for (const [path, text] of Object.entries(fixture.files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  // The package is installed in the site the way a workspace link would install it (its own name resolves to it).
  mkdirSync(join(root, "node_modules"), { recursive: true });
  symlinkSync(pkg, join(root, "node_modules/related-web-astro"), "dir");
  const integration = pathToFileURL(join(pkg, "dist/index.js")).href;
  writeFileSync(
    join(root, "astro.config.mjs"),
    `import { defineConfig } from "astro/config";
import relatedWeb from ${JSON.stringify(integration)};
export default defineConfig({
  output: ${JSON.stringify(fixture.output ?? "static")},
  ${fixture.base ? `base: ${JSON.stringify(fixture.base)},` : ""}
  build: { format: "file" },
  integrations: [relatedWeb(${fixture.options ?? "{}"})],
});
`,
  );
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module" }));
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ extends: "astro/tsconfigs/base" }));
  return root;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Build a fixture. Resolves with the site; rejects with the build's error, whose message is the failure text. */
export async function buildSite(fixture: Fixture): Promise<Site> {
  const root = writeSite(fixture);
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  try {
    await build({ root, logLevel: "silent" } satisfies AstroInlineConfig);
  } catch (e) {
    cleanup();
    throw e;
  }
  const out = join(root, "dist");
  return {
    root,
    read: (path) => readFileSync(join(out, path), "utf8"),
    exists: (path) => existsSync(join(out, path)),
    files: () => walk(out).map((f) => f.slice(out.length + 1)),
    cleanup,
  };
}

export interface DevSite {
  root: string;
  url: string;
  /** Write or replace a file of the running site. */
  write(path: string, text: string): void;
  logs: string[];
  stop(): Promise<void>;
}

/** Start `astro dev` (the command-line tool, as a site author runs it) on a free port. */
export async function startDev(fixture: Fixture): Promise<DevSite> {
  const root = writeSite(fixture);
  const port = await freePort();
  const logs: string[] = [];
  const child = spawn(join(pkg, "node_modules/.bin/astro"), ["dev", "--port", String(port), "--host", "127.0.0.1", "--ignore-lock"], {
    cwd: root,
    // Astro starts a background daemon when it detects an agent, and the test runner's NODE_ENV=test makes the dev
    // server serve nothing; a test needs the foreground, development-mode server it can stop.
    env: Object.fromEntries(Object.entries({ ...process.env, FORCE_COLOR: "0" }).filter(([k]) => !["AI_AGENT", "CLAUDECODE", "NODE_ENV"].includes(k) && !k.startsWith("VITEST") && !k.startsWith("VITE_"))),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d: Buffer) => logs.push(d.toString()));
  child.stderr.on("data", (d: Buffer) => logs.push(d.toString()));
  const url = `http://127.0.0.1:${port}`;
  // Ready when the site's first page is served (the port opens before the routes are known).
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).status === 200) break;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return {
    root,
    url,
    logs,
    write(path, text) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((r) => child.once("exit", r));
      }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolvePort(port));
    });
  });
}
