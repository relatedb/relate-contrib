// Routing pieces for the hex graph overlay (`HexElbow`): one stroke that enters a hex cell through one side, passes
// the centre, and leaves through another. Opposite sides give a straight connector, sides two steps apart a 60 degree
// bend, sides one step apart a sharp 120 degree turn. A port of `elbowPath`, line for line; the path text is
// compared with the design system's own in the tests. Coordinates are in the tile's own cells (a tile is 16 by 17).
import { neighbours } from "./lattice.js";

export type Side = "e" | "se" | "sw" | "w" | "nw" | "ne";

/** From a hex's centre to the midpoint of each of its six sides. */
export const SIDE_VECTORS: Record<Side, [number, number]> = {
  e: [8, 0],
  se: [4, 7],
  sw: [-4, 7],
  w: [-8, 0],
  nw: [-4, -7],
  ne: [4, -7],
};

/** The tile's centre, in the tile's own cells. */
const HC: [number, number] = [8, 8.5];

const f2 = (v: number) => Math.round(v * 1000) / 1000;
const P2 = (x: number, y: number) => f2(x) + " " + f2(y);

/** Path text for a piece joining two sides (M, L and A only). Shaft `double` draws two parallel strokes. */
export function elbowPath(ends: [Side, Side], sw: number, shaft: "line" | "double" = "line", radius = 0): string {
  const A = SIDE_VECTORS[ends[0]];
  const B = SIDE_VECTORS[ends[1]];
  if (!A || !B || A === B) return "";
  const c = HC;
  const la = Math.sqrt(A[0] * A[0] + A[1] * A[1]);
  const lb = Math.sqrt(B[0] * B[0] + B[1] * B[1]);
  const u1 = [-A[0] / la, -A[1] / la];
  const u2 = [B[0] / lb, B[1] / lb];
  const dot = u1[0]! * u2[0]! + u1[1]! * u2[1]!;
  const cross = u1[0]! * u2[1]! - u1[1]! * u2[0]!;
  const n1 = [u1[1]!, -u1[0]!];
  const n2 = [u2[1]!, -u2[0]!];
  const straight = dot > 0.999;
  const offs = shaft === "double" ? [-sw * 1.25, sw * 1.25] : [0];
  let d = "";
  offs.forEach((o) => {
    const Pa = [c[0] + A[0] + n1[0]! * o, c[1] + A[1] + n1[1]! * o];
    const Pb = [c[0] + B[0] + n2[0]! * o, c[1] + B[1] + n2[1]! * o];
    if (straight) {
      d += "M" + P2(Pa[0]!, Pa[1]!) + "L" + P2(Pb[0]!, Pb[1]!);
      return;
    }
    const half = Math.acos(Math.max(-1, Math.min(1, -dot))) / 2;
    const th = Math.tan(half);
    const r = Math.min(radius || 0, (la - 0.5) * th);
    const t = r / th;
    const rr = cross > 0 ? r + o : r - o;
    if (r > 0.05 && rr > 0.05) {
      const T1 = [c[0] - u1[0]! * t + n1[0]! * o, c[1] - u1[1]! * t + n1[1]! * o];
      const T2 = [c[0] + u2[0]! * t + n2[0]! * o, c[1] + u2[1]! * t + n2[1]! * o];
      d +=
        "M" + P2(Pa[0]!, Pa[1]!) + "L" + P2(T1[0]!, T1[1]!) + "A" + f2(rr) + " " + f2(rr) + " 0 0 " + (cross > 0 ? 1 : 0) + " " +
        P2(T2[0]!, T2[1]!) + "L" + P2(Pb[0]!, Pb[1]!);
    } else {
      const k = o / (1 + dot);
      const M = [c[0] + (n1[0]! + n2[0]!) * k, c[1] + (n1[1]! + n2[1]!) * k];
      d += "M" + P2(Pa[0]!, Pa[1]!) + "L" + P2(M[0]!, M[1]!) + "L" + P2(Pb[0]!, Pb[1]!);
    }
  });
  return d;
}

/** Which side of a hex a neighbouring hex lies on. Throws for a hex that is not a neighbour. */
export function sideTo(from: { col: number; row: number }, to: { col: number; row: number }): Side {
  // neighbours() lists W, E, NW, NE, SW, SE
  const order: Side[] = ["w", "e", "nw", "ne", "sw", "se"];
  const i = neighbours(from.col, from.row).findIndex(([c, r]) => c === to.col && r === to.row);
  if (i < 0) throw new Error(`hex ${to.col},${to.row} is not next to ${from.col},${from.row}`);
  return order[i]!;
}

// --- crossings (`HexCross`): two strokes through one hex ---

/** The three straight lines through a hex: west to east, north-east to south-west, north-west to south-east. */
export type Axis = "ew" | "nesw" | "nwse";

