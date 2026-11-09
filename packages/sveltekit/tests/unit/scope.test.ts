// covers: FR-033, FR-003, FR-002
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));
const repo = join(pkg, "../..");
/** The commit of the plan: where this feature started. */
const BASE = "1994c3c";
/** The last commit of the work on main before later features changed the core (application graphs, ADR-009). */
const END = "7740205";

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
const sources = (): string[] => walk(join(pkg, "src"));

describe("what this feature leaves alone (FR-033)", () => {
  it("changes nothing in the core's or the other adapters' sources since the plan", () => {
    const changed = execFileSync("git", ["diff", "--name-only", `${BASE}..${END}`, "--", "packages/web/src", "packages/astro/src", "packages/nextjs/src", "packages/observable/src"], { cwd: repo, encoding: "utf8" });
    expect(changed.trim()).toBe("");
  });
});

describe("what the package imports", () => {
  it("never imports the engine's binary and needs no Vite plugin (FR-003)", () => {
    for (const file of sources().filter((f) => /\.(js|ts|svelte)$/.test(f))) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/(from\s+|import\s*\(\s*)["'][^"']*relate_bg/);
      expect(text, file).not.toMatch(/\?url["']/);
      expect(text, file).not.toMatch(/from\s+["']vite["']/);
    }
  });

  it("keeps SvelteKit's virtual modules and Svelte files out of the server entry (FR-002)", () => {
    const server = sources().filter((f) => f.includes(`${join(pkg, "src", "server")}`) && f.endsWith(".ts"));
    for (const file of server) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["'](\$app|\$env|\$lib|\$service-worker)/);
      expect(text, file).not.toMatch(/\.svelte["']/);
    }
  });

  it("ships rune modules as .svelte.js, never .svelte.ts (research D-1)", () => {
    expect(sources().filter((f) => f.endsWith(".svelte.ts"))).toEqual([]);
  });
});
