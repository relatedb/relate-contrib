// covers: FR-002, FR-028
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));

const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
const sources = (sub: string): string[] => walk(join(pkg, "src", sub)).filter((f) => f.endsWith(".ts"));

describe("what this feature leaves alone (FR-028)", () => {
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
