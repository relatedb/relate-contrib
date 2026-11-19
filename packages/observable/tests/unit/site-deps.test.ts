// covers: FR-024
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const site = join(fileURLToPath(new URL("../..", import.meta.url)), "conformance-site");
const packages = join(site, "../..");

describe("the conformance site's packages (research V-6)", () => {
  const manifest = JSON.parse(readFileSync(join(site, "package.json"), "utf8"));

  it("declares the adapter and the core as injected workspace dependencies", () => {
    for (const name of ["@relate/contrib-observable", "@relate/contrib-web"]) {
      expect(manifest.dependencies[name]).toBe("workspace:*");
      expect(manifest.dependenciesMeta[name]).toEqual({ injected: true });
    }
  });

  it("has them installed as copies, not as links to a plain directory under packages/", () => {
    for (const name of ["contrib-observable", "contrib-web"]) {
      const installed = join(site, "node_modules/@relate", name);
      const real = realpathSync(installed);
      expect(real.startsWith(join(packages, "packages") + sep), `${installed} resolves to ${real}`).toBe(false);
      expect(real).toContain(`${sep}node_modules${sep}`); // inside a node_modules folder, where Framework's bundler resolves it
      expect(lstatSync(join(real, "package.json")).isFile()).toBe(true);
    }
  });

  it("refreshes the copies before every build", () => {
    expect(manifest.scripts.build).toContain("scripts/refresh-deps.mjs");
  });
});
