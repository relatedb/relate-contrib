// A scene is a set of tiles painted into one grid of cells, then turned into RGBA pixels.
import { latticeAsset, paletteAsset } from "../assets/index.js";
import { ODD_SHIFT, ROW_STEP, TILE_H, TILE_W, tileOrigin } from "./lattice.js";
import { paintTile, positionSeed, stampFeature, type Feature, type Terrain } from "./paint.js";

export interface Tile {
  col: number;
  row: number;
  terrain: Terrain;
  feature?: Feature | undefined;
  seed?: number | undefined;
}

export interface PaintedScene {
  width: number;
  height: number;
  /** Palette colour name for every painted cell, keyed "x,y". Cells outside every hex are absent. */
  cells: Map<string, string>;
  /** The same cells grouped by colour name, in raster order (the design system's own grouping). */
  byColour: Map<string, [number, number][]>;
}

/** Tiles from rows of legend characters: `D w s g f h m b` terrain, `T t R U` features on grass or hills. */
export function tilesFromRows(rows: string[]): Tile[] {
  const tiles: Tile[] = [];
  rows.forEach((r, row) => {
    for (let col = 0; col < r.length; col++) {
      const ch = r[col]!;
      if (ch === " " || ch === ".") continue;
      const tile: Tile = { col, row, terrain: (latticeAsset.terrainLegend[ch] ?? "grass") as Terrain };
      const feature = latticeAsset.featureLegend[ch];
      if (feature) tile.feature = feature as Feature;
      tiles.push(tile);
    }
  });
  return tiles;
}

/** Size in cells: the larger of the rows' extent and every tile's extent, as the design system measures it. */
export function sceneSize(tiles: Tile[], rows?: string[]): { width: number; height: number } {
  let W = 0;
  let H = 0;
  if (rows) {
    const n = rows.length;
    const m = rows.reduce((a, r) => Math.max(a, r.length), 0);
    W = m * TILE_W + (n > 1 ? ODD_SHIFT : 0);
    H = (n - 1) * ROW_STEP + TILE_H;
  }
  for (const t of tiles) {
    W = Math.max(W, t.col * TILE_W + (t.row & 1 ? ODD_SHIFT : 0) + TILE_W);
    H = Math.max(H, t.row * ROW_STEP + TILE_H);
  }
  return { width: W, height: H };
}

export function paintScene(tiles: Tile[], rows?: string[]): PaintedScene {
  const { width, height } = sceneSize(tiles, rows);
  const cells = new Map<string, string>();
  for (const t of tiles) {
    const [ox, oy] = tileOrigin(t.col, t.row);
    const painter = paintTile(t.terrain, t.seed ?? positionSeed(t.col, t.row));
    if (t.feature) stampFeature(painter, t.feature);
    painter.grid.forEach((row, y) => {
      row.forEach((c, x) => {
        if (c) cells.set(`${ox + x},${oy + y}`, c);
      });
    });
  }
  const byColour = new Map<string, [number, number][]>();
  for (const [key, colour] of cells) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const list = byColour.get(colour) ?? [];
    list.push([x, y]);
    byColour.set(colour, list);
  }
  return { width, height, cells, byColour };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** RGBA pixels, one per cell, with transparent cells outside every hex. */
export function toRgba(scene: PaintedScene): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const data = new Uint8ClampedArray(new ArrayBuffer(scene.width * scene.height * 4));
  for (const [key, colour] of scene.cells) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const hex = paletteAsset.colours[colour];
    if (!hex) throw new Error(`no palette colour "${colour}"`);
    const [r, g, b] = hexToRgb(hex);
    const i = (y * scene.width + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width: scene.width, height: scene.height, data };
}
