// The core's pixel look against what the design system's own HexMap paints (fixtures from scripts/extract-assets.mjs).
import { describe, expect, it } from "vitest";
import golden from "./fixtures/hexmap-golden.json";
import { paintScene, tilesFromRows, type Tile } from "../src/hex/core/index.js";

interface Case {
  name: string;
  input: { rows?: string[]; tiles?: Tile[] };
  expected: { w: number; h: number; colours: Record<string, string[]> };
}

describe("hex pixel look matches the design system's HexMap", () => {
  for (const c of golden.cases as unknown as Case[]) {
    it(c.name, () => {
      const rows = c.input.rows;
      const tiles = rows ? tilesFromRows(rows) : (c.input.tiles as Tile[]);
      const scene = paintScene(tiles, rows);
      expect(scene.width).toBe(c.expected.w);
      expect(scene.height).toBe(c.expected.h);
      const got: Record<string, string[]> = {};
      for (const [colour, cells] of scene.byColour) got[colour] = cells.map(([x, y]) => `${x},${y}`).sort();
      expect(Object.keys(got).sort()).toEqual(Object.keys(c.expected.colours).sort());
      for (const colour of Object.keys(c.expected.colours)) expect(got[colour], colour).toEqual(c.expected.colours[colour]);
    });
  }
});
