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
      expect(text, file).not.toMatch(/relate-wasm|\.wasm|\bwindow\b|\bdocument\./);
      for (const m of text.matchAll(/from "([^"]+)"/g)) expect(m[1], file).not.toBe("@relate/web"); // only its build and validate subpaths
      expect(text, file).not.toMatch(/\.\.\/client\//);
    }
  });
});

describe("the core", () => {
  // The feature's first commit on main (`12897d8`, the accepted ADR-005) and its last (`3acc4f6`): between them the core
  // gained the build subpath and its export, and nothing else (paths as they were then: the core lived in `packages/core`).
  it("gained only the build subpath and its export while the feature was built", () => {
    let names: string[];
    let manifest: string;
    try {
      const cwd = here("../../../..");
      names = execFileSync("git", ["diff", "--name-status", "12897d8", "3acc4f6", "--", "packages/core/src", "packages/core/conformance", "packages/core/package.json"], { cwd, encoding: "utf8" }).split("\n").filter(Boolean);
      manifest = execFileSync("git", ["diff", "-U0", "12897d8", "3acc4f6", "--", "packages/core/package.json"], { cwd, encoding: "utf8" });
    } catch {
      return; // not a checkout that has that history
    }
    expect(names.length).toBeGreaterThan(0);
    for (const line of names) {
      const [status, file] = line.split("\t");
      const allowed = status === "A" && file!.startsWith("packages/core/src/build/");
      expect(allowed || file === "packages/core/package.json", line).toBe(true);
    }
    const added = manifest.split("\n").filter((l) => /^\+(?!\+\+)/.test(l));
    expect(added.join("\n")).toMatch(/\.\/build/);
    expect(manifest.split("\n").filter((l) => /^-(?!--)/.test(l))).toEqual([]);
  });
});
