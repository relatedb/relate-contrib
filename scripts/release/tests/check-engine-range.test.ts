// covers-rel: FR-006, FR-007, FR-008, SC-002
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkEngineRange } from "../check-engine-range.js";
import { CORE } from "../lib/workspace.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";

let fx: Fixture | undefined;
afterEach(() => fx?.remove());
const ASTRO = "@relate/contrib-astro";
const by = (findings: ReturnType<typeof checkEngineRange>, pkg: string) => findings.filter((f) => f.package === pkg);

describe("the engine range check", () => {
  it("passes a consistent workspace", () => {
    fx = makeFixture();
    expect(checkEngineRange(fx.root)).toEqual([]);
  });

  it("fails a range that omits the supported engine, naming the package, its range and the engine version", () => {
    fx = makeFixture({ [ASTRO]: { peerDependencies: { "@relate/relate-wasm": ">=0.15.0 <=0.16.0", [CORE]: ">=0.0.0 <1.0.0" } } });
    const f = by(checkEngineRange(fx.root), ASTRO);
    expect(f).toHaveLength(1);
    expect(f[0]!.detail).toContain(">=0.15.0 <=0.16.0");
    expect(f[0]!.detail).toContain("0.16.1");
  });

  it('fails a peer on the engine at "any version"', () => {
    fx = makeFixture({ [ASTRO]: { peerDependencies: { "@relate/relate-wasm": "*", [CORE]: ">=0.0.0 <1.0.0" } } });
    expect(by(checkEngineRange(fx.root), ASTRO)[0]!.detail).toContain("any version");
  });

  it("fails a range that is not of the form >=OLDEST <=NEWEST, and says what form is expected", () => {
    for (const bad of ["^0.16.1", ">=0.16.1", ">=0.16.1 <0.17.0", ">=0.17.0 <=0.16.1", ">=0.16.1-rc.1 <=0.16.1"]) {
      fx = makeFixture({ [ASTRO]: { peerDependencies: { "@relate/relate-wasm": bad, [CORE]: ">=0.0.0 <1.0.0" } } });
      const f = by(checkEngineRange(fx.root), ASTRO);
      expect(f.length, bad).toBe(1);
      expect(f[0]!.rule).toBe("engine-range");
      fx.remove();
    }
  });

  it("fails an engine peer declared by a package that reaches the engine only through the core", () => {
    fx = makeFixture({ "@relate/contrib-phaser": { peerDependencies: { "@relate/relate-wasm": ">=0.16.1 <=0.16.1", [CORE]: ">=0.0.0 <1.0.0" } } });
    const f = by(checkEngineRange(fx.root), "@relate/contrib-phaser");
    expect(f.map((x) => x.rule)).toEqual(["engine-peer"]);
  });

  it("fails a dependent whose peer on the core is not a window below 1.0.0", () => {
    fx = makeFixture({ [ASTRO]: { peerDependencies: { "@relate/relate-wasm": ">=0.16.1 <=0.16.1", [CORE]: "*" } } });
    expect(by(checkEngineRange(fx.root), ASTRO).map((x) => x.rule)).toEqual(["core-window"]);
  });

  it("fails when the catalog has no supported engine, or names one that differs from the vendored engine", () => {
    fx = makeFixture();
    writeFileSync(join(fx.root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\n');
    expect(checkEngineRange(fx.root).map((x) => x.rule)).toContain("supported-engine");
    writeFileSync(join(fx.root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\ncatalog:\n  \"@relate/relate-wasm\": 0.16.1\n');
    mkdirSync(join(fx.root, "vendor/relate-wasm/pkg"), { recursive: true });
    writeFileSync(join(fx.root, "vendor/relate-wasm/pkg/package.json"), JSON.stringify({ name: "@relate/relate-wasm", version: "0.17.0" }));
    const f = checkEngineRange(fx.root);
    expect(f.find((x) => x.rule === "supported-engine")!.detail).toContain("0.17.0");
  });

  it("follows the supported engine: changing it in the catalog reports the packages whose range excludes it", () => {
    fx = makeFixture();
    writeFileSync(join(fx.root, "pnpm-workspace.yaml"), 'packages:\n  - "packages/*"\ncatalog:\n  \"@relate/relate-wasm\": 0.17.0\n');
    const names = checkEngineRange(fx.root).map((x) => x.package).sort();
    expect(names).toEqual([CORE, "@relate/contrib-astro", "@relate/contrib-nextjs", "@relate/contrib-observable", "@relate/contrib-sveltekit"].sort());
  });
});
