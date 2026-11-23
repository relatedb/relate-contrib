// covers-rel: FR-028, FR-029, FR-025
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPackages, repoRoot } from "../lib/workspace.js";

const root = repoRoot();
const doc = readFileSync(join(root, "docs/releasing.md"), "utf8");
const git = (...args: string[]): string | undefined => {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
};

describe("the written first-release procedure and the tag rule", () => {
  it("gives the first release of a package as steps for an administrator of the scope, ending with the trusted publisher", () => {
    expect(doc).toMatch(/first release of a new package, by hand/i);
    for (const step of ["remove `\"private\": true`", "pnpm --filter <name> pack", "npm publish <tarball> --access public", "trusted publisher", "release.yml", "npm-publish"]) expect(doc).toContain(step);
    expect(doc).toContain("refuses any package that is not yet on the registry");
  });

  it("documents the version tag rule, the branch protection rule and every setting that is not a file", () => {
    expect(doc).toContain("`<package name>@<version>`");
    expect(doc).toContain("A tag ruleset on the pattern `@relate/contrib-*@*`");
    expect(doc).toContain("Branch protection on `main`");
    for (const setting of ["PUBLISHING_ENABLED", "npm-publish", "engine-release-approval"]) expect(doc).toContain(setting);
  });

  it("says that a passing engine release waits for approval and does not start a release", () => {
    expect(doc).toContain("waits at the **engine-release-approval** environment");
    expect(doc).toContain("Merging it and tagging the packages is an ordinary release");
  });
});

describe("the feature changes no package's interface", () => {
  it("leaves every package's source and entry points as they are on the main branch", () => {
    const base = git("merge-base", "HEAD", "main")?.trim();
    if (!base) return; // no main branch to compare with (a shallow checkout): nothing to say
    const changedSources = (git("diff", "--name-only", `${base}...HEAD`, "--", "packages/*/src") ?? "").split("\n").filter(Boolean);
    expect(changedSources, "packages' source files changed").toEqual([]);
    for (const p of loadPackages(root)) {
      const before = git("show", `${base}:${p.folder}/package.json`);
      if (!before) continue;
      const old = JSON.parse(before) as Record<string, unknown>;
      for (const key of ["main", "module", "types", "exports", "bin", "type"]) expect(p.manifest[key] ?? null, `${p.name}: ${key}`).toEqual(old[key] ?? null);
    }
  });

  it("does not publish the engine: nothing here names a package other than the seven as a release target", () => {
    expect(existsSync(join(root, "scripts/release/publish-engine.ts"))).toBe(false);
    expect(loadPackages(root).map((p) => p.name).every((n) => n.startsWith("@relate/contrib-"))).toBe(true);
  });
});
