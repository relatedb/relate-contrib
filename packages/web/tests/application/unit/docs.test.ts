// covers-app: FR-028, FR-029
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = join(import.meta.dirname, "../../..");

describe("the package documentation", () => {
  const readme = readFileSync(join(pkg, "README.md"), "utf8");
  const section = readme.slice(readme.indexOf("## Application graphs"), readme.indexOf("## Supported browsers"));

  it("describes application mode, the failure names, the storage status, export and import, and the rule for migrations", () => {
    for (const word of [
      "application:", "store-unmarked", "store-newer", "import-interrupted", "store-unreadable", "migration-failed",
      "resetApplication", "client.storage", "requestPersistence", "storageEstimate", "exportApplication", "importApplication",
      "allowLoss", "inRanges", "bounded", "safe to run again", "two clients",
    ]) expect(section, word).toContain(word);
  });
});

describe("the trace check", () => {
  it("passes statically when every requirement of the specification is tagged, and names an untagged one when not", () => {
    const run = spawnSync("npx", ["tsx", "tests/application/trace/check-trace-application.ts", "--static"], { cwd: pkg, encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const text = readFileSync(join(pkg, "tests/application/trace/check-trace-application.ts"), "utf8");
    expect(text).toContain("ids with no tagged test");
  });
});
