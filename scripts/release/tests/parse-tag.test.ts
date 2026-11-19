// covers-rel: FR-015, FR-028
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseTag } from "../parse-tag.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";

let fx: Fixture | undefined;
afterEach(() => fx?.remove());
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { stdio: "ignore" });

describe("the version tag", () => {
  it("parses a tag to its package and version", () => {
    fx = makeFixture();
    expect(parseTag(fx.root, "@relate/contrib-web@0.1.0")).toEqual({ ok: true, package: "@relate/contrib-web", version: "0.1.0" });
  });

  it("refuses a tag that is not of the form <package name>@<version>", () => {
    fx = makeFixture();
    for (const bad of ["v0.1.0", "@relate/web@0.1.0", "@relate/contrib-web", "@relate/contrib-web@1", "release-1"]) {
      expect(parseTag(fx.root, bad).ok, bad).toBe(false);
    }
  });

  it("refuses a package that does not exist, and a version that differs from the manifest's", () => {
    fx = makeFixture();
    expect(parseTag(fx.root, "@relate/contrib-nothing@0.1.0")).toMatchObject({ ok: false });
    const r = parseTag(fx.root, "@relate/contrib-web@0.2.0");
    expect(r).toMatchObject({ ok: false });
    expect((r as { reason: string }).reason).toContain("0.1.0");
  });

  it("refuses a tagged commit that is not on the history of the protected branch", () => {
    fx = makeFixture();
    git(fx.root, "init", "-q", "-b", "main");
    git(fx.root, "add", "-A");
    git(fx.root, "commit", "-q", "-m", "one");
    git(fx.root, "tag", "@relate/contrib-web@0.1.0");
    expect(parseTag(fx.root, "@relate/contrib-web@0.1.0", { branch: "main" }).ok).toBe(true);
    git(fx.root, "checkout", "-q", "-b", "side");
    git(fx.root, "commit", "-q", "--allow-empty", "-m", "two");
    git(fx.root, "tag", "@relate/contrib-astro@0.1.0");
    expect(parseTag(fx.root, "@relate/contrib-astro@0.1.0", { branch: "main" })).toMatchObject({ ok: false });
  });
});
