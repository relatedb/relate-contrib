// covers: FR-003, FR-028, FR-031
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

describe("the server entry", () => {
  it("needs no browser and imports neither the engine's binary nor the core's browser client", () => {
    const dir = here("../../src/server/");
    const sources = readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(sources.length).toBeGreaterThan(3);
    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/cypherlite|\.wasm|\bwindow\b|\bdocument\./);
      for (const m of text.matchAll(/from "([^"]+)"/g)) expect(m[1], file).not.toBe("related-web-core"); // only its build and validate subpaths
      expect(text, file).not.toMatch(/\.\.\/client\//);
    }
  });
});

describe("the core", () => {
  it("changes only by the build subpath and its export", () => {
    let changed: string[];
    try {
      changed = execFileSync("git", ["diff", "--name-only", "main", "--", "packages/core/src", "packages/core/conformance", "packages/core/package.json"], { cwd: here("../../../.."), encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      return; // not a git checkout, or no `main` to compare with
    }
    // when this feature has been merged, main already holds the subpath and the difference is empty
    expect(changed.filter((f) => !f.startsWith("packages/core/src/build/") && f !== "packages/core/package.json"), "files changed outside the build subpath").toEqual([]);
  });
});
