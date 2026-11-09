// covers: FR-002, FR-028
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));
const repo = join(pkg, "../..");
/** The commit of the plan: where this feature started. */
const BASE = "5ad5466";
/** The last commit of the work on main before later features changed the core (application graphs, ADR-009). */
const END = "7740205";

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
const sources = (sub: string): string[] => walk(join(pkg, "src", sub)).filter((f) => f.endsWith(".ts"));

describe("what this feature leaves alone (FR-028)", () => {
  it("changes nothing in the core's or the other adapters' sources since the plan", () => {
    const changed = execFileSync("git", ["diff", "--name-only", `${BASE}..${END}`, "--", "packages/web/src", "packages/astro/src", "packages/nextjs/src"], { cwd: repo, encoding: "utf8" });
    expect(changed.trim()).toBe("");
  });
});

describe("what the entries import", () => {
  it("keeps Node modules and esbuild out of the browser entry and the results entry", () => {
    const browser = [join(pkg, "src/index.ts"), join(pkg, "src/open.ts"), join(pkg, "src/attachments.ts"), ...sources("results")].filter(existsSync);
    expect(browser.length).toBeGreaterThan(0);
    for (const file of browser) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["'](node:|esbuild)/);
    }
  });

  it("never imports the engine's binary (FR-002)", () => {
    for (const file of [...sources(""), ...sources("loader"), ...sources("results")]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/(from\s+|import\s*\(\s*)["'][^"']*relate_bg/);
      expect(text, file).not.toMatch(/\?url["']/);
    }
  });
});
