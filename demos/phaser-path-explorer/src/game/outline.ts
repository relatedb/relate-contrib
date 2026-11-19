// A pixel-art sticker: the sprite's colours, with a white border round the outside and no black (ADR-011, amended
// 2026-11-19). The art is drawn on a 32 by 32 grid that includes the border, so it leaves BORDER cells free on every
// side; the border is added in that margin, rounded at the corners, as on a sticker. A sprite is a grid of palette
// characters, null for nothing. Ink (K) in older art takes the colour beside it.

export type Grid = (string | null)[][];

/** The character of a cell of the white border. */
export const EDGE = "O";

/** The sprites are drawn on a grid this many cells across: twice the world's resolution, at half the cell size. */
export const SPRITE_RES = 32;

/** The white border is this many cells wide: one and a half cells of the world, as the art is at twice its resolution. */
export const BORDER = 3;

const INK = "K";
const SIDES: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // above first: it wins a tie
const AROUND: [number, number][] = [...SIDES, [-1, -1], [1, -1], [-1, 1], [1, 1]];

/** Parse rows of characters, where "." is nothing. */
export const gridOf = (rows: string[]): Grid => rows.map((r) => [...r].map((c) => (c === "." ? null : c)));

/**
 * Every ink cell takes the colour of the nearest cell that has one (spreading in from the coloured cells a step at a
 * time, the cell above winning a tie), so a thick black line is filled by the colours on either side of it.
 */
export function withoutInk(grid: Grid): Grid {
  const out: Grid = grid.map((row) => [...row]);
  const at = (x: number, y: number): string | null | undefined => out[y]?.[x];
  for (let left = out.flat().filter((c) => c === INK).length; left > 0; ) {
    const next: [number, number, string][] = [];
    out.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== INK) return;
        for (const [dx, dy] of SIDES) {
          const n = at(x + dx, y + dy);
          if (n && n !== INK) {
            next.push([x, y, n]);
            return;
          }
        }
      }),
    );
    if (next.length === 0) {
      // ink with no colour anywhere near it (a sprite of ink alone): leave it as the border
      out.forEach((row, y) => row.forEach((c, x) => void (c === INK && (out[y]![x] = EDGE))));
      break;
    }
    for (const [x, y, n] of next) out[y]![x] = n;
    left -= next.length;
  }
  return out;
}

/**
 * The sticker: no ink, and a white border `BORDER` cells wide round the silhouette, rounded at the corners, inside the same
 * grid. Art that comes closer than `BORDER` cells to the grid's edge has its border cut off there.
 */
export function sticker(grid: Grid, border = BORDER): Grid {
  const coloured = withoutInk(grid);
  const reach = border + 0.5;
  const cells = coloured.flatMap((row, y) => row.flatMap((c, x) => (c ? [[x, y] as const] : [])));
  return coloured.map((row, y) =>
    row.map((c, x) => {
      if (c) return c;
      return cells.some(([cx, cy]) => (cx - x) ** 2 + (cy - y) ** 2 <= reach * reach) ? EDGE : null;
    }),
  );
}
