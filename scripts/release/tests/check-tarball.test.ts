import { describe, expect, it } from "vitest";
import { entryTargets, missingTargets } from "../check-tarball.js";

const manifest = {
  name: "x",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" }, "./worker": { default: "./dist/worker.js" }, "./package.json": "./package.json" },
};

describe("the tarball check", () => {
  it("names every entry point of a manifest once", () => {
    expect(entryTargets(manifest)).toEqual(["dist/index.d.ts", "dist/index.js", "dist/worker.js", "package.json"]);
  });
  it("finds a package whose build did not run", () => {
    expect(missingTargets(manifest, ["package/package.json", "package/README.md"])).toEqual(["dist/index.d.ts", "dist/index.js", "dist/worker.js"]);
  });
  it("accepts a built package", () => {
    const files = ["package/package.json", "package/dist/index.js", "package/dist/index.d.ts", "package/dist/worker.js"];
    expect(missingTargets(manifest, files)).toEqual([]);
  });
});
