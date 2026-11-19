// covers-rel: FR-019, FR-012, SC-006
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { raiseEngineRange } from "../raise-engine-range.js";
import { CORE } from "../lib/workspace.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";

let fx: Fixture | undefined;
afterEach(() => fx?.remove());
const ASTRO = "@relate/contrib-astro";
const KNOWN = ["0.16.1", "0.17.0", "0.17.1", "0.18.0-rc.1"];
const range = (root: string, folder: string) => JSON.parse(readFileSync(join(root, folder, "package.json"), "utf8")).peerDependencies["@relate/relate-wasm"];
const changes = (root: string) => (readdirSync(join(root, ".changeset"), { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name));

describe("raising the newest supported engine", () => {
  it("raises NEWEST in each named package that declares a range and writes a recorded change for each", () => {
    fx = makeFixture();
    const r = raiseEngineRange(fx.root, "0.17.0", [CORE, ASTRO], KNOWN);
    expect(r).toEqual({ raised: [CORE, ASTRO], leftAlone: [], skipped: [] });
    expect(range(fx.root, "packages/web")).toBe(">=0.16.1 <=0.17.0");
    expect(range(fx.root, "packages/astro")).toBe(">=0.16.1 <=0.17.0");
    const files = changes(fx.root);
    expect(files).toHaveLength(2);
    const text = readFileSync(join(fx.root, ".changeset", files.find((f) => f.includes("astro"))!), "utf8");
    expect(text).toContain(`"${ASTRO}": patch`);
    expect(text).toContain("Supports engine 0.17.0.");
  });

  it("leaves a package that failed alone: it is not named, so it has no change and its range stays", () => {
    fx = makeFixture();
    raiseEngineRange(fx.root, "0.17.0", [CORE], KNOWN);
    expect(range(fx.root, "packages/nextjs")).toBe(">=0.16.1 <=0.16.1");
    expect(changes(fx.root)).toHaveLength(1);
  });

  it("reports a package already at or above the version, and one that reaches the engine only through the core", () => {
    fx = makeFixture();
    raiseEngineRange(fx.root, "0.17.0", [ASTRO], KNOWN);
    const r = raiseEngineRange(fx.root, "0.17.0", [ASTRO, "@relate/contrib-phaser"], KNOWN);
    expect(r).toEqual({ raised: [], leftAlone: [ASTRO], skipped: ["@relate/contrib-phaser"] });
  });

  it("refuses a prerelease, a version below NEWEST and a version that is not an engine release", () => {
    fx = makeFixture();
    expect(() => raiseEngineRange(fx!.root, "0.18.0-rc.1", [ASTRO], KNOWN)).toThrow(/prerelease/);
    expect(() => raiseEngineRange(fx!.root, "0.16.0", [ASTRO], ["0.16.0"])).toThrow(/below/);
    expect(() => raiseEngineRange(fx!.root, "0.19.0", [ASTRO], KNOWN)).toThrow(/not a release of the engine/);
  });

  it("raises a package to the version a second time without writing a second change when it is already there", () => {
    fx = makeFixture();
    raiseEngineRange(fx.root, "0.17.0", [ASTRO], KNOWN);
    raiseEngineRange(fx.root, "0.17.0", [ASTRO], KNOWN);
    expect(changes(fx.root)).toHaveLength(1);
  });
});
