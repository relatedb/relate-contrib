// The hex graph overlay (`HexGraph`): round nodes on hex cells and links between them, a port of the design system's
// layout. A link runs from the edge of one node to the edge of the other at any angle, drawn as a scaled arrow
// glyph; a node is a disc with a stroke, a separate fill and a cream casing. Everything is in lattice cells.
import { nodeTonesAsset } from "../assets/index.js";
import { arrowGeometry, pathPolylines } from "./arrow.js";
import { tileCentre, tileOrigin } from "./lattice.js";
import { crossGeom, elbowPath, type Axis, type CrossStyle, type Side } from "./piece.js";
import { wavePolyline, type Point, type WaveOptions } from "./wave.js";

export interface GraphNode {
  id: string;
  col: number;
  row: number;
  /** A tone preset of the design system's `Node`, such as `sun`, `ink`, `coral`, `iris`, `sand`. */
  tone?: string;
  fill?: string;
  stroke?: string;
  /** Diameter in lattice cells; default 8, the same disc as `Node`. */
  size?: number;
}

/** A node id, or a [col, row] cell with no node on it (a link then starts or stops at that cell's edge or `reach`). */
export type EdgeRef = string | [number, number];

export interface GraphEdge {
  from: EdgeRef;
  to: EdgeRef;
  /** The arrow notation: `->`, `=>`, `~>`, `<->`, `|-o`, and so on. Default `->`. */
  form?: string;
  weight?: number;
  pad?: number;
  reach?: number;
}

/** A routing piece on a cell: one stroke through the hex between two sides (see `elbowPath`). */
export interface GraphPiece {
  col: number;
  row: number;
  ends: [Side, Side];
  shaft?: "line" | "double";
  radius?: number;
  weight?: number;
}

/** A crossing on a cell: two (or three) strokes through the hex (see `crossGeom`). */
export interface GraphCross {
  col: number;
  row: number;
  cross: Axis[];
  style?: CrossStyle;
  /** The axis that passes over the other, for `bridge` and `hop`. */
  over?: Axis;
  weight?: number;
}

export interface PlacedPiece {
  /** Polylines in lattice cells, already moved to the cell. */
  polylines: number[][];
  /** Filled dots (a junction), already moved to the cell, with their casing radius. */
  dots: { x: number; y: number; r: number }[];
  /** Line width in lattice cells. */
  width: number;
  casingWidth: number | null;
}

export interface GraphOptions {
  nodeSize?: number;
  weight?: number;
  /** Width of the cream outline round nodes and lines; 0 turns it off. Default 0.5. */
  casing?: number;
  nodeStroke?: number;
}

/** The numbers behind one link, as the design system's transform and path text give them. */
export interface LinkLayout {
  tx: number;
  ty: number;
  angle: number;
  k: number;
  /** Line weight in lattice cells, shrunk on very short links. */
  w: number;
  form: string;
  /** Arrow path data and dots in arrow units. */
  d: string;
  dots: [number, number, number][];
}

export interface PlacedStroke {
  polylines: number[][];
  dots: { x: number; y: number; r: number }[];
  /** Line width in lattice cells. */
  width: number;
}

export interface PlacedLink {
  layout: LinkLayout;
  casing: PlacedStroke | null;
  stroke: PlacedStroke;
}

interface Ref {
  c: [number, number];
  size: number | undefined;
}

function resolve(r: EdgeRef, byId: Map<string, GraphNode>): Ref | undefined {
  if (Array.isArray(r)) return { c: tileCentre(r[0], r[1]), size: undefined };
  const n = byId.get(r);
  return n ? { c: tileCentre(n.col, n.row), size: n.size } : undefined;
}

/** The layout of one link, or null when its nodes are too close for an arrow to fit. */
export function layoutLink(edge: GraphEdge, byId: Map<string, GraphNode>, opts: GraphOptions = {}): LinkLayout | null {
  const A = resolve(edge.from, byId);
  const B = resolve(edge.to, byId);
  if (!A || !B) return null;
  const [ax, ay] = A.c;
  const [bx, by] = B.c;
  let dx = bx - ax;
  let dy = by - ay;
  const L = Math.sqrt(dx * dx + dy * dy);
  if (L < 1e-6) return null;
  dx /= L;
  dy /= L;
  const sa = A.size || opts.nodeSize || 8;
  const sb = B.size || opts.nodeSize || 8;
  const pad = edge.pad == null ? 0.4 : edge.pad;
  const fromCell = Array.isArray(edge.from);
  const toCell = Array.isArray(edge.to);
  const ra = fromCell ? (edge.reach != null ? edge.reach : L / 2) : sa / 2 + 0.6 + pad;
  const rb = toCell ? (edge.reach != null ? edge.reach : L / 2) : sb / 2 + 0.6 + pad;
  const D = L - ra - rb;
  if (D < 2) return null;
  const form = edge.form || "->";
  const base = edge.weight || opts.weight || 0.8;
  const w = fromCell || toCell ? base : Math.min(base, D / 6);
  const W1 = arrowGeometry(form, 1).W;
  const k = D / W1;
  const g = arrowGeometry(form, w / k);
  return { tx: ax + dx * ra, ty: ay + dy * ra, angle: (Math.atan2(dy, dx) * 180) / Math.PI, k, w, form, d: g.d, dots: g.dots };
}

