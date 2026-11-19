// Lists the tests that failed and then passed on a retry, from Playwright's JSON reports. A retry keeps a slow runner from failing a
// run, and must not hide a test that is becoming unreliable: the list goes to the run's summary, and the exit status is always 0.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Spec { title: string; file: string; tests?: Array<{ projectName?: string; status?: string; results?: unknown[] }> }
interface Suite { specs?: Spec[]; suites?: Suite[] }

export function flakyTests(report: Suite): string[] {
  const out: string[] = [];
  const visit = (s: Suite): void => {
    for (const sp of s.specs ?? []) for (const t of sp.tests ?? []) if (t.status === "flaky") out.push(`[${t.projectName ?? "?"}] ${sp.file} › ${sp.title}`);
    for (const c of s.suites ?? []) visit(c);
  };
  visit(report);
  return out;
}

export function flakyInDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /playwright\.json$|conformance\.json$/.test(f) && !/\.(chromium|firefox|webkit)\.json$/.test(f))
    .flatMap((f) => flakyTests(JSON.parse(readFileSync(join(dir, f), "utf8")) as Suite).map((t) => `${dir.replace(/\/reports$/, "")}: ${t}`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const all = process.argv.slice(2).flatMap(flakyInDir);
  if (all.length === 0) console.log("No test needed a retry.");
  else {
    console.log(`${all.length} test(s) failed and then passed on a retry:\n${all.map((t) => `- ${t}`).join("\n")}`);
  }
}
