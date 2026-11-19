// covers-rel: FR-012, SC-005
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../lib/workspace.js";

let root = "";
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

const manifest = (name: string, version: string, extra: Record<string, unknown> = {}) => JSON.stringify({ name, version, private: true, ...extra }, null, 2);

/** A scratch workspace: a core, a package with a declared dependency on it, a package with a peer window on it, and one unrelated. */
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "changesets-"));
  const put = (path: string, text: string) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  put("package.json", JSON.stringify({ name: "scratch", private: true }));
  put("pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
  put("packages/core/package.json", manifest("@x/core", "0.1.0"));
  put("packages/dep/package.json", manifest("@x/dep", "0.1.0", { dependencies: { "@x/core": "^0.1.0" } }));
  put("packages/peer/package.json", manifest("@x/peer", "0.1.0", { peerDependencies: { "@x/core": ">=0.1.0 <1.0.0" }, devDependencies: { "@x/core": "workspace:*" } }));
  put("packages/other/package.json", manifest("@x/other", "0.3.0"));
  mkdirSync(join(dir, ".changeset"));
  copyFileSync(join(repoRoot(), ".changeset/config.json"), join(dir, ".changeset/config.json"));
  const record = (file: string, bumps: Record<string, string>, text: string) =>
    put(`.changeset/${file}`, `---\n${Object.entries(bumps).map(([k, v]) => `"${k}": ${v}`).join("\n")}\n---\n\n${text}\n`);
  record("one.md", { "@x/core": "minor" }, "A new feature in the core.");
  record("two.md", { "@x/other": "patch" }, "A fix in the other package.");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "base"], { cwd: dir });
  return dir;
}

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, any>;

describe("versions and changelogs from recorded changes", () => {
  it("moves exactly the named packages and the dependents that need it, writes their changelogs, and leaves the rest", () => {
    root = scratch();
    const bin = join(repoRoot(), "node_modules/@changesets/cli/bin.js");
    execFileSync(process.execPath, [bin, "version"], { cwd: root, stdio: "pipe" });
    expect(read(join(root, "packages/core/package.json"))["version"]).toBe("0.2.0");
    expect(read(join(root, "packages/other/package.json"))["version"]).toBe("0.3.1");
    // a package with a declared dependency on a package that moved follows it, and its range is updated, and it is not taken to a new major
    const dep = read(join(root, "packages/dep/package.json"));
    expect(dep["version"]).toBe("0.1.1");
    expect(dep["dependencies"]["@x/core"]).toBe("^0.2.0");
    // a package that only peers on the core, within its window, is not released for a core minor
    const peer = read(join(root, "packages/peer/package.json"));
    expect(peer["version"]).toBe("0.1.0");
    expect(peer["peerDependencies"]["@x/core"]).toBe(">=0.1.0 <1.0.0");
    expect(readFileSync(join(root, "packages/core/CHANGELOG.md"), "utf8")).toContain("A new feature in the core.");
    expect(readFileSync(join(root, "packages/other/CHANGELOG.md"), "utf8")).toContain("A fix in the other package.");
    expect(existsSync(join(root, "packages/peer/CHANGELOG.md"))).toBe(false);
  });
});
