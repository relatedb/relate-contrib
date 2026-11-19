// Is each package fit to publish? (FR-001 to FR-005; ADR-013 2.8, 2.9; data-model.md `Package manifest`.) Names the package
// and the item for each failure. A package still marked private is reported `unreleased` and passes, unless `--release` says the
// package is about to be released.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackages, repoRoot, type Pkg } from "./lib/workspace.js";

export interface Finding {
  package: string;
  rule: string;
  detail: string;
}

/** Peers that are there for development only and must not appear in a published manifest. */
export const DEV_ONLY_PEERS = ["@playwright/test", "vitest", "typescript", "@types/node", "tsx"];

/** What a package may list in `files` besides its build output, its README and its license: build output shipped as source. */
export const SHIPPED_EXTRAS: Record<string, string[]> = {
  "@relate/contrib-web": ["conformance"],
  "@relate/contrib-astro": ["src/GraphData.astro"],
  "@relate/contrib-sveltekit": ["src/*.js", "src/*.svelte", "src/*.d.ts"],
};

const NAME = /^@relate\/contrib-[a-z][a-z0-9-]*$/;
const baseFiles = (entry: string): boolean => entry === "dist" || entry.startsWith("dist/") || entry === "README.md" || entry === "LICENSE";

export interface Result {
  findings: Finding[];
  /** Packages still marked private, reported and not failed when this is not a release check. */
  unreleased: string[];
}

export function checkPublishable(root: string, opts: { release?: boolean; only?: string[] } = {}): Result {
  const findings: Finding[] = [];
  const unreleased: string[] = [];
  const add = (pkg: string, rule: string, detail: string) => findings.push({ package: pkg, rule, detail });
  if (!existsSync(join(root, "LICENSE"))) add("(repository)", "license-file", "there is no LICENSE file at the repository root");
  const packages = loadPackages(root).filter((p) => !opts.only?.length || opts.only.includes(p.name));
  for (const p of packages) checkOne(p, root, opts.release ?? false, add, unreleased);
  return { findings, unreleased };
}

function checkOne(p: Pkg, root: string, release: boolean, add: (pkg: string, rule: string, detail: string) => void, unreleased: string[]): void {
  const m = p.manifest;
  if (!NAME.test(p.name)) add(p.name, "name", "a published name is @relate/contrib-<project>");
  if (m.license !== "Apache-2.0") add(p.name, "license", `the license is ${m.license === undefined ? "missing" : `"${m.license}"`}; expected "Apache-2.0"`);
  if (!existsSync(join(p.dir, "LICENSE"))) add(p.name, "license-file", `there is no LICENSE file in ${p.folder}`);
  const repo = typeof m.repository === "object" ? m.repository : undefined;
  if (!repo?.url) add(p.name, "repository", "the repository address is missing");
  else if (repo.directory !== p.folder) add(p.name, "repository", `the repository directory is ${repo.directory === undefined ? "missing" : `"${repo.directory}"`}; expected "${p.folder}"`);
  if (typeof m.homepage !== "string" || m.homepage === "") add(p.name, "homepage", "the homepage is missing");
  if (!Array.isArray(m.keywords) || m.keywords.length === 0) add(p.name, "keywords", "there are no keywords");
  if (m.publishConfig?.access !== "public") add(p.name, "publishConfig", 'publishConfig.access is not "public"');
  const allowed = SHIPPED_EXTRAS[p.name] ?? [];
  const extra = (m.files ?? []).filter((f) => !baseFiles(f) && !allowed.includes(f));
  if (!m.files || m.files.length === 0) add(p.name, "files", "files is not set, so everything in the folder would be published");
  else if (extra.length) add(p.name, "files", `files lists more than the build output, the README and the license: ${extra.join(", ")}`);
  for (const peer of Object.keys(m.peerDependencies ?? {})) {
    if (DEV_ONLY_PEERS.includes(peer)) add(p.name, "dev-only-peer", `${peer} is a development tool and is declared as a peer`);
  }
  if (m.private === true) {
    if (release) add(p.name, "private", "the package is still marked private; remove it to release");
    else unreleased.push(p.name);
  }
  void root;
}

function main(): void {
  const args = process.argv.slice(2);
  const only: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === "--package") only.push(args[++i]!);
  const result = checkPublishable(repoRoot(), { release: args.includes("--release"), only });
  if (args.includes("--json")) console.log(JSON.stringify(result));
  for (const f of result.findings) console.error(`${f.package}: ${f.rule}: ${f.detail}`);
  if (!args.includes("--json")) {
    if (result.unreleased.length) console.log(`unreleased (still private): ${result.unreleased.join(", ")}`);
    console.log(result.findings.length === 0 ? "check-publishable: passed" : `check-publishable: ${result.findings.length} finding(s)`);
  }
  process.exit(result.findings.length === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
