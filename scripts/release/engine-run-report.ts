// The issue for a failed engine-release run (FR-020; data-model.md `Engine run result`).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface RunResult {
  version: string;
  results: { package: string; passed: boolean; failures: string[] }[];
}

export interface Report {
  title: string;
  body: string;
}

/** The issue title and body, or null when nothing failed. */
export function engineRunReport(run: RunResult, runUrl: string): Report | null {
  const failed = run.results.filter((r) => !r.passed);
  if (failed.length === 0) return null;
  const lines = [
    `The engine release ${run.version} was tested against the packages and ${failed.length} of ${run.results.length} failed.`,
    "",
    `Run: ${runUrl}`,
    "",
    ...failed.flatMap((r) => [`**${r.package}**`, ...(r.failures.length ? r.failures.map((f) => `- ${f}`) : ["- (no test title was recorded)"]), ""]),
    "No supported engine range was raised for these packages, so installed packages keep working with the engine releases already supported.",
    "This issue is updated by later failing runs for the same engine release; close it once the packages pass or the release is withdrawn.",
  ];
  return { title: `Engine release ${run.version} breaks packages`, body: lines.join("\n") };
}

function main(): void {
  const args = process.argv.slice(2);
  const version = args[0];
  const file = args.includes("--results") ? args[args.indexOf("--results") + 1] : undefined;
  if (!version || !file) {
    console.error("engine-run-report: <version> --results <file> are required");
    process.exit(2);
  }
  const run = JSON.parse(readFileSync(file, "utf8")) as RunResult;
  const url = `${process.env["GITHUB_SERVER_URL"] ?? ""}/${process.env["GITHUB_REPOSITORY"] ?? ""}/actions/runs/${process.env["GITHUB_RUN_ID"] ?? ""}`;
  const r = engineRunReport({ ...run, version }, url);
  if (!r) process.exit(0);
  console.log(JSON.stringify(r));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
