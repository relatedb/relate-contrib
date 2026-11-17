// A seeded world as rows of the design system's legend characters (D deep, w water, s sand, g grass, f forest,
// h hills, m mountain, b badlands; t the camp's tent; R and U towers on grass and hills). A pure function of the
// seed, so a seed always gives the same map. The graph is built from these rows (graph.ts).
import { neighbours, rng } from "../hex/core/index.js";

export const COLS = 25;
export const ROWS = 20;

/** Steps in a day, and waymarkers in the bag (ADR-011, amended 2026-11-16). Towers are reachable within a day. */
export const START_STEPS = 12;
export const START_MARKERS = 5;

/**
 * Steps to enter a hex of each terrain (ADR-011, amended 2026-11-16): no binary walls, every hex has a price. Water
 * and deep water cost more than any day, so they are never affordable — a drop off the edge of the world.
 */
export const TERRAIN_COST: Record<string, number> = { D: 13, w: 13, m: 4, b: 2, g: 1, f: 1, h: 1, s: 1, t: 1, R: 1, U: 1 };
export const terrainCost = (ch: string | undefined): number => (ch === undefined ? 1 : (TERRAIN_COST[ch] ?? 1));

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- value noise: smooth, seeded, no dependencies ---
function lattice(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const sx = x - x0;
  const sy = y - y0;
  const u = sx * sx * (3 - 2 * sx);
  const v = sy * sy * (3 - 2 * sy);
  const a = lattice(x0, y0, seed);
  const b = lattice(x0 + 1, y0, seed);
  const c = lattice(x0, y0 + 1, seed);
  const d = lattice(x0 + 1, y0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Three octaves of value noise, in 0..1. */
function fbm(x: number, y: number, seed: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Steps from a hex to every land hex it can reach on foot (not through deep or shallow water), by breadth first. */
/** Cost-weighted distances by land: the cheapest total steps from `from` to every hex that is not water. */
export function landDistances(rows: string[], from: [number, number]): Map<string, number> {
  const dist = new Map<string, number>([[`${from[0]},${from[1]}`, 0]]);
  const queue: [number, number][] = [from];
  for (let i = 0; i < queue.length; i++) {
    // a small array as a priority queue: the graph is tiny and the costs are whole numbers
    let best = i;
    for (let j = i + 1; j < queue.length; j++) if (dist.get(`${queue[j]![0]},${queue[j]![1]}`)! < dist.get(`${queue[best]![0]},${queue[best]![1]}`)!) best = j;
    [queue[i], queue[best]] = [queue[best]!, queue[i]!];
    const [col, row] = queue[i]!;
    const d = dist.get(`${col},${row}`)!;
    for (const [c, r] of neighbours(col, row)) {
      const ch = rows[r]?.[c];
      if (ch === undefined || ch === "D" || ch === "w") continue; // no ground: never a route
      const via = d + terrainCost(ch);
      if (via < (dist.get(`${c},${r}`) ?? Infinity)) {
        dist.set(`${c},${r}`, via);
        queue.push([c, r]);
      }
    }
  }
  return dist;
}

/**
 * An island whose coast, highlands, lakes and woods come from noise: an elevation field and a moisture field
 * (both seeded) shaped by a radial mask. Mountains and hills rise where the land is high, badlands where it is
 * high and dry, forest where it is wet, small lakes in the low ground, and a clearing round the camp. Towers
 * stand on grass and hills, away from the camp and from each other.
 */
export function generateRows(seed: string, cols = COLS, rowsCount = ROWS): string[] {
  const hash = hashSeed(seed);
  const R = rng(hash);
  const cx = (cols - 1) / 2;
  const cy = (rowsCount - 1) / 2;
  const campCol = Math.floor(cols / 2);
  const campRow = Math.floor(rowsCount / 2);
  const grid: string[][] = [];
  for (let row = 0; row < rowsCount; row++) {
    const line: string[] = [];
    for (let col = 0; col < cols; col++) {
      const x = col + (row & 1 ? 0.5 : 0);
      const y = row * 0.875; // rows are 14 cells apart and columns 16
      const nx = (x - cx) / cx;
      const ny = ((row - cy) * 0.875) / (cy * 0.875);
      const d = Math.hypot(nx, ny) + (fbm(x * 0.25, y * 0.25, hash + 7) - 0.5) * 0.5;
      const elev = fbm(x * 0.17, y * 0.17, hash + 31);
      const moist = fbm(x * 0.2, y * 0.2, hash + 67);
      const high = elev - 0.25 * d; // highlands sit inland
      let ch: string;
      if (d > 1.2) ch = "D";
      else if (d > 1.06) ch = "w";
      else if (d > 0.97) ch = "s";
      else if (elev < 0.21 && d > 0.25) ch = "w"; // small lakes in the lowest ground
      else if (high > 0.5) ch = moist < 0.4 ? "b" : "m";
      else if (high > 0.4) ch = moist < 0.35 ? "b" : "h";
      else if (moist > 0.55) ch = "f";
      else ch = "g";
      line.push(ch);
    }
    grid.push(line);
  }
  // a clearing round the camp (grass, a few trees), then the tent itself
  for (let row = 0; row < rowsCount; row++)
    for (let col = 0; col < cols; col++)
      if (Math.hypot(col + (row & 1 ? 0.5 : 0) - (campCol + (campRow & 1 ? 0.5 : 0)), (row - campRow) * 0.875) < 2.3)
        grid[row]![col] = R() < 0.2 ? "f" : "g";
  grid[campRow]![campCol] = "t";
  // towers on grass or hills, away from the camp and each other. The first two are within reach of the starting
  // waymarks (ADR-011, 2.4), so every seed has somewhere to go; the rest are anywhere on land.
  const towers: [number, number][] = [];
  const wanted = Math.max(3, Math.round((cols * rowsCount) / 75));
  const reach = landDistances(grid.map((l) => l.join("")), [campCol, campRow]);
  const place = (col: number, row: number) => {
    const ch = grid[row]![col]!;
    grid[row]![col] = ch === "h" ? "U" : "R";
    towers.push([col, row]);
  };
  const ok = (col: number, row: number) => {
    const ch = grid[row]![col];
    return (
      (ch === "g" || ch === "h") &&
      Math.hypot(col - campCol, row - campRow) >= 4 &&
      towers.every(([c, r]) => Math.hypot(col - c, row - r) >= 4)
    );
  };
  for (let tries = 0; tries < 2000 && towers.length < 2; tries++) {
    const col = Math.floor(R() * cols);
    const row = Math.floor(R() * rowsCount);
    const d = reach.get(`${col},${row}`);
    if (d !== undefined && d >= 4 && d <= START_STEPS && ok(col, row)) place(col, row);
  }
  for (let tries = 0; tries < 800 && towers.length < wanted; tries++) {
    const col = Math.floor(R() * cols);
    const row = Math.floor(R() * rowsCount);
    if (ok(col, row)) place(col, row);
  }
  return grid.map((l) => l.join(""));
}
