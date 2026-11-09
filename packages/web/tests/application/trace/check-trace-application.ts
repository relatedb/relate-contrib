// Traceability check for specification 006 (FR-029): every requirement (FR-nnn) and success criterion (SC-nnn) must be
// named in a `// covers-app: …` tag in a test under tests/application, and those tests must pass.
// Tags use `covers-app:` because `covers:` belongs to specification 001, whose ids would collide.
//
// usage: tsx tests/application/trace/check-trace-application.ts [--static]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkg = resolve(here, "../../..");
const repo = resolve(pkg, "../..");
const staticOnly = process.argv.includes("--static");

const spec = readFileSync(join(repo, "specs/006-application-graphs/spec.md"), "utf8");
const required = new Set<string>();
for (const m of spec.matchAll(/\*\*((?:FR|SC)-\d+)\*\*/g)) required.add(m[1]!);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const testRoot = join(pkg, "tests/application");
const testFiles = walk(testRoot).filter((f) => /\.(test|spec)\.ts$/.test(f));
const tagged = new Map<string, string[]>();
for (const file of testFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\/\/\s*covers-app:\s*([^\n]+)/g)) {
    for (const raw of m[1]!.split(/[,\s]+/)) {
      const id = raw.trim();
      if (/^(FR|SC)-\d+$/.test(id)) tagged.set(id, [...(tagged.get(id) ?? []), relative(pkg, file)]);
    }
  }
}

const passing = new Map<string, boolean>();
const note = (file: string, ok: boolean): void => {
  const key = file.replace(/^.*?(tests\/application\/)/, "tests/application/");
  passing.set(key, (passing.get(key) ?? true) && ok);
};
let haveReports = false;
const vitest = join(pkg, "reports/application-vitest.json");
if (existsSync(vitest)) {
  haveReports = true;
  const r = JSON.parse(readFileSync(vitest, "utf8")) as { testResults?: Array<{ name: string; status: string }> };
  for (const f of r.testResults ?? []) note(f.name, f.status === "passed");
}
const playwright = join(pkg, "reports/application-playwright.json");
if (existsSync(playwright)) {
  haveReports = true;
  type Spec = { file: string; ok: boolean };
  type Suite = { specs?: Spec[]; suites?: Suite[] };
  const visit = (s: Suite): void => {
    for (const sp of s.specs ?? []) note(join("tests/application/browser", sp.file), sp.ok);
    for (const c of s.suites ?? []) visit(c);
  };
  visit(JSON.parse(readFileSync(playwright, "utf8")) as Suite);
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
    if (!files.every((f) => passing.get(f) !== false) || !files.some((f) => passing.get(f) === true)) notPassing.push(id);
  }
}

const unknown = [...tagged.keys()].filter((id) => !required.has(id));
console.log(`trace: ${required.size} ids in the specification, ${tagged.size} tagged in ${testFiles.length} test files`);
if (unknown.length) console.error(`trace: tags that match no id in the specification: ${unknown.join(", ")}`);
if (untagged.length) console.error(`trace: ids with no tagged test: ${untagged.join(", ")}`);
if (notPassing.length) console.error(`trace: ids whose tagged tests have not passed: ${notPassing.join(", ")}`);
process.exit(untagged.length || notPassing.length || unknown.length ? 1 : 0);
