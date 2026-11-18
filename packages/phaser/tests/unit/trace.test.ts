// covers-ph: FR-017, SC-007
// The trace check itself: it reports an id with no tagged test, and on the real specification every id is tagged. The
// package's own commands (unit, package, trace) are the scripts in package.json and the root, named in CLAUDE.md.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const repo = resolve(pkg, "../..");
const check = (env: Record<string, string>) => {
  try {
    execFileSync("pnpm", ["exec", "tsx", "tests/trace/check-trace.ts", "--static"], { cwd: pkg, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
    return { code: 0, err: "" };
  } catch (e) {
    const x = e as { status: number; stderr: string };
    return { code: x.status, err: x.stderr };
  }
};

describe("the trace check", () => {
  it("passes on the real specification, where every requirement and success criterion is tagged", () => {
    expect(check({})).toEqual({ code: 0, err: "" });
  });

  it("reports an id that no test names", () => {
    const dir = mkdtempSync(join(tmpdir(), "phaser-trace-"));
    try {
      const spec = join(dir, "spec.md");
      writeFileSync(spec, "- **FR-001**: x\n- **FR-999**: nothing tests this\n");
      const result = check({ TRACE_SPEC: spec });
      expect(result.code).toBe(1);
      expect(result.err).toContain("FR-999");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is wired into the project: the package script, the root script, and the guidance", () => {
    const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
    expect(manifest.scripts["test:phaser-trace"]).toContain("check-trace");
    const root = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
    for (const name of ["test:phaser", "test:phaser-browsers", "test:phaser-package", "test:phaser-trace"]) expect(root.scripts[name], name).toBeTruthy();
    expect(root.scripts["test:traces-all"]).toContain("test:phaser-trace");
    const guidance = readFileSync(join(repo, "CLAUDE.md"), "utf8");
    for (const name of ["test:phaser", "test:phaser-browsers", "test:phaser-package", "test:phaser-trace"]) expect(guidance, name).toContain(`pnpm ${name}`);
  });
});
