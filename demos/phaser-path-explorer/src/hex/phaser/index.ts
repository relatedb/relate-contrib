// The only layer that imports Phaser (ADR-010, 2.1): it turns the core's buffers and draw lists into Phaser
// textures and graphics. Everything is in lattice cells; scale the game object by a whole number of pixels.
import Phaser from "phaser";
import { paletteAsset } from "../assets/index.js";
import {
  HEX_OUTLINE,
  facetTile,
  positionSeed,
  spriteCells,
  tileCentre,
  tileOrigin,
  toRgba,
  type Feature,
  type PaintedScene,
  type PlacedLink,
  type PlacedNode,
  type PlacedPiece,
  type PlacedStroke,
  type Terrain,
} from "../core/index.js";

/** A palette colour name as a number for Phaser. */
export function colourNumber(name: string): number {
  const hex = paletteAsset.colours[name];
  if (!hex) throw new Error(`no palette colour "${name}"`);
  return parseInt(hex.slice(1), 16);
}

/**
 * Registers a scene's pixels as a texture, one pixel per lattice cell. Show it scaled by a whole number
 * with nearest-neighbour filtering (`pixelArt: true` in the game config) to keep the edges crisp.
 */
export function addSceneTexture(scene: Phaser.Scene, key: string, painted: PaintedScene): Phaser.Textures.CanvasTexture {
  const { width, height, data } = toRgba(painted);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) throw new Error(`could not create texture "${key}"`);
  texture.getContext().putImageData(new ImageData(data, width, height), 0, 0);
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST); // keep the pixel edges crisp while vector shapes stay smooth
  return texture;
}

/** A 16 by 16 sprite as a texture. */
export function addSpriteTexture(scene: Phaser.Scene, key: string, kind: string, outline = "black"): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, 16, 16);
  if (!texture) throw new Error(`could not create texture "${key}"`);
  const ctx = texture.getContext();
  for (const [colour, cells] of spriteCells(kind, outline)) {
    ctx.fillStyle = paletteAsset.colours[colour]!;
    for (const [x, y] of cells) ctx.fillRect(x, y, 1, 1);
  }
  texture.refresh();
}

export interface VectorTile {
  col: number;
  row: number;
  terrain: Terrain;
  feature?: Feature | undefined;
  seed?: number | undefined;
}

const pointsOf = (flat: number[], ox: number, oy: number): Phaser.Math.Vector2[] => {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push(new Phaser.Math.Vector2(ox + flat[i]!, oy + flat[i + 1]!));
  return pts;
};

