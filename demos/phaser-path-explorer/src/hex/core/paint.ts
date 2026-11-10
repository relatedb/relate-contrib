// The pixel look: one tile painted cell by cell, a port of the design system's `hexPaint`.
// Every random draw happens in the same order as the original, so the same seed gives the same tile.
// A cell is a palette colour name, "" (inside the hex, not yet painted) or null (outside the hex).
import { featuresAsset, latticeAsset } from "../assets/index.js";
import { rng } from "./rng.js";
import { TILE_H, TILE_W, hexSpan } from "./lattice.js";

export type Terrain = "deep" | "water" | "sand" | "grass" | "forest" | "hills" | "mountain" | "badlands";
export type Feature = "town" | "tent" | "tower";
export type Cell = string | null;
export type Grid = Cell[][];

const BM = featuresAsset.bitmaps as Record<string, string[]>;
const BC = featuresAsset.colours;

export interface Painter {
  grid: Grid;
  bitmap(rows: string[], ox: number, oy: number, map?: Record<string, string>): void;
}

export function paintTile(terrain: Terrain, seed: number): Painter {
  const R = rng(seed);
  const g: Grid = [];
  for (let y = 0; y < TILE_H; y++) {
    const w = hexSpan(y);
    const x0 = (TILE_W - w) / 2;
    const row: Cell[] = [];
    for (let x = 0; x < TILE_W; x++) row.push(x >= x0 && x < x0 + w ? "" : null);
    g.push(row);
  }
  const ok = (x: number, y: number) => y >= 0 && y < TILE_H && x >= 0 && x < TILE_W && g[y]![x] !== null;
  const set = (x: number, y: number, c: string) => {
    if (ok(x, y)) g[y]![x] = c;
  };
  const fill = (c: string) => {
    for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TILE_W; x++) if (g[y]![x] !== null) g[y]![x] = c;
  };
  const rnd = (n: number) => Math.floor(R() * n);
  const scatter = (n: number, c: string, len?: number) => {
    for (let i = 0; i < n; i++) {
      const sx = 2 + rnd(12);
      const sy = 2 + rnd(13);
      for (let k = 0; k < (len || 1); k++) set(sx + k, sy, c);
    }
  };
  const bitmap = (rows: string[], ox: number, oy: number, map?: Record<string, string>) => {
    rows.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const ch = r[i]!;
        if (ch !== ".") set(ox + i, oy + j, map ? map[ch]! : BC[ch]!);
      }
    });
  };

  if (terrain === "water") {
    fill("mid-baltic");
    scatter(3, "baltic", 3);
    scatter(3, "light-baltic", 1);
  } else if (terrain === "deep") {
    fill("dark-baltic");
    scatter(4, "mid-baltic", 3);
  } else if (terrain === "sand") {
    fill("cream");
    scatter(7, "light-hibiscus", 1);
    scatter(3, "light-gray", 1);
  } else if (terrain === "badlands") {
    fill("light-hibiscus");
    for (let i = 0; i < 3; i++) scatter(1, "mid-hibiscus", 5 + rnd(3));
    scatter(3, "hibiscus", 1);
    scatter(3, "cream", 1);
  } else if (terrain === "hills") {
    fill("light-forest");
    const hs = [[4, 8], [10, 5], [8, 11]] as const;
    hs.slice(0, 2 + rnd(2)).forEach((p) => {
      ([[0, 3], [1, 5], [2, 7]] as const).forEach((r) => {
        for (let i = 0; i < r[1]; i++) set(p[0] - ((r[1] - 1) >> 1) + i, p[1] + r[0], r[0] === 2 ? "forest" : "mid-forest");
      });
    });
  } else if (terrain === "forest") {
    fill("mid-forest");
    const ps = [[2, 3], [9, 3], [5, 8], [10, 9]] as const;
    ps.slice(0, 3 + rnd(2)).forEach((p) => {
      const ox = p[0] + rnd(2);
      const oy = p[1] + rnd(2);
      bitmap(BM["tree"]!, ox, oy);
    });
  } else if (terrain === "mountain") {
    fill("mid-forest");
    ([[8, 3, 5], [4, 8, 4], [12, 9, 4]] as const).slice(0, 2 + rnd(2)).forEach((p) => {
      for (let r = 0; r < p[2]; r++)
        for (let i = -r; i <= r; i++) set(p[0] + i, p[1] + r, r < 2 ? "light-gray" : i < 0 ? "cream" : "dark-gray");
      for (let j = -p[2] + 1; j < p[2]; j++) set(p[0] + j, p[1] + p[2], "forest");
    });
  } else {
    // grass
    fill("mid-forest");
    scatter(12, "light-forest", 1);
    for (let q = 0; q < 4; q++) {
      const tx = 2 + rnd(12);
      const ty = 2 + rnd(12);
      set(tx, ty, "forest");
      set(tx, ty + 1, "forest");
    }
  }
  return { grid: g, bitmap };
}

/** The tile's seed when none is given: a function of its position, so a map draws the same every time. */
export function positionSeed(col: number, row: number): number {
  const s = latticeAsset.seed;
  return col * s.col + row * s.row + s.add;
}

/** Stamp a feature (town, tent or tower) onto a painted tile, centred as the design system places it. */
export function stampFeature(p: Painter, feature: Feature): void {
  const bm = BM[feature]!;
  const fw = bm[0]!.length;
  const y = feature === "town" ? 4 : feature === "tent" ? 6 : 3;
  p.bitmap(bm, (TILE_W - fw) >> 1, y);
}
