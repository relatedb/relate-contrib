// The rogue robot being built along the bottom row, one part a night (ADR-011, amended 2026-11-17). New 32 by 32
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

/**
 * The robot's colours: magentas and purples, which the design system's palette does not have (it is kept for the
 * explorer's world; the rogue AI is meant to look like something else). A recorded deviation. C is the head's light
 * purple, with E its highlight and D its shade; c the body, arms and legs' purple, with S its shade; g a dead eye and the
 * mouth (a dark violet); Y a lit eye and the antenna's lamp (a hot magenta), with Z its glow. No black: the shape is held
 * by these tones. The robot is drawn on a 32 by 32 grid, at half the world's cell size.
 */
export const ROBOT_COLOURS: Record<string, string> = {
  C: "#C77DFF", E: "#E4B5FF", D: "#9D4EDD", c: "#7B2CBF", S: "#5A189A", g: "#3A1262", Y: "#FF2BD6", Z: "#FF9BEA",
};
export const PART_CELLS: Record<Part, Cell[]> = {
  // a head with rounded corners, lit from the top left: a highlight along the top and left, a shade along the bottom and right
  head: [
    ...rect(8, 9, 23, 18, "C"), ...rect(7, 10, 24, 17, "C"),
    ...rect(9, 9, 22, 9, "E"), ...rect(7, 11, 7, 16, "E"), ...rect(8, 10, 8, 10, "E"),
    ...rect(9, 18, 22, 18, "D"), ...rect(24, 11, 24, 16, "D"), ...rect(23, 17, 23, 17, "D"),
  ],
  eyes: [...rect(10, 12, 12, 14, "g"), ...rect(19, 12, 21, 14, "g")],
  mouth: rect(12, 16, 19, 16, "g"),
  body: [
    ...rect(9, 19, 22, 26, "c"), ...rect(13, 21, 18, 23, "C"),
    ...rect(9, 26, 22, 26, "S"), ...rect(22, 19, 22, 25, "S"), ...rect(13, 23, 18, 23, "D"),
  ],
  arms: [
    ...rect(5, 19, 8, 25, "c"), ...rect(23, 19, 26, 25, "c"),
    ...rect(5, 19, 5, 25, "C"), ...rect(8, 19, 8, 25, "S"), ...rect(26, 19, 26, 25, "S"),
  ],
  legs: [
    ...rect(11, 27, 14, 28, "c"), ...rect(17, 27, 20, 28, "c"),
    ...rect(14, 27, 14, 28, "S"), ...rect(20, 27, 20, 28, "S"), ...rect(11, 28, 14, 28, "S"), ...rect(17, 28, 20, 28, "S"),
  ],
  power: [
    ...rect(14, 3, 17, 6, "Y"), ...rect(14, 3, 15, 4, "Z"), ...rect(15, 7, 16, 8, "g"),
    ...rect(10, 12, 12, 14, "Y"), ...rect(19, 12, 21, 14, "Y"), ...rect(10, 12, 11, 12, "Z"), ...rect(19, 12, 20, 12, "Z"),
  ],
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
