// Traceability check (SC-005): every requirement (FR-n) and success criterion (SC-n) in the specification must be
// named in a `// covers: FR-n, SC-n` tag in a test file, and those tests must pass.
//
// usage: tsx tests/trace/check-trace.ts [--static]
//   default   also read reports/vitest.json, package.json, playwright.json and conformance.json and require the tagged files to pass
//   --static  only check that every id is tagged
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkg = resolve(here, "../..");
const repo = resolve(pkg, "../..");
const staticOnly = process.argv.includes("--static");

const spec = readFileSync(join(repo, "specs/003-next-adapter/spec.md"), "utf8");
const required = new Set<string>();
for (const m of spec.matchAll(/\*\*((?:FR|SC)-\d+)\*\*/g)) required.add(m[1]!);

function walk(dir: string): string[] {
  return readdirSync(dir).filter((name) => name !== "node_modules" && name !== ".tmp" && name !== "verify").flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const testFiles = walk(join(pkg, "tests")).filter((f) => /\.(test|spec)\.tsx?$/.test(f));
// The core's own tests of the build subpath carry `covers-003:` tags; its reports are read as well.
const coreFile = join(repo, "packages/web/tests/unit/build.test.ts");
const coreTags = existsSync(coreFile) ? [coreFile] : [];
const tagged = new Map<string, string[]>(); // id -> files
for (const file of testFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\/\/\s*covers:\s*([^\n]+)/g)) {
    for (const raw of m[1]!.split(/[,\s]+/)) {
      const id = raw.trim();
      if (/^(FR|SC)-\d+$/.test(id)) tagged.set(id, [...(tagged.get(id) ?? []), relative(pkg, file)]);
    }
  }
}

for (const m of coreTags.length ? readFileSync(coreTags[0]!, "utf8").matchAll(/\/\/\s*covers-003:\s*([^\n(]+)/g) : []) {
  for (const raw of m[1]!.split(/[,\s]+/)) {
    const id = raw.trim();
    if (/^(FR|SC)-\d+$/.test(id)) tagged.set(id, [...(tagged.get(id) ?? []), "core:tests/unit/build.test.ts"]);
  }
}

// A file passes when every test in it passed in every report that mentions it.
const passing = new Map<string, boolean>();
function note(file: string, ok: boolean): void {
  const key = file.replace(/^.*?(tests\/)/, "$1");
  passing.set(key, (passing.get(key) ?? true) && ok);
}
let haveReports = false;
const coreReport = join(repo, "packages/web/reports/vitest.json");
if (existsSync(coreReport)) {
  const r = JSON.parse(readFileSync(coreReport, "utf8")) as { testResults?: Array<{ name: string; status: string }> };
  for (const f of r.testResults ?? []) if (f.name.endsWith("tests/unit/build.test.ts")) passing.set("core:tests/unit/build.test.ts", f.status === "passed");
}
for (const name of ["vitest.json", "package.json"]) {
  const report = join(pkg, "reports", name);
  if (!existsSync(report)) continue;
  haveReports = true;
  const r = JSON.parse(readFileSync(report, "utf8")) as { testResults?: Array<{ name: string; status: string }> };
  for (const f of r.testResults ?? []) note(f.name, f.status === "passed");
}
for (const name of ["playwright.json", "conformance.json"]) {
  const report = join(pkg, "reports", name);
  if (!existsSync(report)) continue;
  haveReports = true;
  type Spec = { file: string; ok: boolean };
  type Suite = { specs?: Spec[]; suites?: Suite[] };
  const visit = (s: Suite): void => {
    for (const sp of s.specs ?? []) note(join("tests/browser", sp.file), sp.ok);
    for (const c of s.suites ?? []) visit(c);
  };
  visit(JSON.parse(readFileSync(report, "utf8")) as Suite);
}

const untagged = [...required].filter((id) => !tagged.has(id));
const notPassing: string[] = [];
if (!staticOnly) {
  if (!haveReports) {
    console.error("trace: no reports found in reports/. Run the tests first, or use --static.");
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
