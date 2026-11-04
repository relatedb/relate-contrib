// Builds or serves a small fixture Astro site with the integration under test. A fixture is a map of file paths to
// text, written to a temporary directory inside this package (so the packages resolve as they do for the
// conformance site) and removed afterwards.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, dev, type AstroInlineConfig } from "astro";

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

/** Start `astro dev` on a free port. */
export async function startDev(fixture: Fixture): Promise<DevSite> {
  const root = writeSite(fixture);
  const logs: string[] = [];
  const server = await dev({
    root,
    logLevel: "debug",
    server: { port: 0, host: "127.0.0.1" },
  } as AstroInlineConfig);
  const address = server.address;
  const url = `http://127.0.0.1:${address.port}`;
  return {
    root,
    url,
    logs,
    write(path, text) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    },
    async stop() {
      await server.stop();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
