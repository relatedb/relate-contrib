// Traceability check (FR-017): every requirement (FR-n) and success criterion (SC-n) in specs/009-relate-phaser-package/spec.md
// must be named in a `// covers-ph: FR-n, SC-n` tag in a test file of the package, and those tests must pass. An id whose line in
// the specification says "Verified in hextant" is checked by the path explorer's own repository (akollegger/hextant) and is skipped.
//
// usage: tsx tests/trace/check-trace.ts [--static]
//   default   also read the reports of the package (reports/vitest.json, reports/package.json) and require the tagged files to pass
//   --static  only check that every id is tagged
//
// TRACE_SPEC names another specification file; the check's own test uses it to see an untagged id reported.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkg = resolve(here, "../..");
const repo = resolve(pkg, "../..");
const staticOnly = process.argv.includes("--static");

const spec = readFileSync(process.env.TRACE_SPEC ?? join(repo, "specs/009-relate-phaser-package/spec.md"), "utf8");
const required = new Set<string>();
for (const line of spec.split("\n")) {
  const m = /\*\*((?:FR|SC)-\d+)\*\*/.exec(line);
  if (m && !/Verified in hextant/.test(line)) required.add(m[1]!);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name !== "node_modules" && name !== ".tmp" && name !== "verify")
    .flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

const testFiles = walk(join(pkg, "tests")).filter((f) => /\.(test|spec)\.tsx?$/.test(f));
const tagged = new Map<string, string[]>(); // id -> files, relative to the repository
for (const file of testFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\/\/\s*covers-ph:\s*([^\n]+)/g)) {
    for (const raw of m[1]!.split(/[,\s]+/)) {
      const id = raw.trim();
      if (/^(FR|SC)-\d+$/.test(id)) tagged.set(id, [...(tagged.get(id) ?? []), relative(repo, file)]);
    }
  }
}

// A file passes when every test in it passed in every report that mentions it.
const passing = new Map<string, boolean>();
function note(file: string, ok: boolean): void {
  passing.set(file, (passing.get(file) ?? true) && ok);
}
let haveReports = false;

type VitestReport = { testResults?: Array<{ name: string; status: string }> };
for (const report of [
  join(pkg, "reports/vitest.json"),
  join(pkg, "reports/package.json"),
]) {
  if (!existsSync(report)) continue;
  haveReports = true;
  for (const f of (JSON.parse(readFileSync(report, "utf8")) as VitestReport).testResults ?? []) {
    note(relative(repo, f.name), f.status === "passed");
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
    const ok = files.some((f) => passing.get(f) === true);
    if (!ok) notPassing.push(id);
  }
}

const unknown = [...tagged.keys()].filter((id) => !required.has(id));
console.log(`trace: ${required.size} ids in the specification, ${tagged.size} tagged in ${testFiles.length} test files`);
if (unknown.length) console.error(`trace: tags that match no id in the specification: ${unknown.join(", ")}`);
if (untagged.length) console.error(`trace: ids with no tagged test: ${untagged.join(", ")}`);
if (notPassing.length) console.error(`trace: ids whose tagged tests have not passed: ${notPassing.join(", ")}`);
process.exit(untagged.length || notPassing.length || unknown.length ? 1 : 0);