/** The design system's transform text for a link, for checking against its own output. */
export function linkTransform(l: LinkLayout): string {
  return `translate(${l.tx.toFixed(3)} ${l.ty.toFixed(3)}) rotate(${l.angle.toFixed(3)}) scale(${l.k.toFixed(5)}) translate(0 -32)`;
}

function place(l: LinkLayout, flat: number[]): number[] {
  const a = (l.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i]!;
    const y = flat[i + 1]! - 32;
    out.push(l.tx + l.k * (x * c - y * s), l.ty + l.k * (x * s + y * c));
  }
  return out;
}

/** A link's strokes placed on the lattice: a cream casing under the line, both as polylines and dots. */
export function placeLink(l: LinkLayout, casing = 0.5): PlacedLink {
  const lines = pathPolylines(l.d).map((p) => place(l, p));
  const dotsAt = (extra: number) =>
    l.dots.map(([cx, cy, r]) => {
      const [x, y] = place(l, [cx, cy]) as [number, number];
      return { x, y, r: r * l.k + extra };
    });
  return {
    layout: l,
    casing: casing > 0 ? { polylines: lines, dots: dotsAt(casing), width: l.w + 2 * casing } : null,
    stroke: { polylines: lines, dots: dotsAt(0), width: l.w },
  };
}

export interface PlacedNode {
  cx: number;
  cy: number;
  /** Radius of the cream casing, of the fill disc, and the width of the stroke on the fill's edge. */
  casingR: number;
  r: number;
  strokeWidth: number;
  /** Palette colour names. */
  fill: string;
  stroke: string;
}

export function placeNode(n: GraphNode, opts: GraphOptions = {}): PlacedNode {
  const size = n.size || opts.nodeSize || 8;
  const sw = opts.nodeStroke || 1;
  const cs = opts.casing == null ? 0.5 : opts.casing;
  const tone = nodeTonesAsset.tones[n.tone ?? ""] ?? { stroke: "black", fill: "light-baltic" };
  const [cx, cy] = tileCentre(n.col, n.row);
  return {
    cx,
    cy,
    casingR: (size - sw) / 2 + sw / 2 + cs,
    r: (size - sw) / 2,
    strokeWidth: sw,
    fill: n.fill ?? tone.fill,
    stroke: n.stroke ?? tone.stroke,
  };
}

/** A piece placed on the lattice, with the width of its cream casing. */
export function placePiece(p: GraphPiece | GraphCross, opts: GraphOptions = {}): PlacedPiece {
  const w = p.weight || opts.weight || 0.8;
  const cs = opts.casing == null ? 0.5 : opts.casing;
  const [ox, oy] = tileOrigin(p.col, p.row);
  let d: string;
  let dots: [number, number, number][] = [];
  if ("cross" in p) {
    const g = crossGeom(p.cross, p.style ?? "bridge", p.over, w);
    d = g.d;
    dots = g.dots;
  } else d = elbowPath(p.ends, w, p.shaft ?? "line", p.radius ?? 0);
  const polylines = pathPolylines(d).map((line) => line.map((v, i) => v + (i % 2 === 0 ? ox : oy)));
  return {
    polylines,
    dots: dots.map(([x, y, r]) => ({ x: x + ox, y: y + oy, r: r + cs })),
    width: w,
    casingWidth: cs > 0 ? w + 2 * cs : null,
  };
}

/** A wavy line along a route (see `wavePolyline`), laid out like a piece: a stroke over a cream casing. */
export function placeWave(route: Point[], opts: GraphOptions & WaveOptions = {}): PlacedPiece {
  const w = opts.weight || 0.8;
  const cs = opts.casing == null ? 0.5 : opts.casing;
  return { polylines: [wavePolyline(route, opts)], dots: [], width: w, casingWidth: cs > 0 ? w + 2 * cs : null };
}

/** Everything to draw for a graph: pieces, then links, then nodes, as the design system stacks them. */
export function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: GraphOptions = {},
  pieces: (GraphPiece | GraphCross)[] = [],
): { pieces: PlacedPiece[]; links: PlacedLink[]; nodes: PlacedNode[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cs = opts.casing == null ? 0.5 : opts.casing;
  const links: PlacedLink[] = [];
  for (const e of edges) {
    const l = layoutLink(e, byId, opts);
    if (l) links.push(placeLink(l, cs));
  }
  return { pieces: pieces.map((p) => placePiece(p, opts)), links, nodes: nodes.map((n) => placeNode(n, opts)) };
}
