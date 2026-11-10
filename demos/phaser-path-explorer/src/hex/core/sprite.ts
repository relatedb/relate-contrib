// 16 by 16 pixel sprites (the design system's `Sprite`): rows of palette characters, with K standing for the
// outline colour, which is black unless asked (use cream on a dark ground).
import { spritesAsset } from "../assets/index.js";

export type SpriteCells = Map<string, [number, number][]>;

export function spriteKinds(): string[] {
  return Object.keys(spritesAsset.sprites);
}

/** The sprite's cells grouped by palette colour name. An unknown kind draws a star, as the design system does. */
export function spriteCells(kind: string, outline = "black"): SpriteCells {
  const rows = spritesAsset.sprites[kind] ?? spritesAsset.sprites["star"]!;
  const by: SpriteCells = new Map();
  rows.forEach((r, y) => {
    for (let x = 0; x < 16; x++) {
      const c = r[x]!;
      if (c === ".") continue;
      const colour = c === "K" ? outline : spritesAsset.palette[c]!;
      const list = by.get(colour) ?? [];
      list.push([x, y]);
      by.set(colour, list);
    }
  });
  return by;
}
