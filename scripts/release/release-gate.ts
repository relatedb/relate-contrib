// The release gate (FR-009 to FR-011; ADR-013 2.2; data-model.md `Gate verdict`): a package is not published unless every @relate package
// it peers on is on the registry at a version its range accepts, its engine range is real, its own version is not already
// published, and it is not a first release (those are made by hand, FR-028).
import { fileURLToPath } from "node:url";
import semver from "semver";
import { parseEngineRange } from "./lib/ranges.js";
import { DEFAULT_REGISTRY, fetchVersions } from "./lib/registry.js";
import { ENGINE, ENGINE_LOADERS, findPackage, loadPackages, repoRoot } from "./lib/workspace.js";

export type Reason =
  | "peer-not-published"
  | "peer-out-of-range"
  | "engine-range-invalid"
  | "version-exists"
  | "registry-unreachable"
  | "first-release-is-manual";

export type Verdict = { pass: true } | { pass: false; reason: Reason; detail: string };

export interface GateOptions {
  registry?: string;
  /** The version to be published; the manifest's by default. */
  version?: string;
  /** Packages about to be published earlier in the same plan, taken as published: name to version. */
  pending?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

const refuse = (reason: Reason, detail: string): Verdict => ({ pass: false, reason, detail });

export async function gate(root: string, name: string, opts: GateOptions = {}): Promise<Verdict> {
  const pkg = findPackage(loadPackages(root), name);
  if (!pkg) return refuse("peer-not-published", `${name} is not a package of this workspace`);
  const registry = opts.registry ?? DEFAULT_REGISTRY;
  const peers = pkg.manifest.peerDependencies ?? {};
  const version = opts.version ?? pkg.manifest.version;

  if (ENGINE_LOADERS.includes(name)) {
    const parsed = parseEngineRange(peers[ENGINE]);
    if (!parsed.ok) return refuse("engine-range-invalid", parsed.reason);
  }

  const own = await fetchVersions(name, registry, opts.fetchImpl);
  if (own.status === "unreachable") return refuse("registry-unreachable", `${name}: ${own.detail}`);
  if (own.status === "absent") return refuse("first-release-is-manual", `${name} is not on the registry; its first release is made by hand (docs/releasing.md)`);
  if (own.versions.includes(version)) return refuse("version-exists", `${name}@${version} is already on the registry`);

  for (const [peer, range] of Object.entries(peers)) {
    if (!peer.startsWith("@relate/")) continue;
    const pending = opts.pending?.[peer];
    if (pending !== undefined && semver.satisfies(pending, range)) continue;
    const found = await fetchVersions(peer, registry, opts.fetchImpl);
    if (found.status === "unreachable") return refuse("registry-unreachable", `${peer}: ${found.detail}`);
    if (found.status === "absent") return refuse("peer-not-published", `${peer} is not on the registry`);
    const accepted = found.versions.filter((v) => !found.deprecated.includes(v) && semver.satisfies(v, range));
    if (accepted.length === 0) {
      return refuse("peer-out-of-range", `${peer} is on the registry at ${found.versions.join(", ") || "no versions"}, none of which ${name}'s range "${range}" accepts`);
    }
  }
  return { pass: true };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (n: string): string | undefined => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const name = flag("--package");
  if (!name) {
    console.error("release-gate: --package <name> is required");
    process.exit(2);
  }
  const v = await gate(repoRoot(), name, { registry: flag("--registry"), version: flag("--version") });
  if (args.includes("--json")) console.log(JSON.stringify(v));
  else console.log(v.pass ? "pass" : `refuse ${v.reason}: ${v.detail}`);
  process.exit(v.pass ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
