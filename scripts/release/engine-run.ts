// Run every package's checks against an engine release and write the results (FR-019; data-model.md `Engine run result`). For each
// package: its unit tests (which include its engine-assumptions canary file) and its conformance check if it has one; then the drift
// check once, for the workspace. A package passes when every command exits 0; its failures are the titles of the failed tests read
// from the package's Vitest report.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checksFor } from "./checks-for.js";
import type { RunResult } from "./engine-run-report.js";
import { loadPackages, releaseOrder, repoRoot, type Pkg } from "./lib/workspace.js";

type VitestReport = { testResults?: { assertionResults?: { status: string; fullName?: string; title?: string }[] }[] };

/** The titles of the tests that failed, from a Vitest JSON report. */
export function failedTitles(report: VitestReport): string[] {
  return (report.testResults ?? []).flatMap((f) => (f.assertionResults ?? []).filter((a) => a.status === "failed").map((a) => a.fullName ?? a.title ?? "(a test with no title)"));
}

export type Runner = (command: string[], cwd: string) => { status: number };

const defaultRunner: Runner = (command, cwd) => ({ status: spawnSync(command[0]!, command.slice(1), { cwd, stdio: "inherit" }).status ?? 1 });

/** The scripts that run a package's tests against the engine: its unit command and its conformance command, if it has them. */
export function engineScripts(root: string, pkg: Pkg): string[] {
  const unit = checksFor(root, pkg.name).filter((s) => !s.endsWith("-package") && !s.endsWith("-trace"));
  const folder = pkg.folder.replace("packages/", "");
  const scripts = (pkg.manifest["scripts"] as Record<string, string> | undefined) ?? {};
  const conformance = [`test:${folder}-conformance`, "test:conformance"].find((s) => scripts[s] !== undefined);
  return conformance ? [...unit, conformance] : unit;
}

export function runEngineChecks(root: string, version: string, run: Runner = defaultRunner): RunResult {
  const results: RunResult["results"] = [];
  for (const pkg of releaseOrder(loadPackages(root))) {
    let passed = true;
    for (const script of engineScripts(root, pkg)) {
      if (run(["pnpm", "--filter", pkg.name, "run", script], root).status !== 0) passed = false;
    }
    const reportFile = join(pkg.dir, "reports/vitest.json");
    const failures = !passed && existsSync(reportFile) ? failedTitles(JSON.parse(readFileSync(reportFile, "utf8")) as VitestReport) : [];
    results.push({ package: pkg.name, passed, failures });
  }
  const drift = run(["pnpm", "run", "test:drift"], root).status === 0;
  results.push({ package: "(drift check)", passed: drift, failures: drift ? [] : ["the drift check failed against this engine release"] });
  return { version, results };
}

function main(): void {
  const args = process.argv.slice(2);
  const version = args[0];
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "engine-results.json";
  if (!version) {
    console.error("engine-run: an engine version is required");
    process.exit(2);
  }
  const result = runEngineChecks(repoRoot(), version);
  writeFileSync(out!, JSON.stringify(result, null, 2));
  const failed = result.results.filter((r) => !r.passed);
  console.log(`engine-run: ${result.results.length - failed.length} of ${result.results.length} passed against ${version}`);
  process.exit(0); // the results file says what passed; the workflow decides what to do next
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
