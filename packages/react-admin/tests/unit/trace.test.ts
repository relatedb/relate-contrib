// covers-ra: FR-030, SC-008
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));
const repo = join(pkg, "../..");

const check = (env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", "tests/trace/check-trace.ts", "--static"], { cwd: pkg, encoding: "utf8", env: { ...process.env, ...env } });

describe("every stated behavior has a tagged test (FR-030, SC-008)", () => {
  it("reports an id the specification has and no test tags, and exits non-zero", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel-trace-"));
    try {
      const spec = join(dir, "spec.md");
      writeFileSync(spec, readFileSync(join(repo, "specs/008-react-admin-provider/spec.md"), "utf8") + "\n- **FR-999**: a requirement that no test names.\n");
      const run = check({ TRACE_SPEC: spec });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/ids with no tagged test: .*\bFR-999\b/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a tag that matches no id in the specification", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel-trace-"));
    try {
      const spec = join(dir, "spec.md");
      writeFileSync(spec, "# a specification with one requirement\n\n- **FR-001**: only this one.\n");
      const run = check({ TRACE_SPEC: spec });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/tags that match no id in the specification: .*FR-002/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
