// covers-rel: FR-014
import { describe, expect, it } from "vitest";
import { checksFor, phaseOf } from "../checks-for.js";
import { repoRoot } from "../lib/workspace.js";

describe("the checks a release runs for a package", () => {
  it("finds the unit, package and trace commands of each real package in its manifest", () => {
    const root = repoRoot();
    expect(checksFor(root, "@relate/contrib-web")).toEqual(["test:unit", "test:browsers", "test:conformance", "test:package", "test:trace"]);
    expect(checksFor(root, "@relate/contrib-phaser")).toEqual(["test:phaser", "root:test:phaser-browsers", "test:phaser-package", "test:phaser-trace"]);
    expect(checksFor(root, "@relate/contrib-astro")).toEqual(["test:astro", "test:astro-browsers", "test:astro-conformance", "test:astro-package", "test:astro-trace"]);
    expect(checksFor(root, "@relate/contrib-nextjs")).toEqual(["test:next", "test:next-browsers", "test:next-conformance", "test:next-package", "test:next-trace"]);
    expect(checksFor(root, "@relate/contrib-react-admin")).toEqual(["test:react-admin", "root:test:react-admin-browsers", "test:react-admin-package", "test:react-admin-trace"]);
  });

  it("finds nothing for a package that does not exist", () => {
    expect(checksFor(repoRoot(), "@relate/contrib-nothing")).toEqual([]);
  });

  it("sorts the scripts into the base, browser and trace phases", () => {
    expect(["test:unit", "test:astro", "test:next-package", "test:package"].map(phaseOf)).toEqual(["base", "base", "base", "base"]);
    expect(["test:browsers", "test:conformance", "test:astro-browsers", "test:next-conformance", "root:test:phaser-browsers"].map(phaseOf)).toEqual(Array(5).fill("browsers"));
    expect(["test:trace", "test:phaser-trace"].map(phaseOf)).toEqual(["trace", "trace"]);
  });
});
