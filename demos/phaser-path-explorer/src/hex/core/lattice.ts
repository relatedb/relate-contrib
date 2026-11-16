// The hex lattice shared by every look: a tile is 16 cells wide and 17 tall, rows step down 14 cells and odd rows
// shift right 8, so neighbours interlock with no gaps (the design system's HexMap geometry).
import { latticeAsset } from "../assets/index.js";

export const TILE_W = latticeAsset.tileWidth;
export const TILE_H = latticeAsset.tileHeight;
export const ROW_STEP = latticeAsset.rowStep;
export const ODD_SHIFT = latticeAsset.oddRowShift;

/** Top-left cell of a tile in scene cells. */
export function tileOrigin(col: number, row: number): [number, number] {
  return [col * TILE_W + (row & 1 ? ODD_SHIFT : 0), row * ROW_STEP];
}

/** Centre of a tile in scene cells. */
export function tileCentre(col: number, row: number): [number, number] {
  return [col * TILE_W + (row & 1 ? ODD_SHIFT : 0) + 8, row * ROW_STEP + 8.5];
}

/** Width of a tile's painted span on row r (0..16): a hexagon with pointed top and bottom. */
export function hexSpan(r: number): number {
  return r < 3 ? 4 + 4 * r : r < 14 ? 16 : 4 + 4 * (16 - r);
}

/** The scene's size in cells for a map of `cols` by `rows` tiles. */
export function sceneCells(cols: number, rows: number): { width: number; height: number } {
  return { width: cols * TILE_W + (rows > 1 ? ODD_SHIFT : 0), height: (rows - 1) * ROW_STEP + TILE_H };
}

/**
 * The six neighbours of a tile, in the lattice's offset coordinates (odd rows shifted right by half a tile).
 * The list is not clipped to a map: callers drop coordinates outside it.
 */
export function neighbours(col: number, row: number): [number, number][] {
  return row & 1
    ? [[col - 1, row], [col + 1, row], [col, row - 1], [col + 1, row - 1], [col, row + 1], [col + 1, row + 1]]
    : [[col - 1, row], [col + 1, row], [col - 1, row - 1], [col, row - 1], [col - 1, row + 1], [col, row + 1]];
}

/** Axial coordinates (q, r) of an offset tile, for distance and path work. */
export function toAxial(col: number, row: number): { q: number; r: number } {
  return { q: col - (row - (row & 1)) / 2, r: row };
}
