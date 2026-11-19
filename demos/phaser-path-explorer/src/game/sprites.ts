// The game's sprites as Phaser textures (ADR-011, 2.7). The actors (the explorer, the fire, the heart, the robot) are
// drawn on a 32 by 32 grid, shown at half the world's cell size so each fills the same box as a 16 by 16 sprite, with
// twice the detail. They have no black outline; the shape is held by the tones of their colours. They can be made stickers
// (a white border inside the grid, outline.ts) by switching ACTOR_BORDER on. The flag is a prop, part of the scene, and
// stays a plain 4 by 6 sprite in the design system's palette.
import Phaser from "phaser";
import { paletteAsset, spritesAsset } from "../hex/assets/index.js";
import { EDGE, SPRITE_RES, gridOf, sticker, type Grid } from "./outline.js";
import { ACTOR_COLOURS, FLAG, GAME_ART } from "./sprite-art.js";

/** Whether the actors have a white sticker border. The art keeps to the middle 26 by 26 cells only when it is on. */
export const ACTOR_BORDER = false;

/** The border is pure white, which the design system's palette (cream, light gray) does not have. */
export const EDGE_COLOUR = "#FFFFFF";

/** The scale of an image of an actor sticker: the world's scale, halved, for a grid of twice the resolution. */
export const actorScale = (k: number): number => (k * 16) / SPRITE_RES;

/** Paint a grid of palette characters onto a texture; `extra` adds colours the palette does not have. */
export function paintGrid(scene: Phaser.Scene, key: string, grid: Grid, extra: Record<string, string> = {}): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, grid[0]!.length, grid.length);
  if (!texture) throw new Error(`could not create texture "${key}"`);
  const ctx = texture.getContext();
  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      if (!c) return;
      const colour = c === EDGE ? EDGE_COLOUR : (extra[c] ?? paletteAsset.colours[spritesAsset.palette[c] ?? ""]);
      if (!colour) throw new Error(`no palette colour for sprite character "${c}"`);
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Register one of the game's own sprites as a texture (nearest-neighbour). */
export function addGameSprite(scene: Phaser.Scene, key: string, kind: "explorer" | "fire" | "heart" | "flag"): void {
  if (kind === "flag") return paintGrid(scene, key, gridOf(FLAG));
  const art = GAME_ART[kind]();
  paintGrid(scene, key, ACTOR_BORDER ? sticker(art) : art, ACTOR_COLOURS);
}
