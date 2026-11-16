// The flat and facet looks and the sprites against what the design system's own HexField and Sprite paint.
import { describe, expect, it } from "vitest";
import fieldGolden from "./fixtures/hexfield-golden.json";
import spriteGolden from "./fixtures/sprite-golden.json";
import { facetTile, positionSeed, spriteCells, tilesFromRows, type Tile } from "../src/hex/core/index.js";

interface FieldCase {
  name: string;
  input: { rows?: string[]; tiles?: Tile[]; look: "flat" | "facet" };
  expected: { col: number; row: number; terrain: string; polys: { fill: string; points: string }[] }[];
}

describe("flat and facet looks match the design system's HexField", () => {
  for (const c of fieldGolden.cases as unknown as FieldCase[]) {
    it(c.name, () => {
      const tiles = c.input.rows ? tilesFromRows(c.input.rows) : (c.input.tiles as Tile[]);
      expect(tiles).toHaveLength(c.expected.length);
      tiles.forEach((t, i) => {
        const want = c.expected[i]!;
        expect([t.col, t.row, t.terrain]).toEqual([want.col, want.row, want.terrain]);
        const f = facetTile(t.terrain, t.seed ?? positionSeed(t.col, t.row), c.input.look === "flat" ? undefined : t.feature);
        // the bundle lists the base hexagon first, then (facet only) each polygon
        expect(f.base, `${t.col},${t.row} base`).toBe(want.polys[0]!.fill);
        if (c.input.look === "facet") {
          expect(f.polys.map((p) => [p.colour, p.points.join(" ")]), `${t.col},${t.row}`).toEqual(
            want.polys.slice(1).map((p) => [p.fill, p.points]),
          );
        } else {
          expect(want.polys).toHaveLength(1);
        }
      });
    });
  }
});

describe("sprites match the design system's Sprite", () => {
  for (const c of spriteGolden.cases as unknown as { kind: string; outline?: string; expected: Record<string, string[]> }[]) {
    it(`${c.kind}${c.outline ? ` on ${c.outline}` : ""}`, () => {
      const got: Record<string, string[]> = {};
      for (const [colour, cells] of spriteCells(c.kind, c.outline)) got[colour] = cells.map(([x, y]) => `${x},${y}`).sort();
      expect(got).toEqual(c.expected);
    });
  }
});
