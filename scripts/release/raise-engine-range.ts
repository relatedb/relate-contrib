// Raise the newest supported engine in the engine ranges of the packages that passed (FR-019; data-model.md `Engine range`,
// `Recorded change`): `>=OLDEST <=NEWEST` becomes `>=OLDEST <=<version>`, and a recorded change (patch) is written for each.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { formatRange, includesVersion, isRelease, nextMinor, parseEngineRange } from "./lib/ranges.js";
import { DEFAULT_REGISTRY, fetchVersions } from "./lib/registry.js";
import { ENGINE, ENGINE_LOADERS, findPackage, loadPackages, repoRoot } from "./lib/workspace.js";

export interface Raised {
  raised: string[];
  /** Already at or above the version. */
  leftAlone: string[];
  /** Named, but does not load the engine, so it declares no range to raise. */
  skipped: string[];
}

export function raiseEngineRange(root: string, version: string, passed: string[], known: string[]): Raised {
  if (!isRelease(version)) throw new Error(`${version} is a prerelease or not a version; no range is raised to it`);
  if (!known.includes(version)) throw new Error(`${version} is not a release of the engine on the registry`);
  const packages = loadPackages(root);
  const out: Raised = { raised: [], leftAlone: [], skipped: [] };
  for (const name of passed) {
    const pkg = findPackage(packages, name);
    if (!pkg) throw new Error(`${name} is not a package of this workspace`);
    if (!ENGINE_LOADERS.includes(name)) {
      out.skipped.push(name);
      continue;
    }
    const parsed = parseEngineRange(pkg.manifest.peerDependencies?.[ENGINE]);
    if (!parsed.ok) throw new Error(`${name}: ${parsed.reason}`);
    const exclusive = parsed.value.exclusive === true;
    if (!exclusive && semver.lt(version, parsed.value.newest)) throw new Error(`${name}: ${version} is below its newest supported engine ${parsed.value.newest}`);
    if (exclusive && semver.lt(version, parsed.value.oldest)) throw new Error(`${name}: ${version} is below its oldest supported engine ${parsed.value.oldest}`);
    // an exclusive range (<X.Y.0) already supports every release below its boundary: it moves only for a release at or above it
    if (exclusive ? includesVersion(parsed.value, version) : semver.eq(version, parsed.value.newest)) {
      out.leftAlone.push(name);
      continue;
    }
    const file = join(pkg.dir, "package.json");
    const manifest = JSON.parse(readFileSync(file, "utf8")) as { peerDependencies: Record<string, string> };
    manifest.peerDependencies[ENGINE] = formatRange(exclusive ? { oldest: parsed.value.oldest, newest: nextMinor(version), exclusive: true } : { oldest: parsed.value.oldest, newest: version });
    writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
    mkdirSync(join(root, ".changeset"), { recursive: true });
    const slug = `${version.replace(/\./g, "-")}-${name.replace("@relate/contrib-", "")}`;
    writeFileSync(join(root, ".changeset", `engine-${slug}.md`), `---\n"${name}": patch\n---\n\nSupports engine ${version}.\n`);
    out.raised.push(name);
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const version = args[0];
  const passed = args.includes("--passed") ? args.slice(args.indexOf("--passed") + 1).filter((a) => !a.startsWith("--")) : [];
  if (!version) {
    console.error("raise-engine-range: an engine version is required");
    process.exit(2);
  }
  const found = await fetchVersions(ENGINE, DEFAULT_REGISTRY);
  const known = found.status === "ok" ? found.versions : [];
  try {
    const r = raiseEngineRange(repoRoot(), version, passed, known);
    console.log(`raised: ${r.raised.join(", ") || "none"}\nleft alone: ${r.leftAlone.join(", ") || "none"}\nskipped: ${r.skipped.join(", ") || "none"}`);
  } catch (err) {
    console.error(`raise-engine-range: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  void existsSync;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
