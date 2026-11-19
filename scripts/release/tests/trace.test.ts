// covers-rel: FR-026, SC-008
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../lib/workspace.js";

const root = repoRoot();
const trace = (env: Record<string, string>) => {
  try {
    execFileSync("pnpm", ["exec", "tsx", "scripts/release/trace/check-trace.ts", "--static"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
    return { code: 0, err: "" };
  } catch (e) {
    const x = e as { status: number; stderr: string };
    return { code: x.status, err: x.stderr };
  }
};

describe("the trace check", () => {
  it("passes on the real specification, where every requirement and success criterion is tagged", () => {
    expect(trace({})).toEqual({ code: 0, err: "" });
  });

  it("reports an id that no test names", () => {
    const dir = mkdtempSync(join(tmpdir(), "rel-trace-"));
    try {
      const spec = join(dir, "spec.md");
      writeFileSync(spec, "- **FR-001**: x\n- **FR-999**: nothing tests this\n");
      const r = trace({ TRACE_SPEC: spec });
      expect(r.code).toBe(1);
      expect(r.err).toContain("FR-999");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired into the project: the root scripts, the aggregate scripts and the guidance", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const name of ["test:release", "test:release-trace", "test:engine-assumptions", "release:check-publishable", "release:check-engine-range", "release:check-changes", "release:gate", "release:plan"]) expect(pkg.scripts[name], name).toBeTruthy();
    const guidance = readFileSync(join(root, "CLAUDE.md"), "utf8");
    for (const name of ["test:release", "test:release-trace", "test:engine-assumptions", "release:plan"]) expect(guidance, name).toContain(`pnpm ${name}`);
  });
});
