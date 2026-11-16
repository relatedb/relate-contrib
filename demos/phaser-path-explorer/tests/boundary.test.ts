// ADR-011, 2.1: the hex library's layers import only downward, and only the adapter imports Phaser.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const hex = resolve(here, "../src/hex");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

function imports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]!);
}

const layerOf = (p: string) => relative(hex, p).split("/")[0]!;
const allowed: Record<string, string[]> = { assets: [], core: ["assets"], phaser: ["assets", "core"] };

describe("hex library boundary", () => {
  for (const file of files(hex)) {
    const layer = layerOf(file);
    for (const spec of imports(file)) {
      it(`${relative(hex, file)} -> ${spec}`, () => {
        if (spec === "phaser") return expect(layer).toBe("phaser");
        if (!spec.startsWith(".")) return; // JSON-free external packages other than phaser: none expected
        const target = resolve(dirname(file), spec);
        const inside = relative(hex, target);
        expect(inside.startsWith(".."), "must not import from outside src/hex").toBe(false);
        const targetLayer = inside.split("/")[0]!;
        if (targetLayer !== layer) expect(allowed[layer], `${layer} may not import ${targetLayer}`).toContain(targetLayer);
      });
    }
  }
  it("game code uses each layer through its index", () => {
    const game = resolve(here, "../src/game");
    for (const file of files(game)) {
      for (const spec of imports(file)) {
        if (spec.includes("/hex/")) expect(spec, file).toMatch(/\/hex\/(assets|core|phaser)\/index\.js$/);
      }
    }
  });
});