export const AXIS_SIDES: Record<Axis, [Side, Side]> = { ew: ["w", "e"], nwse: ["nw", "se"], nesw: ["sw", "ne"] };

/** The axis a straight piece lies on, or undefined for a piece that bends. */
export function axisOf(ends: [Side, Side]): Axis | undefined {
  for (const [axis, sides] of Object.entries(AXIS_SIDES) as [Axis, [Side, Side]][])
    if ((ends[0] === sides[0] && ends[1] === sides[1]) || (ends[0] === sides[1] && ends[1] === sides[0])) return axis;
  return undefined;
}

export type CrossStyle = "plain" | "junction" | "bridge" | "hop";

function axisPts(k: Axis): [[number, number], [number, number]] {
  const a = AXIS_SIDES[k];
  const p = SIDE_VECTORS[a[0]];
  const q = SIDE_VECTORS[a[1]];
  return [[HC[0] + p[0], HC[1] + p[1]], [HC[0] + q[0], HC[1] + q[1]]];
}

/**
 * Path text and dots for two or three strokes crossing in one hex. `plain` runs them straight through, `junction`
 * adds a dot at the centre, `bridge` lets one pass over the other with a gap in the other, `hop` arcs the top one
 * across. A port of `crossGeom`, line for line.
 */
export function crossGeom(
  axesIn: Axis[],
  style: CrossStyle = "plain",
  over: Axis | undefined,
  sw: number,
): { d: string; dots: [number, number, number][] } {
  const axes = (axesIn && axesIn.length ? axesIn : (["ew", "nesw"] as Axis[])).filter((k) => AXIS_SIDES[k]);
  let d = "";
  const dots: [number, number, number][] = [];
  if (axes.length !== 2 || (style !== "bridge" && style !== "hop")) {
    axes.forEach((k) => {
      const a = axisPts(k);
      d += "M" + P2(a[0][0], a[0][1]) + "L" + P2(a[1][0], a[1][1]);
    });
    if (style === "junction") dots.push([HC[0], HC[1], sw * 1.5]);
    return { d, dots };
  }
  const ov = over && axes.indexOf(over) >= 0 ? over : axes[0]!;
  const un = axes[0] === ov ? axes[1]! : axes[0]!;
  const o = axisPts(ov);
  const q = axisPts(un);
  let ux = o[1][0] - o[0][0];
  let uy = o[1][1] - o[0][1];
  const ul = Math.sqrt(ux * ux + uy * uy);
  ux /= ul;
  uy /= ul;
  let vx = q[1][0] - q[0][0];
  let vy = q[1][1] - q[0][1];
  const vl = Math.sqrt(vx * vx + vy * vy);
  vx /= vl;
  vy /= vl;
  const L = vl / 2;
  const c = HC;
  const seg = (t0: number, t1: number) =>
    "M" + P2(c[0] + vx * t0, c[1] + vy * t0) + "L" + P2(c[0] + vx * t1, c[1] + vy * t1);
  if (style === "bridge") {
    const hg = sw / (2 * 0.866) + 0.8 * sw;
    d += "M" + P2(o[0][0], o[0][1]) + "L" + P2(o[1][0], o[1][1]) + seg(-L, -hg) + seg(hg, L);
  } else {
    const rho = 2.4 * sw;
    const dl = 1.1 * sw;
    const nx = uy;
    const ny = -ux;
    const s = vx * nx + vy * ny;
    d += "M" + P2(o[0][0], o[0][1]) + "L" + P2(c[0] - ux * rho, c[1] - uy * rho) + "A" + f2(rho) + " " + f2(rho) + " 0 0 1 " +
      P2(c[0] + ux * rho, c[1] + uy * rho) + "L" + P2(o[1][0], o[1][1]);
    d += s > 0 ? seg(-L, rho - dl) + seg(rho + dl, L) : seg(-L, -rho - dl) + seg(-rho + dl, L);
  }
  return { d, dots };
}

// --- facing: the six directions in order, and the neighbour in one of them ---

/** The six sides in clockwise order on screen, starting from east. */
export const SIDES_CLOCKWISE: Side[] = ["e", "se", "sw", "w", "nw", "ne"];

/** The side reached by turning `steps` sixths of a turn clockwise (negative: counter-clockwise). */
export function turnSide(side: Side, steps: number): Side {
  const i = SIDES_CLOCKWISE.indexOf(side);
  return SIDES_CLOCKWISE[(((i + steps) % 6) + 6) % 6]!;
}

export function oppositeSide(side: Side): Side {
  return turnSide(side, 3);
}

/** The hex on a side of another: the inverse of `sideTo`. */
export function neighbourAt(from: { col: number; row: number }, side: Side): { col: number; row: number } {
  const order: Side[] = ["w", "e", "nw", "ne", "sw", "se"]; // the order `neighbours()` lists them in
  const [col, row] = neighbours(from.col, from.row)[order.indexOf(side)]!;
  return { col, row };
}
