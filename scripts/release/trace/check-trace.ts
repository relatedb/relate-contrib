// Traceability check (FR-026): every requirement (FR-n) and success criterion (SC-n) in specs/010-release-workflows/spec.md must be
// named in a `// covers-rel: FR-n, SC-n` tag in a test file of the release scripts or in a package's engine-assumptions test, and
// those tests must pass.
//
// usage: tsx scripts/release/trace/check-trace.ts [--static]
//   default   also read the reports (scripts/release/reports/vitest.json and each package's reports/vitest.json) and require the
//             tagged files to pass
//   --static  only check that every id is tagged
//
// TRACE_SPEC names another specification file; the check's own test uses it to see an untagged id reported.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const release = resolve(here, "..");
const repo = resolve(release, "../..");
const staticOnly = process.argv.includes("--static");

const spec = readFileSync(process.env.TRACE_SPEC ?? join(repo, "specs/010-release-workflows/spec.md"), "utf8");
const required = new Set<string>();
for (const m of spec.matchAll(/\*\*((?:FR|SC)-\d+)\*\*/g)) required.add(m[1]!);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name !== "node_modules" && name !== "fixtures" && name !== "reports")
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const packageDirs = readdirSync(join(repo, "packages")).map((n) => join(repo, "packages", n)).filter((d) => existsSync(join(d, "package.json")));
const canaries = packageDirs.map((d) => join(d, "tests/unit/engine-assumptions.test.ts")).filter(existsSync);
const testFiles = [...walk(join(release, "tests")).filter((f) => /\.test\.ts$/.test(f)), ...canaries];

const tagged = new Map<string, string[]>();
for (const file of testFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\/\/\s*covers-rel:\s*([^\n]+)/g)) {
    for (const raw of m[1]!.split(/[,\s]+/)) {
      const id = raw.trim();
      if (/^(FR|SC)-\d+$/.test(id)) tagged.set(id, [...(tagged.get(id) ?? []), relative(repo, file)]);
    }
  }
}

// A file passes when every test in it passed in every report that mentions it.
const passing = new Map<string, boolean>();
let haveReports = false;
type VitestReport = { testResults?: Array<{ name: string; status: string }> };
for (const report of [join(release, "reports/vitest.json"), ...packageDirs.map((d) => join(d, "reports/vitest.json"))]) {
  if (!existsSync(report)) continue;
  haveReports = true;
  for (const f of (JSON.parse(readFileSync(report, "utf8")) as VitestReport).testResults ?? []) {
    const file = relative(repo, f.name);
    passing.set(file, (passing.get(file) ?? true) && f.status === "passed");
  }
}

const untagged = [...required].filter((id) => !tagged.has(id));
const notPassing: string[] = [];
if (!staticOnly) {
  if (!haveReports) {
    console.error("trace: no reports found. Run the tests first, or use --static.");
    process.exit(1);
  }
  for (const [id, files] of tagged) {
    if (!required.has(id)) continue;
    if (!files.some((f) => passing.get(f) === true)) notPassing.push(id);
  }
}
const unknown = [...tagged.keys()].filter((id) => !required.has(id));
console.log(`trace: ${required.size} ids in the specification, ${tagged.size} tagged in ${testFiles.length} test files`);
if (unknown.length) console.error(`trace: tags that match no id in the specification: ${unknown.join(", ")}`);
if (untagged.length) console.error(`trace: ids with no tagged test: ${untagged.join(", ")}`);
if (notPassing.length) console.error(`trace: ids whose tagged tests have not passed: ${notPassing.join(", ")}`);
process.exit(untagged.length || notPassing.length || unknown.length ? 1 : 0);
