// Recorded changes (FR-012, FR-013; ADR-013 2.6; research R4; data-model.md `Recorded change`): a change to a package's published
// files needs a recorded change (a warning); a recorded change must name a package that exists; and no package may reach 1.0.0 unless the
// maintainers have listed it in `.changeset/allow-1.0.json`, since a move to 1.0 is their judgement.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import YAML from "yaml";
import type { Finding } from "./check-publishable.js";
import { loadPackages, repoRoot } from "./lib/workspace.js";

export interface Change {
  file: string;
  bumps: Record<string, string>;
}

/** The recorded changes in `.changeset/`: front matter naming packages and a bump. */
export function readChanges(root: string): Change[] {
  const dir = join(root, ".changeset");
  if (!existsSync(dir)) return [];
  const out: Change[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md") || file === "README.md") continue;
    const m = /^---\n([\s\S]*?)\n---/.exec(readFileSync(join(dir, file), "utf8"));
    out.push({ file, bumps: (m ? (YAML.parse(m[1]!) as Record<string, string> | null) : null) ?? {} });
  }
  return out;
}

export function allowed1_0(root: string): string[] {
  const file = join(root, ".changeset/allow-1.0.json");
  return existsSync(file) ? ((JSON.parse(readFileSync(file, "utf8")) as { packages?: string[] }).packages ?? []) : [];
}

export interface Result {
  findings: Finding[];
  warnings: Finding[];
}

/** The files changed since `base`, or undefined when git or the base is not available. */
function changedFiles(root: string, base: string): string[] | undefined {
  try {
    return execFileSync("git", ["-C", root, "diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return undefined;
  }
}

export function checkChanges(root: string, opts: { base?: string } = {}): Result {
  const findings: Finding[] = [];
  const warnings: Finding[] = [];
  const packages = loadPackages(root);
  const names = new Set(packages.map((p) => p.name));
  const changes = readChanges(root);
  const allow = allowed1_0(root);
  for (const c of changes) {
    for (const [name, bump] of Object.entries(c.bumps)) {
      const pkg = packages.find((p) => p.name === name);
      if (!names.has(name)) findings.push({ package: name, rule: "unknown-package", detail: `the recorded change ${c.file} names ${name}, which is not a package of this workspace` });
      else if (bump === "major" && semver.major(pkg!.manifest.version) === 0 && !allow.includes(name)) {
        findings.push({ package: name, rule: "reaches-1.0", detail: `${c.file} records a major change, which would take ${name} from ${pkg!.manifest.version} to 1.0.0; a move to 1.0 is the maintainers' judgement (list the package in .changeset/allow-1.0.json when decided)` });
      }
    }
  }
  for (const p of packages) {
    if (semver.major(p.manifest.version) >= 1 && !allow.includes(p.name)) {
      findings.push({ package: p.name, rule: "reaches-1.0", detail: `${p.name} is at ${p.manifest.version}; a move to 1.0 is the maintainers' judgement (list the package in .changeset/allow-1.0.json when decided)` });
    }
  }
  if (opts.base !== undefined) {
    const files = changedFiles(root, opts.base);
    if (files) {
      const recorded = new Set(changes.flatMap((c) => Object.keys(c.bumps)));
      for (const p of packages) {
        const touched = files.some((f) => f.startsWith(`${p.folder}/src/`) || f === `${p.folder}/README.md`);
        if (touched && !recorded.has(p.name)) warnings.push({ package: p.name, rule: "no-recorded-change", detail: `${p.folder} changed since ${opts.base} and no recorded change names ${p.name}` });
      }
    }
  }
  return { findings, warnings };
}

function main(): void {
  const args = process.argv.slice(2);
  const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : defaultBase();
  const r = checkChanges(repoRoot(), { base });
  const strict = args.includes("--strict");
  if (args.includes("--json")) console.log(JSON.stringify(r));
  for (const f of r.findings) console.error(`${f.package}: ${f.rule}: ${f.detail}`);
  for (const w of r.warnings) console.error(`${strict ? "" : "warning: "}${w.package}: ${w.rule}: ${w.detail}`);
  const failed = r.findings.length > 0 || (strict && r.warnings.length > 0);
  if (!args.includes("--json")) console.log(failed ? "check-changes: failed" : `check-changes: passed${r.warnings.length ? ` (${r.warnings.length} warning(s))` : ""}`);
  process.exit(failed ? 1 : 0);
}

function defaultBase(): string | undefined {
  for (const ref of ["origin/main", "main"]) {
    try {
      return execFileSync("git", ["merge-base", "HEAD", ref], { encoding: "utf8" }).trim();
    } catch {
      /* try the next */
    }
  }
  return undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