/** A palette colour mixed towards another by `amount` (0 to 1), as a number for Phaser. */
export function mixColour(name: string, towards: string, amount: number): number {
  const a = colourNumber(name);
  const b = colourNumber(towards);
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Draw a tile in the flat look (its base colour, with no outline) or the facet look (base colour and polygons).
 * `dim` mixes the base colour towards the darkest Baltic, for ground that is known but not yet walked; mixing the
 * colour, not laying a translucent shape over it, leaves no seam where two hexes meet.
 */
export function drawVectorTile(gfx: Phaser.GameObjects.Graphics, t: VectorTile, look: "flat" | "facet", dim = 0): void {
  const [ox, oy] = tileOrigin(t.col, t.row);
  const f = facetTile(t.terrain, t.seed ?? positionSeed(t.col, t.row), look === "facet" ? t.feature : undefined);
  const base = dim > 0 ? mixColour(f.base, "darkest-baltic", dim) : colourNumber(f.base);
  gfx.fillStyle(base, 1);
  gfx.fillPoints(pointsOf(HEX_OUTLINE, ox, oy), true);
  gfx.lineStyle(0.25, base, 1);
  gfx.strokePoints(pointsOf(HEX_OUTLINE, ox, oy), true);
  if (look === "facet")
    for (const p of f.polys) {
      gfx.fillStyle(colourNumber(p.colour), 1);
      gfx.fillPoints(pointsOf(p.points, ox, oy), true);
    }
}

/**
 * Fill a tile's hexagon with one colour. An opaque fill gets a hairline of its own colour (as the design system's
 * flat hexes do) so neighbours meet without a seam; a translucent one (a highlight) does not.
 */
export function fillHex(gfx: Phaser.GameObjects.Graphics, col: number, row: number, colour: string, alpha = 1): void {
  const [ox, oy] = tileOrigin(col, row);
  gfx.fillStyle(colourNumber(colour), alpha);
  gfx.fillPoints(pointsOf(HEX_OUTLINE, ox, oy), true);
  if (alpha >= 1) {
    gfx.lineStyle(0.25, colourNumber(colour), 1);
    gfx.strokePoints(pointsOf(HEX_OUTLINE, ox, oy), true);
  }
}

/** Outline a tile's hexagon, optionally shrunk towards its centre (a factor below 1) so it sits inside the borders. */
export function strokeHex(
  gfx: Phaser.GameObjects.Graphics,
  col: number,
  row: number,
  colour: string,
  width: number,
  alpha = 1,
  shrink = 1,
): void {
  const [ox, oy] = tileOrigin(col, row);
  const pts = HEX_OUTLINE.map((v, i) => (i % 2 === 0 ? 8 : 8.5) + (v - (i % 2 === 0 ? 8 : 8.5)) * shrink);
  gfx.lineStyle(width, colourNumber(colour), alpha);
  gfx.strokePoints(pointsOf(pts, ox, oy), true);
}

/** Draw a laid-out hex graph (core `layoutGraph`): pieces, then links, then nodes, as the design system stacks them. */
export function drawGraph(
  gfx: Phaser.GameObjects.Graphics,
  graph: { pieces?: PlacedPiece[]; links: PlacedLink[]; nodes: PlacedNode[] },
  alpha = 1,
): void {
  const stroke = (s: PlacedStroke, colour: string) => {
    gfx.lineStyle(s.width, colourNumber(colour), alpha);
    for (const line of s.polylines) gfx.strokePoints(pointsOf(line, 0, 0), false);
    gfx.fillStyle(colourNumber(colour), alpha);
    for (const d of s.dots) gfx.fillCircle(d.x, d.y, d.r);
  };
  for (const p of graph.pieces ?? []) {
    if (p.casingWidth) {
      gfx.lineStyle(p.casingWidth, colourNumber("cream"), alpha);
      for (const line of p.polylines) gfx.strokePoints(pointsOf(line, 0, 0), false);
    }
    gfx.lineStyle(p.width, colourNumber("black"), alpha);
    for (const line of p.polylines) gfx.strokePoints(pointsOf(line, 0, 0), false);
    for (const d of p.dots) {
      gfx.fillStyle(colourNumber("cream"), 1);
      gfx.fillCircle(d.x, d.y, d.r);
      gfx.fillStyle(colourNumber("black"), 1);
      gfx.fillCircle(d.x, d.y, d.r - (p.casingWidth ? (p.casingWidth - p.width) / 2 : 0));
    }
  }
  for (const l of graph.links) {
    if (l.casing) stroke(l.casing, "cream"); // the casing keeps a link readable on every ground
    stroke(l.stroke, "black");
  }
  for (const n of graph.nodes) {
    gfx.fillStyle(colourNumber("cream"), 1);
    gfx.fillCircle(n.cx, n.cy, n.casingR);
    gfx.fillStyle(colourNumber(n.fill), 1);
    gfx.fillCircle(n.cx, n.cy, n.r);
    gfx.lineStyle(n.strokeWidth, colourNumber(n.stroke), 1);
    gfx.strokeCircle(n.cx, n.cy, n.r);
  }
}

/**
 * A node drawn as an outline only, with nothing inside: a ring of the given colour whose outer edge is where a
 * `Node` of that size ends (a 1-cell stroke by default), with the cream casing outside it and none inside, so the
 * ground shows through.
 */
export function drawRing(
  gfx: Phaser.GameObjects.Graphics,
  col: number,
  row: number,
  size: number,
  colour: string,
  strokeWidth = 1,
  casing = 0.5,
  alpha = 1,
): void {
  const [cx, cy] = tileCentre(col, row);
  if (casing > 0) {
    gfx.lineStyle(casing, colourNumber("cream"), alpha);
    gfx.strokeCircle(cx, cy, size / 2 + casing / 2);
  }
  gfx.lineStyle(strokeWidth, colourNumber(colour), alpha);
  gfx.strokeCircle(cx, cy, (size - strokeWidth) / 2);
}
