export { rng } from "./rng.js";
export { TILE_W, TILE_H, ROW_STEP, ODD_SHIFT, tileOrigin, tileCentre, hexSpan, sceneCells, neighbours, toAxial } from "./lattice.js";
export { paintTile, positionSeed, stampFeature } from "./paint.js";
export type { Terrain, Feature, Grid, Cell, Painter } from "./paint.js";
export { tilesFromRows, sceneSize, paintScene, toRgba } from "./scene.js";
export type { Tile, PaintedScene } from "./scene.js";
export { facetTile, HEX_OUTLINE } from "./facet.js";
export type { FacetTile, Poly } from "./facet.js";
export { spriteCells, spriteKinds } from "./sprite.js";
export type { SpriteCells } from "./sprite.js";
export { softenCorners, wavePolyline } from "./wave.js";
export type { Point, WaveOptions } from "./wave.js";
export { arrowGeometry, pathPolylines } from "./arrow.js";
export type { ArrowGeometry } from "./arrow.js";
export {
  AXIS_SIDES,
  axisOf,
  crossGeom,
  elbowPath,
  neighbourAt,
  oppositeSide,
  sideTo,
  SIDE_VECTORS,
  SIDES_CLOCKWISE,
  turnSide,
} from "./piece.js";
export type { Axis, CrossStyle, Side } from "./piece.js";
export { layoutGraph, layoutLink, linkTransform, placeLink, placeNode, placePiece, placeWave } from "./graph.js";
export type {
  EdgeRef,
  GraphEdge,
  GraphNode,
  GraphCross,
  GraphOptions,
  GraphPiece,
  LinkLayout,
  PlacedLink,
  PlacedNode,
  PlacedPiece,
  PlacedStroke,
} from "./graph.js";
