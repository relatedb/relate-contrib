// The game's own sprites (ADR-011, 2.7: new art, to be reviewed against the brand). The actors (the explorer, the fire,
// the heart, the robot in robot.ts) are drawn on a 32 by 32 grid, twice the world's resolution, and shown at half the cell
// size, so they fill the same box as a 16 by 16 sprite would, with finer detail. They have no black outline and no white
// border: the shape is held by colour, each tone having a lighter highlight and a darker shade of its own. No Phaser here,
// so that the art can be tested in Node.
import { SPRITE_RES, type Grid } from "./outline.js";

/**
 * The actors' colours, beyond the design system's palette (a recorded deviation, for brand review): a lighter and a darker
 * tone for each colour, so that the shape and the roundness show without a black line. The letters are this sprite set's
 * own, not the design system's.
 */
export const ACTOR_COLOURS: Record<string, string> = {
  // the explorer's straw hat: light, mid and shade, and its red band
  a: "#F7DE6B", b: "#E9B83C", c: "#B9862A", d: "#D43300", e: "#8F2200",
  // skin and hair, the eyes and the mouth
  s: "#F4CFA6", t: "#D9A074", r: "#7A4B27", k: "#1E2832", m: "#B5523B",
  // the shirt: light, mid, shade; the cream scarf
  l: "#FF8E6A", h: "#F96746", j: "#C13A1E", w: "#F2EAD4",
  // the pack: light, mid, dark; its strap; the belt and boots: dark, light
  g: "#6FA646", f: "#2E7D4F", F: "#145439", n: "#8B5A2B", u: "#5A3A22", v: "#7E5636",
  // the trousers: mid, dark
  p: "#0A6190", q: "#014063",
  // the heart: highlight, light, mid, deep, rim; the flame: deep, red, orange, yellow, pale core
  A: "#FFD0C2", B: "#FF8E6A", C: "#F0503A", D: "#C42A1E", E: "#8C1B17",
  G: "#D43300", H: "#F96746", I: "#FFA52E", J: "#FFE066", N: "#FFF6C2",
};

/** An empty sprite grid. */
export const emptyGrid = (): Grid => Array.from({ length: SPRITE_RES }, () => Array<string | null>(SPRITE_RES).fill(null));

/** Put rows of art, "." being nothing, on a sprite grid with their top left corner at (x, y). */
export function placeRows(rows: string[], x: number, y: number): Grid {
  const grid = emptyGrid();
  rows.forEach((row, j) => [...row].forEach((c, i) => void (c !== "." && (grid[y + j]![x + i] = c))));
  return grid;
}

/** The explorer: a straw hat with a red band, a face, a scarf, a shirt, a pack on the back, trousers and boots; 16 by 29 cells. */
const EXPLORER = [
  "......abbc......",
  "....aabbbbbc....",
  "...aabbbbbbbc...",
  "...abbbbbbbbc...",
  "..ddddddddddde..",
  ".abbbbbbbbbbbbc.",
  "aabbbbbbbbbbbbcc",
  ".cccccccccccccc.",
  "...rssssssssr...",
  "...rskssssksr...",
  "...rskssssksr...",
  "....ssssssss....",
  "....sssmmsss....",
  "....tsssssst....",
  "...wwwwwwwwww...",
  "..lhhhhhhhhhjgff",
  ".lhhhhhhhhhhjgfF",
  ".lhhhhhhhhhhjgfF",
  ".lhhhhhhhhhhjgfF",
  ".lhhhhhhhhhhjnfF",
  ".jhhhhhhhhhhjnfF",
  "..uuuuuuuuuuu...",
  "...pppppppppq...",
  "...pppppppppq...",
  "...pppp..pppq...",
  "...pppp..pppq...",
  "...pppp..pppq...",
  "..uuuuu..uuuuu..",
  "..vuuuu..vuuuu..",
];

/** A heart, from the implicit curve, lit from the top left: a highlight, light and mid tones, a deep tone and a rim. */
function heart(): Grid {
  const grid = emptyGrid();
  const u = (x: number) => (x - 15.5) / 12;
  const v = (y: number) => (16.5 - y) / 12;
  const inside = (x: number, y: number): boolean => (u(x) ** 2 + v(y) ** 2 - 1) ** 3 - u(x) ** 2 * v(y) ** 3 <= 0;
  for (let y = 0; y < SPRITE_RES; y++) {
    for (let x = 0; x < SPRITE_RES; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x + 0.5, y - 0.5) || !inside(x - 0.5, y + 0.5) || !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y + 1.5);
      const light = -0.55 * u(x) + 0.5 * v(y) + 0.3; // brighter to the top left
      const shine = (u(x) + 0.5) ** 2 + (v(y) - 0.55) ** 2 < 0.02;
      grid[y]![x] = shine ? "A" : edge ? "E" : light > 0.7 ? "B" : light > 0.15 ? "C" : "D";
    }
  }
  return grid;
}

/** A flame: a teardrop that sways, deep red outside, then orange, yellow and a pale core. */
function fire(): Grid {
  const grid = emptyGrid();
  const top = 1;
  const height = SPRITE_RES - 2;
  const layer = (scale: number, from: number, colour: string): void => {
    for (let y = top; y < top + height; y++) {
      const t = (y - top) / (height - 1);
      if (t < from) continue;
      const span = (t - from) / (1 - from); // 0 at this layer's tip, 1 at its base
      const half = scale * 12.5 * Math.sin(Math.PI * Math.min(1, span ** 0.75) * 0.5) ** 1.1 * (span > 0.92 ? 0.82 : 1);
      const sway = 2.4 * Math.sin(t * Math.PI * 1.6) * (1 - t * 0.5);
      for (let x = Math.floor(15.5 + sway - half); x <= Math.ceil(15.5 + sway + half); x++) {
        if (Math.abs(x + 0.5 - (15.5 + sway)) > half) continue;
        grid[y]![x] = colour;
      }
    }
  };
  layer(1, 0, "G");
  layer(0.82, 0.12, "H");
  layer(0.58, 0.3, "I");
  layer(0.34, 0.5, "J");
  layer(0.16, 0.66, "N");
  return grid;
}

export const GAME_ART: Record<"explorer" | "heart" | "fire", () => Grid> = {
  explorer: () => placeRows(EXPLORER, 8, 1),
  heart,
  fire,
};

/** The flag, a prop that is part of the scene: a small red pennant on a darker pole, 4 by 6 cells, with no outline and no border. */
export const FLAG = ["Hh..", "Hhh.", "Hh..", "H...", "H...", "H..."];
