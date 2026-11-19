// The release plan (FR-011, FR-014, FR-016; data-model.md `Release plan`): the packages whose version is not on the registry, in
// dependency order, each with its gate verdict. A rehearsal says that no credential is used. A package already published at its
// version is left out. An earlier package that would pass is taken as published when judging a later one.
import { fileURLToPath } from "node:url";
import { DEFAULT_REGISTRY, fetchVersions } from "./lib/registry.js";
import { loadPackages, releaseOrder, repoRoot } from "./lib/workspace.js";
import { gate, type Verdict } from "./release-gate.js";

export interface PlanEntry {
  package: string;
  version: string;
  verdict: Verdict;
}

export interface Plan {
  mode: "rehearsal" | "release";
  credentials: "none" | "trusted-publishing";
  entries: PlanEntry[];
}

export interface PlanOptions {
  only?: string[];
  registry?: string;
  rehearsal?: boolean;
  fetchImpl?: typeof fetch;
}

export async function planRelease(root: string, opts: PlanOptions = {}): Promise<Plan> {
  const registry = opts.registry ?? DEFAULT_REGISTRY;
  const packages = releaseOrder(loadPackages(root)).filter((p) => !opts.only?.length || opts.only.includes(p.name));
  const pending: Record<string, string> = {};
  const entries: PlanEntry[] = [];
  for (const p of packages) {
    const version = p.manifest.version;
    const known = await fetchVersions(p.name, registry, opts.fetchImpl);
    if (known.status === "ok" && known.versions.includes(version)) continue; // already published
    const verdict = await gate(root, p.name, { registry, version, pending, fetchImpl: opts.fetchImpl });
    entries.push({ package: p.name, version, verdict });
    if (verdict.pass) pending[p.name] = version;
  }
  const rehearsal = opts.rehearsal ?? true;
  return { mode: rehearsal ? "rehearsal" : "release", credentials: rehearsal ? "none" : "trusted-publishing", entries };
}

export function formatPlan(plan: Plan): string {
  const lines = [`mode: ${plan.mode}${plan.mode === "rehearsal" ? " (no registry credential is used and nothing is published)" : ""}`];
  plan.entries.forEach((e, i) => {
    const v = e.verdict.pass ? "would publish" : `refused: ${e.verdict.reason}`;
    lines.push(`${i + 1}. ${e.package}@${e.version}  ${v}${e.verdict.pass ? "" : ` (${e.verdict.detail})`}`);
  });
  if (plan.entries.length === 0) lines.push("nothing to publish: every package is already on the registry at its version");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (n: string): string | undefined => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const only = args.includes("--all") ? [] : flag("--package") ? [flag("--package")!] : [];
  const plan = await planRelease(repoRoot(), { only, registry: flag("--registry"), rehearsal: args.includes("--rehearsal") || !args.includes("--release") });
  console.log(args.includes("--json") ? JSON.stringify(plan, null, 2) : formatPlan(plan));
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
