// Turn the thread and the paths into drawn routes. A route runs from a source to a target, both marked hexes (an
// anchor, the explorer): the hexes between them carry a routing piece each (an elbow, or a straight connector when the
// route runs on), and an arrow link joins the source and the target to the nearest piece, as the design system's hex
// graph draws a route. The thread is a single line; a secured path is a double one.
import { axisOf, sideTo, tileCentre, type GraphCross, type GraphEdge, type GraphPiece, type Point, type Side } from "../hex/core/index.js";
import type { Edge, HexState } from "./state.js";

export interface Route {
  kind: Edge["kind"];
  /** Hex ids: where the route starts, the hexes it passes through, and where it ends. */
  from: string;
  between: string[];
  to: string;
}

const OPPOSITE: Record<Side, Side> = { e: "w", w: "e", se: "nw", nw: "se", sw: "ne", ne: "sw" };

/**
 * Split the edges into routes between marked hexes. A route starts at a marked hex (or at a hex nothing leads to)
 * and follows its edges until it reaches a marked hex, or a hex where it ends or forks; that hex ends the route and
 * is returned among `ends` so it can be marked too. Where two routes share a hex (one crosses the other), each
 * passes straight on: the route follows the outgoing edge of its own kind, or, when both are of the same kind, the one
 * on the far side of the hex.
 */
export function routes(
  edges: Edge[],
  marked: ReadonlySet<string>,
  tiles: ReadonlyMap<string, HexState>,
): { routes: Route[]; ends: Set<string> } {
  const outgoing = new Map<string, Edge[]>();
  const incoming = new Set<string>();
  for (const e of edges) {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
    incoming.add(e.to);
  }
  const starts = new Set<string>();
  for (const e of edges) if (marked.has(e.from) || !incoming.has(e.from)) starts.add(e.from);
  const found: Route[] = [];
  const ends = new Set<string>();
  for (const s of starts) {
    for (const first of outgoing.get(s) ?? []) {
      const between: string[] = [];
      let prev = s;
      let cur = first.to;
      let kind = first.kind;
      let guard = 0;
      while (!marked.has(cur) && guard++ < 1000) {
        const next = onward(outgoing.get(cur), prev, cur, kind, tiles);
        if (!next) break; // the route ends or forks here
        between.push(cur);
        prev = cur;
        cur = next.to;
        kind = next.kind;
      }
      if (!marked.has(cur)) ends.add(cur);
      found.push({ kind: first.kind, from: s, between, to: cur });
    }
  }
  return { routes: found, ends };
}

/** The edge a route follows out of a hex it came into from `prev`, or undefined when it ends or forks. */
function onward(
  candidates: Edge[] | undefined,
  prev: string,
  cur: string,
  kind: Edge["kind"],
  tiles: ReadonlyMap<string, HexState>,
): Edge | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const same = candidates.filter((e) => e.kind === kind);
  const pool = same.length > 0 ? same : candidates;
  if (pool.length === 1) return pool[0];
  const here = tiles.get(cur);
  const back = tiles.get(prev);
  if (!here || !back) return undefined;
  const straight = OPPOSITE[sideTo(here, back)];
  return pool.find((e) => {
    const to = tiles.get(e.to);
    return to ? sideTo(here, to) === straight : false;
  });
}

/**
 * What draws a route, in the design system's terms. The visual language: a thread still being extended is wavy, and
 * straightens when it is anchored, becoming a route of elbows and straight connectors.
 *  - A secured path: a straight route, a piece in each hex it passes through and an arrow link at each end.
 *  - A loose thread between neighbours: the design system's wavy arrow (`~>`).
 *  - A loose thread through several hexes: one wavy line along the route (the design system has no wavy elbow; see
 *    `wavePolyline`), ending in the design system's arrowhead.
 * `ring` is the size of the ring that marks the source, so the line starts at its edge.
 */
export function routeToGraph(
  route: Route,
  tiles: ReadonlyMap<string, HexState>,
  ring = 8,
): { pieces: GraphPiece[]; edges: GraphEdge[]; waves: Point[][] } {
  const secured = route.kind === "SECURED";
  const at = (id: string) => tiles.get(id)!;
  if (route.between.length === 0)
    return { pieces: [], edges: [{ from: route.from, to: route.to, form: secured ? "<->" : "|~>" }], waves: [] };
  const cells = [route.from, ...route.between, route.to].map(at);
  const firstCell = cells[1]!;
  const lastCell = cells[cells.length - 2]!;
  if (!secured) {
    const source = tileCentre(cells[0]!.col, cells[0]!.row);
    const toFirst = tileCentre(firstCell.col, firstCell.row);
    const gap = ring / 2 + 0.6 + 0.4; // where a link leaves a ring
    const d = Math.hypot(toFirst[0] - source[0], toFirst[1] - source[1]);
    const start: Point = [source[0] + ((toFirst[0] - source[0]) / d) * gap, source[1] + ((toFirst[1] - source[1]) / d) * gap];
    const target = tileCentre(cells[cells.length - 1]!.col, cells[cells.length - 1]!.row);
    const last = tileCentre(lastCell.col, lastCell.row);
    const end: Point = [(last[0] + target[0]) / 2, (last[1] + target[1]) / 2]; // the edge the head's stem starts from
    const body: Point[] = [start, ...cells.slice(1, -1).map((c): Point => tileCentre(c.col, c.row)), end];
    return { pieces: [], edges: [{ from: [lastCell.col, lastCell.row], to: route.to, form: "->" }], waves: [body] };
  }
  const pieces: GraphPiece[] = route.between.map((_, i) => {
    const prev = cells[i]!;
    const here = cells[i + 1]!;
    const next = cells[i + 2]!;
    return { col: here.col, row: here.row, ends: [sideTo(here, prev), sideTo(here, next)], shaft: "line" };
  });
  return {
    pieces,
    edges: [
      { from: route.from, to: [firstCell.col, firstCell.row], form: "<-" },
      { from: [lastCell.col, lastCell.row], to: route.to, form: "->" },
    ],
    waves: [],
  };
}

/**
 * Where two straight pieces on different axes share a hex, one route crosses the other: draw them as the design
 * system's crossing, a bridge with the later piece passing over the earlier. Pieces that bend, or lie along the same
 * axis, are left to overlap. (A loose thread is a wavy line and has no pieces; it simply passes over what it crosses.)
 */
export function withCrossings(pieces: GraphPiece[]): (GraphPiece | GraphCross)[] {
  const byHex = new Map<string, GraphPiece[]>();
  for (const p of pieces) {
    const key = `${p.col},${p.row}`;
    byHex.set(key, [...(byHex.get(key) ?? []), p]);
  }
  const out: (GraphPiece | GraphCross)[] = [];
  for (const group of byHex.values()) {
    if (group.length === 2) {
      const [a, b] = group as [GraphPiece, GraphPiece];
      const ax = axisOf(a.ends);
      const bx = axisOf(b.ends);
      if (ax && bx && ax !== bx) {
        out.push({ col: a.col, row: a.row, cross: [ax, bx], style: "bridge", over: bx });
        continue;
      }
    }
    out.push(...group);
  }
  return out;
}
