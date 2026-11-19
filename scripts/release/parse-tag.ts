// A version tag names one package and one version (FR-015, FR-028; research R7; data-model.md `Version tag`): `<package name>@<version>`.
// The package must exist, the version must be the manifest's at the tagged commit, and the commit must be on a protected branch.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findPackage, loadPackages, repoRoot } from "./lib/workspace.js";

export type Parsed = { ok: true; package: string; version: string } | { ok: false; reason: string };

const TAG = /^(@relate\/contrib-[a-z][a-z0-9-]*)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function parseTag(root: string, tag: string, opts: { branch?: string } = {}): Parsed {
  const m = TAG.exec(tag);
  if (!m) return { ok: false, reason: `"${tag}" is not of the form <package name>@<version>, such as @relate/contrib-web@0.1.0` };
  const [name, version] = [m[1]!, m[2]!];
  const pkg = findPackage(loadPackages(root), name);
  if (!pkg) return { ok: false, reason: `the tag names ${name}, which is not a package of this workspace` };
  if (pkg.manifest.version !== version) return { ok: false, reason: `the tag says ${version} but ${name}'s manifest at this commit says ${pkg.manifest.version}` };
  if (opts.branch !== undefined) {
    try {
      execFileSync("git", ["-C", root, "merge-base", "--is-ancestor", `refs/tags/${tag}`, opts.branch], { stdio: "ignore" });
    } catch {
      return { ok: false, reason: `the tagged commit is not on the history of ${opts.branch}` };
    }
  }
  return { ok: true, package: name, version };
}

function main(): void {
  const args = process.argv.slice(2);
  const tag = args[0];
  if (!tag) {
    console.error("parse-tag: a tag is required");
    process.exit(2);
  }
  const branch = args.includes("--branch") ? args[args.indexOf("--branch") + 1] : undefined;
  const r = parseTag(repoRoot(), tag, { branch });
  if (!r.ok) {
    console.error(`parse-tag: ${r.reason}`);
    process.exit(1);
  }
  console.log(r.package);
  console.log(r.version);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
