// covers-rel: FR-014
import { describe, expect, it } from "vitest";
import { checksFor } from "../checks-for.js";
import { repoRoot } from "../lib/workspace.js";

describe("the checks a release runs for a package", () => {
  it("finds the unit, package and trace commands of each real package in its manifest", () => {
    const root = repoRoot();
    expect(checksFor(root, "@relate/contrib-web")).toEqual(["test:unit", "test:browsers", "test:conformance", "test:package", "test:trace"]);
    expect(checksFor(root, "@relate/contrib-phaser")).toEqual(["test:phaser", "test:phaser-package", "test:phaser-trace"]);
    expect(checksFor(root, "@relate/contrib-astro")).toEqual(["test:astro", "test:astro-browsers", "test:astro-conformance", "test:astro-package", "test:astro-trace"]);
    expect(checksFor(root, "@relate/contrib-nextjs")).toEqual(["test:next", "test:next-browsers", "test:next-conformance", "test:next-package", "test:next-trace"]);
    expect(checksFor(root, "@relate/contrib-react-admin")).toEqual(["test:react-admin", "test:react-admin-package", "test:react-admin-trace"]);
  });

  it("finds nothing for a package that does not exist", () => {
    expect(checksFor(repoRoot(), "@relate/contrib-nothing")).toEqual([]);
  });
});
