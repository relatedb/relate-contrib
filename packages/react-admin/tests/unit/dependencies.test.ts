// covers-ra: FR-001, FR-031
// What the package imports and declares: types of react-admin and the core and nothing else from outside, no interface
// component, no hosting code, no repository or vendored path (ADR-008 2.1; contracts/provider-api.md "Peer and dependency rules").
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = fileURLToPath(new URL("../..", import.meta.url));
const src = join(pkg, "src");
const files = readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
const text = (f: string) => readFileSync(join(src, f), "utf8");
/** The code of a file without its comments, so that a word in documentation is not mistaken for code. */
const code = (f: string) => text(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every module specifier a file imports or re-exports, with whether the import is type-only. */
function imports(source: string): Array<{ from: string; typeOnly: boolean }> {
  const found: Array<{ from: string; typeOnly: boolean }> = [];
  for (const m of source.matchAll(/^\s*(import|export)\s+(type\s+)?(?:[^;'"]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
    found.push({ from: m[3]!, typeOnly: m[2] !== undefined });
  }
  for (const m of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) found.push({ from: m[1]!, typeOnly: false });
  for (const m of source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) found.push({ from: m[1]!, typeOnly: false });
  return found;
}

describe("what the package imports", () => {
  it("imports only its own modules and, as types, react-admin and the core", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const { from, typeOnly } of imports(text(f))) {
        if (from.startsWith("./")) continue;
        expect(["react-admin", "@relate/web"], `${f} imports ${from}`).toContain(from);
        expect(typeOnly, `${f}: ${from} must be a type-only import`).toBe(true);
      }
    }
  });

  it("imports nothing from the core but its public entry point, and nothing of the engine", () => {
    for (const f of files) {
      const source = text(f);
      expect(source, f).not.toMatch(/@relate\/web\//);
      expect(source, f).not.toMatch(/@relate\/relate-wasm|relate_bg|vendor\//);
    }
  });

  it("holds no interface component and no hosting code", () => {
    expect(files.filter((f) => /\.(tsx|jsx)$/.test(f))).toEqual([]);
    for (const f of files) {
      const source = code(f);
      expect(source, f).not.toMatch(/\bfrom\s+["']react["']|\bReact\./);
      expect(source, f).not.toMatch(/\bnew Worker\b|createClient|document\.|window\./);
    }
  });

  it("references no path outside the package", () => {
    for (const f of files) {
      for (const { from } of imports(text(f))) expect(from, f).not.toMatch(/\.\.\//);
      expect(text(f), f).not.toMatch(/\/Users\/|specs\/|design\//);
    }
  });
});

describe("what the package declares", () => {
  const manifest = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));

  it("has react-admin ^5 and @relate/web as peers and no runtime dependency", () => {
    expect(manifest.peerDependencies["react-admin"]).toMatch(/^\^5/);
    expect(manifest.peerDependencies["@relate/web"]).toBeDefined();
    expect(manifest.dependencies).toBeUndefined();
  });

  it("ships its build output only, with one entry point", () => {
    expect(manifest.files).toEqual(["dist"]);
    expect(Object.keys(manifest.exports)).toEqual(["."]);
  });

  it("exports no interface component from its entry point", () => {
    const entry = text("index.ts");
    expect(entry).not.toMatch(/\.tsx["']/);
    const names = [...entry.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap((m) => m[1]!.split(",").map((n) => n.trim()).filter(Boolean));
    expect(names).toEqual(expect.arrayContaining(["createDataProvider", "ensureSchema", "ProviderError"]));
    for (const n of names) expect(n, "a component is named in PascalCase and is a function; types and errors are listed explicitly").toMatch(/^(createDataProvider|ensureSchema|ProviderError|SchemaError|FieldSchema|FieldType|ReferenceSchema|ResourceSchema|Schema|ProviderClient|ProviderOptions)$/);
  });
});
