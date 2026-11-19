// covers-rel: FR-012, FR-013
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkChanges } from "../check-changes.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";

let fx: Fixture | undefined;
afterEach(() => fx?.remove());
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
const ASTRO = "@relate/contrib-astro";

function repo(): Fixture {
  const f = makeFixture();
  mkdirSync(join(f.root, ".changeset"), { recursive: true });
  writeFileSync(join(f.root, ".changeset/README.md"), "x");
  writeFileSync(join(f.root, ".changeset/allow-1.0.json"), '{"packages": []}');
  git(f.root, "init", "-q", "-b", "main");
  git(f.root, "add", "-A");
  git(f.root, "commit", "-q", "-m", "base");
  return f;
}
const record = (root: string, name: string, bumps: Record<string, string>) =>
  writeFileSync(join(root, ".changeset", name), `---\n${Object.entries(bumps).map(([k, v]) => `"${k}": ${v}`).join("\n")}\n---\n\nA change.\n`);

describe("recorded changes", () => {
  it("warns when a package's source changed and no recorded change names it, and is satisfied once one does", () => {
    fx = repo();
    const base = git(fx.root, "rev-parse", "HEAD").trim();
    mkdirSync(join(fx.root, "packages/astro/src"), { recursive: true });
    writeFileSync(join(fx.root, "packages/astro/src/index.ts"), "export {};");
    git(fx.root, "add", "-A");
    git(fx.root, "commit", "-q", "-m", "change");
    const r = checkChanges(fx.root, { base });
    expect(r.findings).toEqual([]);
    expect(r.warnings.map((w) => w.package)).toEqual([ASTRO]);
    record(fx.root, "a-change.md", { [ASTRO]: "patch" });
    git(fx.root, "add", "-A");
    git(fx.root, "commit", "-q", "-m", "record");
    expect(checkChanges(fx.root, { base }).warnings).toEqual([]);
  });

  it("fails a recorded change that names a package that does not exist", () => {
    fx = repo();
    record(fx.root, "bad.md", { "@relate/contrib-nothing": "patch" });
    const r = checkChanges(fx.root);
    expect(r.findings).toEqual([expect.objectContaining({ package: "@relate/contrib-nothing", rule: "unknown-package" })]);
  });

  it("fails a recorded major change that would take a package before 1.0 to 1.0.0, unless the maintainers listed the package", () => {
    fx = repo();
    record(fx.root, "big.md", { [ASTRO]: "major" });
    expect(checkChanges(fx.root).findings.map((f) => f.rule)).toEqual(["reaches-1.0"]);
    writeFileSync(join(fx.root, ".changeset/allow-1.0.json"), JSON.stringify({ packages: [ASTRO] }));
    expect(checkChanges(fx.root).findings).toEqual([]);
  });

  it("fails a package that is at 1.0.0 or above without being listed", () => {
    fx = repo();
    fx.write("packages/astro", { ...JSON.parse(JSON.stringify({ name: ASTRO, version: "1.0.0", license: "Apache-2.0" })) });
    expect(checkChanges(fx.root).findings.map((f) => f.rule)).toEqual(["reaches-1.0"]);
  });

  it("passes with no recorded changes and no base to compare with", () => {
    fx = repo();
    expect(checkChanges(fx.root)).toEqual({ findings: [], warnings: [] });
  });
});
