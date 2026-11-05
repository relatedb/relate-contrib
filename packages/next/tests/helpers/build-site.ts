// Builds a small fixture Next app with the adapter under test. The app lives in `conformance-site/.fixtures/<unique>` so that
// it resolves `next`, `react` and `@relate/web-next` from the conformance site's `node_modules`, as a workspace package does.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = fileURLToPath(new URL("../../conformance-site/", import.meta.url));
const fixtures = join(site, ".fixtures");

export type Bundler = "turbopack" | "webpack";

export interface Fixture {
  /** Files by path relative to the app, on top of the defaults. */
  files?: Record<string, string>;
  bundler?: Bundler;
  /** `export` (default) writes static files under `out/`; `server` builds for `next start`. */
  mode?: "export" | "server";
  basePath?: string;
  env?: Record<string, string>;
  /** Settings merged into the Next configuration, as source text of an object literal. */
  config?: string;
}

export interface Built {
  dir: string;
  status: number;
  output: string;
  /** A file of the build's output, as text; for an export, relative to `out/`. */
  read(path: string): string;
  exists(path: string): boolean;
  remove(): void;
}

const ROUTE = `import { createGraphRoute } from "@relate/web-next/server";
import { graphs } from "../../../../lib/graphs.js";
export const dynamic = "force-static";
export const dynamicParams = false;
export const { GET, generateStaticParams } = createGraphRoute(graphs);
`;

const GRAPHS = `export const graphs = { g: { source: () => ({ version: 1, nodes: [{ id: "a", labels: ["X"] }, { id: "b", labels: ["X"] }], links: [{ source: "a", target: "b", type: "T" }] }) } };
`;

const LAYOUT = `import { catalog } from "@relate/web-next/server";
import { graphs } from "../lib/graphs.js";
export default function Layout({ children }) { catalog(graphs); return <html lang="en"><body>{children}</body></html>; }
`;

const PAGE = `export default function Page() { return <main>fixture</main>; }
`;

function writeFixture(fixture: Fixture): string {
  mkdirSync(fixtures, { recursive: true });
  const dir = mkdtempSync(join(fixtures, "app-"));
  const mode = fixture.mode ?? "export";
  const files: Record<string, string> = {
    "app/relate-web/[id]/[file]/route.js": ROUTE,
    "lib/graphs.js": GRAPHS,
    "app/layout.jsx": LAYOUT,
    "app/page.jsx": PAGE,
    "next.config.mjs": `import { fileURLToPath } from "node:url";
import { withRelateWeb } from "@relate/web-next";
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
export default withRelateWeb({ distDir: ${JSON.stringify(mode === "export" ? "out" : ".next")}, ${mode === "export" ? 'output: "export",' : ""} ${fixture.basePath ? `basePath: ${JSON.stringify(fixture.basePath)},` : ""} turbopack: { root }, outputFileTracingRoot: root, ${fixture.config ?? ""} }, {});
`,
    ...fixture.files,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

export interface Dev {
  dir: string;
  url: string;
  write(path: string, text: string): void;
  stop(): void;
}

/** Starts `next dev` on a fixture app and waits for it to answer. */
export async function startDev(fixture: Fixture = {}, port = 5395): Promise<Dev> {
  const dir = writeFixture({ ...fixture, mode: "server" });
  const child: ChildProcess = spawn(join(site, "node_modules/.bin/next"), ["dev", "-p", String(port), ...(fixture.bundler === "webpack" ? ["--webpack"] : [])], { cwd: dir, env: { ...process.env, ...fixture.env }, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`${url}/`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    dir,
    url,
    write: (path, text) => writeFileSync(join(dir, path), text),
    stop: () => {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function buildSite(fixture: Fixture = {}): Built {
  const dir = writeFixture(fixture);
  const mode = fixture.mode ?? "export";
  const next = join(site, "node_modules/.bin/next");
  const args = ["build", ...(fixture.bundler === "webpack" ? ["--webpack"] : [])];
  const run = spawnSync(next, args, { cwd: dir, env: { ...process.env, NODE_ENV: "production", ...fixture.env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = join(dir, mode === "export" ? "out" : ".next");
  return {
    dir,
    status: run.status ?? 1,
    output: `${run.stdout}\n${run.stderr}`,
    read: (path) => readFileSync(join(out, path), "utf8"),
    exists: (path) => existsSync(join(out, path)),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
