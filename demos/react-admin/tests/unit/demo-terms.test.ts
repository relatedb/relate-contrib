// covers-ra: FR-026
// The demo's terms: react-admin is pinned to an exact version and none of its paid add-on modules is used (ADR-008
// consequences), and the README says what a visitor loses by clearing site data and that a copied project renames the store.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const manifest = JSON.parse(read("../../package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
const readme = read("../../README.md");

describe("the demo's dependencies", () => {
  it("pins react-admin to an exact version, with no range operator", () => {
    expect(manifest.dependencies["react-admin"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("uses none of react-admin's paid add-on modules", () => {
    const all = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(all.filter((name) => /^@react-admin\/ra-|^ra-(?!core$|i18n-polyglot$|language-english$|ui-materialui$)/.test(name))).toEqual([]);
    // and nothing in the source imports one
    const source = [read("../../src/main.tsx"), read("../../src/App.tsx"), read("../../src/DemoLayout.tsx")].join("\n");
    expect(source).not.toMatch(/@react-admin\/ra-/);
  });
});

describe("the demo's README", () => {
  it("says what a visitor loses by clearing site data", () => {
    expect(readme).toMatch(/clear(ing)? (the )?site data/i);
    expect(readme).toMatch(/lose|lost|erase/i);
  });

  it("says that a project which copies the demo renames the store, and where", () => {
    expect(readme).toMatch(/renam/i);
    expect(readme).toContain("react-admin-demo");
    expect(readme).toContain("STORE_NAME");
  });

  it("says the export is offered by the reset control and not by a failure screen, that react-admin is pinned, and that the paid modules are not used", () => {
    expect(readme).toMatch(/reset control/i);
    expect(readme).toMatch(/failure screen/i);
    expect(readme).toMatch(/pinned/i);
    expect(readme).toMatch(/add-on modules/i);
  });
});
