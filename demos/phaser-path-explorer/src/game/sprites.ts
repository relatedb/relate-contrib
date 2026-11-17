// The game's own 16 by 16 sprites, in the design system's sprite notation (ADR-011, 2.7: new art, to be reviewed
// against the brand). K is the outline, the other letters are the design system's palette characters (Y yellow,
// W cream, h mid-hibiscus, H hibiscus, l light-hibiscus).
import Phaser from "phaser";
import { paletteAsset, spritesAsset } from "../hex/assets/index.js";

export const GAME_SPRITES: Record<string, string[]> = {
  // the explorer: a hat, a face and a pack-carrying body
  explorer: [
    "................",
    "................",
    "......KKKK......",
    ".....KYYYYK.....",
    "....KYYYYYYK....",
    "....KKKKKKKK....",
    ".....KWWWWK.....",
    ".....KWWWWK.....",
    "......KKKK......",
    ".....KllllK.....",
    "....KlllllhK....",
    "....KlllllhK....",
    ".....KlhhhK.....",
    ".....KKhhKK.....",
    ".....KK..KK.....",
    "................",
  ],
  // a waymarker: a red pennant on a pole, 5 by 8 cells
  flag: ["KK...", "KhK..", "KhhK.", "KhK..", "KK...", "K....", "K....", "K...."],
};

/** Register a game sprite as a texture (nearest-neighbour). The outline is black. */
export function addGameSprite(scene: Phaser.Scene, key: string, kind: keyof typeof GAME_SPRITES): void {
  if (scene.textures.exists(key)) return;
  const rows = GAME_SPRITES[kind]!;
  const texture = scene.textures.createCanvas(key, rows[0]!.length, rows.length);
  if (!texture) throw new Error(`could not create texture "${key}"`);
  const ctx = texture.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      if (c === ".") continue;
      const name = c === "K" ? "black" : spritesAsset.palette[c];
      const colour = name ? paletteAsset.colours[name] : undefined;
      if (!colour) throw new Error(`no palette colour for sprite character "${c}"`);
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
