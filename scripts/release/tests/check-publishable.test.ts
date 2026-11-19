// covers-rel: FR-001, FR-002, FR-003, FR-004, FR-005, SC-001
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkPublishable } from "../check-publishable.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";
import { CORE, type Manifest } from "../lib/workspace.js";

let fx: Fixture | undefined;
afterEach(() => fx?.remove());
const ASTRO = "@relate/contrib-astro";
const rules = (r: ReturnType<typeof checkPublishable>, pkg: string) => r.findings.filter((f) => f.package === pkg).map((f) => f.rule);

describe("the fitness check", () => {
  it("passes a complete package and reports one that is still private as unreleased, not as a failure", () => {
    fx = makeFixture();
    const r = checkPublishable(fx.root);
    expect(r.findings).toEqual([]);
    expect(r.unreleased).toContain(ASTRO);
  });

  it("fails a private package when it is checked for a release", () => {
    fx = makeFixture();
    const r = checkPublishable(fx.root, { release: true, only: [ASTRO] });
    expect(rules(r, ASTRO)).toEqual(["private"]);
  });

  it("passes a package marked public when it is checked for a release", () => {
    fx = makeFixture({ [ASTRO]: { private: false } });
    expect(checkPublishable(fx.root, { release: true, only: [ASTRO] }).findings).toEqual([]);
  });

  it.each([
    ["license", { license: undefined }, "license"],
    ["a different license", { license: "MIT" }, "license"],
    ["repository", { repository: undefined }, "repository"],
    ["the repository's folder", { repository: { type: "git", url: "https://github.com/relatedb/relate-contrib" } }, "repository"],
    ["a wrong repository folder", { repository: { type: "git", url: "https://github.com/relatedb/relate-contrib", directory: "packages/other" } }, "repository"],
    ["homepage", { homepage: undefined }, "homepage"],
    ["keywords", { keywords: [] }, "keywords"],
    ["the public publish setting", { publishConfig: undefined }, "publishConfig"],
    ["files", { files: undefined }, "files"],
    ["a name that is not @relate/contrib-<project>", { name: "@relate/astro" }, "name"],
  ] as [string, Partial<Manifest>, string][])("fails, naming the package and the item, when %s is missing or wrong", (_label, over, rule) => {
    fx = makeFixture({ [ASTRO]: over });
    const r = checkPublishable(fx.root, { only: [over.name ?? ASTRO] });
    expect(rules(r, over.name ?? ASTRO)).toContain(rule);
    expect(r.findings.find((f) => f.rule === rule)!.detail.length).toBeGreaterThan(0);
  });

  it("fails a package whose files list more than the build output, the README and the license", () => {
    fx = makeFixture({ [ASTRO]: { files: ["dist", "src", "tests"] } });
    const r = checkPublishable(fx.root, { only: [ASTRO] });
    expect(rules(r, ASTRO)).toEqual(["files"]);
    expect(r.findings[0]!.detail).toContain("src, tests");
  });

  it("fails the core while it declares a development-only peer, and passes once it is removed", () => {
    fx = makeFixture({ [CORE]: { peerDependencies: { "@relate/relate-wasm": ">=0.16.1 <=0.16.1", "@playwright/test": "*" } } });
    expect(rules(checkPublishable(fx.root, { only: [CORE] }), CORE)).toEqual(["dev-only-peer"]);
    fx.remove();
    fx = makeFixture();
    expect(checkPublishable(fx.root, { only: [CORE] }).findings).toEqual([]);
  });

  it("fails when the LICENSE file is missing from the repository root or from a package's folder", () => {
    fx = makeFixture();
    rmSync(join(fx.root, "packages/astro/LICENSE"));
    expect(rules(checkPublishable(fx.root, { only: [ASTRO] }), ASTRO)).toEqual(["license-file"]);
    rmSync(join(fx.root, "LICENSE"));
    expect(checkPublishable(fx.root).findings.map((f) => f.package)).toContain("(repository)");
    writeFileSync(join(fx.root, "LICENSE"), "x");
  });

  it("names each missing item in turn for the same package, one finding per item", () => {
    fx = makeFixture({ [ASTRO]: { license: undefined, homepage: undefined, keywords: [] } });
    expect(rules(checkPublishable(fx.root, { only: [ASTRO] }), ASTRO).sort()).toEqual(["homepage", "keywords", "license"]);
  });
});
