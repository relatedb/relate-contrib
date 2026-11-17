// The fog as weather (ADR-011, amended 2026-11-17): grey clouds on the sky layer over every hex the explorer does not
// know. Pixel art on the board's own grid: value noise thresholded into a few flat greys, with the design system's
// checker dither between them, so the cloud has edges and an underside without a gradient.

function lattice(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const a = lattice(x0, y0);
  const b = lattice(x0 + 1, y0);
  const c = lattice(x0, y0 + 1);
  const d = lattice(x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Cloud density at a point of the board, 0 to 1: two octaves, stretched wider than tall like a sky. Sampled once per hex, at its centre, so clouds are made of whole hexes. */
export function cloudDensity(x: number, y: number): number {
  return (valueNoise(x / 38, y / 26) * 0.75 + valueNoise(x / 19, y / 13) * 0.25);
}

export type CloudCell = "none" | "wisp" | "shade" | "dither" | "body";

/** What a cell of cloud is made of at this density; `odd` is the checker's parity at the cell. */
export function cloudCell(density: number, odd: boolean): CloudCell {
  if (density < 0.5) return "none";
  if (density < 0.56) return odd ? "wisp" : "none"; // a hex of half-dithered edge
  if (density < 0.64) return "shade";
  return "body";
}
