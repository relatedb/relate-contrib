// The rogue robot being built along the bottom row, one part a night (ADR-011, amended 2026-11-17). New 16 by 16
// pixel art in the design system's sprite style (palette and outline), for brand review. Each part is a set of cells; a
// robot with n parts is the first n parts drawn over each other, so a later part can repaint an earlier one (power
// lights the eyes).
import { PARTS, type Part } from "./score.js";

export type Cell = [x: number, y: number, ch: string];

const rect = (x0: number, y0: number, x1: number, y1: number, ch: string): Cell[] => {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y, ch]);
  return out;
};
const box = (x0: number, y0: number, x1: number, y1: number, edge: string, fill: string): Cell[] => [
  ...rect(x0, y0, x1, y1, edge),
  ...rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill),
];

// K is the outline, C light-baltic, c baltic, g dark-gray (a dead eye), Y yellow (a lit eye, the lamp), as in sprites.json
export const PART_CELLS: Record<Part, Cell[]> = {
  head: box(3, 2, 12, 7, "K", "C"),
  eyes: [...rect(5, 4, 6, 5, "g"), ...rect(9, 4, 10, 5, "g")],
  mouth: rect(6, 6, 9, 6, "K"),
  body: box(4, 8, 11, 13, "K", "c"),
  arms: [
    ...rect(2, 8, 3, 8, "K"), ...rect(2, 13, 3, 13, "K"), ...rect(2, 9, 2, 12, "K"), ...rect(3, 9, 3, 12, "c"),
    ...rect(12, 8, 13, 8, "K"), ...rect(12, 13, 13, 13, "K"), ...rect(13, 9, 13, 12, "K"), ...rect(12, 9, 12, 12, "c"),
  ],
  legs: [
    ...rect(4, 14, 4, 14, "K"), ...rect(5, 14, 5, 14, "c"), ...rect(6, 14, 6, 14, "K"), ...rect(4, 15, 6, 15, "K"),
    ...rect(9, 14, 9, 14, "K"), ...rect(10, 14, 10, 14, "c"), ...rect(11, 14, 11, 14, "K"), ...rect(9, 15, 11, 15, "K"),
  ],
  power: [...rect(7, 1, 8, 1, "K"), ...rect(7, 0, 8, 0, "Y"), ...rect(5, 4, 6, 5, "Y"), ...rect(9, 4, 10, 5, "Y")],
};

/** The robot with its first `count` parts as cells; later parts are drawn over earlier ones. */
export function robotCells(count: number): Cell[] {
  const cells = new Map<string, Cell>();
  for (const part of PARTS.slice(0, count)) for (const c of PART_CELLS[part]) cells.set(`${c[0]},${c[1]}`, c);
  return [...cells.values()];
}

/** The column of the bottom row the robot stands in on a day (1 to seven): left to right, an even hop a day. */
export function robotSlot(day: number, cols: number, days = PARTS.length): number {
  return Math.round(((Math.min(days, Math.max(1, day)) - 1) * (cols - 1)) / (days - 1));
}
