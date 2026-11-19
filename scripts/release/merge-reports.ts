// Joins the per-browser Playwright reports of a job matrix into the reports the traceability checks read. A report written as
// `<name>.<browser>.json` (for example `playwright.chromium.json`, `conformance.webkit.json`, `application-playwright.firefox.json`)
// is merged with the other browsers' into `<name>.json`: Playwright's JSON, with every suite of every report and the statistics added.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PER_BROWSER = /^(.+)\.(chromium|firefox|webkit)\.json$/;

export function mergeReports(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const groups = new Map<string, string[]>();
  for (const f of readdirSync(dir).sort()) {
    const m = PER_BROWSER.exec(f);
    if (m) groups.set(m[1]!, [...(groups.get(m[1]!) ?? []), f]);
  }
  const written: string[] = [];
  for (const [base, parts] of groups) {
    const reports = parts.map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as { suites?: unknown[]; stats?: Record<string, number> });
    const merged = { ...reports[0], suites: reports.flatMap((r) => r.suites ?? []), stats: sumStats(reports.map((r) => r.stats ?? {})) };
    writeFileSync(join(dir, `${base}.json`), JSON.stringify(merged));
    written.push(`${base}.json`);
  }
  return written;
}

function sumStats(all: Array<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of all) for (const [k, v] of Object.entries(s)) if (typeof v === "number") out[k] = (out[k] ?? 0) + v;
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const dir of process.argv.slice(2)) console.log(`${dir}: ${mergeReports(dir).join(", ") || "nothing to merge"}`);
}
