// covers: FR-029, SC-009
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));
const repo = join(pkg, "../..");

describe("every stated behavior has a tagged test (FR-029)", () => {
  it("the trace check finds a tag for every requirement and success criterion in the specification", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", "tests/trace/check-trace.ts", "--static"], { cwd: pkg, encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/trace: \d+ ids in the specification, \d+ tagged/);
  });

  it("reports an id the specification has and no test tags, and exits non-zero", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel-trace-"));
    try {
      const spec = join(dir, "spec.md");
      writeFileSync(spec, readFileSync(join(repo, "specs/004-observable-adapter/spec.md"), "utf8") + "\n- **FR-999**: a requirement that no test names.\n");
      const run = spawnSync(process.execPath, ["--import", "tsx", "tests/trace/check-trace.ts", "--static"], { cwd: pkg, encoding: "utf8", env: { ...process.env, TRACE_SPEC: spec } });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("ids with no tagged test: FR-999");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the decision records what implementation found (SC-009)", () => {
  const adr = readFileSync(join(repo, "design/adr/ADR-006-observable-adapter.md"), "utf8");
  const amendments = adr.slice(adr.indexOf("## 6. Amendments"));

  it("has a dated amendment for each open item of its consequences that implementation checked", () => {
    expect(amendments).toMatch(/2026-11-08: the open items of section 4/);
    for (const item of ["Loader cache", "Preview server", "Headless browsers", "Published package", "RFC-001 §7.7"]) expect(amendments, item).toContain(item);
  });

  it("is listed as amended in the index", () => {
    expect(readFileSync(join(repo, "design/adr/README.md"), "utf8")).toMatch(/ADR-006[^\n]*accepted \(amended 2026-11-08\)/);
  });
});
