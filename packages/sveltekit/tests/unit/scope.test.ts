// covers: FR-033, FR-003, FR-002
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
const sources = (): string[] => walk(join(pkg, "src"));

describe("what this feature leaves alone (FR-033)", () => {
  // The package touches the core and the other adapters only through the core's published entry points, so a core
  // change shows up as a type error or a conformance failure (`pnpm test:drift`), not as a silent dependency on internals.
  it("imports the core only through its exported entry points and nothing from another adapter", () => {
    const exported = new Set([".", "/validate", "/build", "/worker", "/conformance"]);
    for (const file of walk(join(pkg, "src")).filter((f) => /\.(js|ts|svelte)$/.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = (m[1] ?? m[2])!;
        expect(spec, file).not.toMatch(/packages\/|@relate\/(astro|nextjs|observable|sveltekit)\b/);
        const core = /^@relate\/web(\/.*)?$/.exec(spec);
        if (core) expect(exported.has(core[1] ?? "."), `${file}: ${spec}`).toBe(true);
      }
    }
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
