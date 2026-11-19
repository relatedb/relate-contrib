import { describe, expect, it } from "vitest";
import { BORDER, EDGE, SPRITE_RES, gridOf, sticker, withoutInk, type Grid } from "../src/game/outline.js";
import { ACTOR_COLOURS, FLAG, GAME_ART, emptyGrid } from "../src/game/sprite-art.js";
import { ROBOT_COLOURS, robotCells } from "../src/game/robot.js";

const robot = (n: number): Grid => {
  const g = emptyGrid();
  for (const [x, y, ch] of robotCells(n)) g[y]![x] = ch;
  return g;
};
const actors: [string, Grid][] = [
  ["explorer", GAME_ART.explorer()],
  ["fire", GAME_ART.fire()],
  ["heart", GAME_ART.heart()],
  ...[1, 2, 3, 4, 5, 6, 7].map((n): [string, Grid] => [`robot with ${n} parts`, robot(n)]),
];

describe("a pixel-art sticker", () => {
  it("replaces ink with the colour beside it, and fills a thick line with the colours on either side", () => {
    const filled = withoutInk(gridOf(["aaaa", "KKKK", "KKKK", "bbbb"]));
    expect(filled.map((r) => r.join(""))).toEqual(["aaaa", "aaaa", "bbbb", "bbbb"]); // nearest colour, a tie to the cell above
    expect(filled.flat()).not.toContain("K");
  });

  it("puts a border of BORDER cells outside the art, in the same grid, rounded at the corners", () => {
    const art = emptyGrid();
    for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) art[y]![x] = "a";
    const out = sticker(art);
    expect(out.length).toBe(SPRITE_RES);
    expect(out[0]!.length).toBe(SPRITE_RES);
    // straight out from each side, BORDER cells of border and then nothing
    for (let d = 1; d <= BORDER; d++) expect(out[12]![10 - d], `left ${d}`).toBe(EDGE);
    expect(out[12]![10 - BORDER - 1]).toBeNull();
    for (let d = 1; d <= BORDER; d++) expect(out[9 - d + 1]![12], `above ${d}`).toBe(EDGE);
    // the corner is rounded: the far diagonal cell is not part of the border
    expect(out[10 - BORDER]![10 - BORDER]).toBeNull();
    expect(out[10 - 1]![10 - 1]).toBe(EDGE);
  });

  it("draws every actor inside the grid, with no black and no white border, in colours that are defined", () => {
    for (const [name, g] of actors) {
      const robotArt = name.startsWith("robot");
      const colours = robotArt ? ROBOT_COLOURS : ACTOR_COLOURS;
      expect(g.length, name).toBe(SPRITE_RES);
      for (const row of g) {
        expect(row.length, name).toBe(SPRITE_RES);
        for (const c of row) {
          if (!c) continue;
          expect(c, `${name}: ink`).not.toBe("K");
          expect(c, `${name}: border`).not.toBe(EDGE);
          expect(colours[c], `${name}: colour ${c}`).toBeTruthy();
        }
      }
    }
  });

  it("gives each actor more than a few tones, with a darker and a lighter one, so the colour holds the shape", () => {
    for (const [name, g] of actors) {
      if (name.includes("1 parts") || name.includes("2 parts") || name.includes("3 parts")) continue;
      const tones = new Set(g.flat().filter(Boolean));
      expect(tones.size, name).toBeGreaterThanOrEqual(4);
    }
  });

  it("can still put a sticker border on an actor, inside the grid, without touching its art", () => {
    for (const [name, art] of actors) {
      const out = sticker(art);
      expect(out.flat().includes("K"), name).toBe(false);
      out.forEach((row, y) =>
        row.forEach((c, x) => {
          if (c === EDGE) expect(art[y]![x], `${name} ${x},${y}`).toBeNull();
          else expect(c, `${name} ${x},${y}`).toBe(art[y]![x]);
        }),
      );
    }
  });

  it("keeps the flag, a prop, as a plain small sprite with no border", () => {
    expect(FLAG.join("")).not.toContain(EDGE);
    expect(FLAG.length).toBe(6);
  });
});
