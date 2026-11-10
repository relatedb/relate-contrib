// A wavy line along a route that bends. The design system's wavy shaft (`~`) belongs to its arrow glyph, which runs
// straight between two nodes; it has no wavy elbow. For a route that turns through several hexes this draws one
// continuous wave along the route's centreline, with the corners softened, tapering to the straight line at both ends
// so it meets the rest of the drawing exactly. This is a departure from the design system, recorded in ADR-010 2.7.

export type Point = [number, number];

/** Round the corners of a polyline by cutting each one (Chaikin's method); the end points stay where they are. */
export function softenCorners(points: Point[], rounds = 2): Point[] {
  let pts = points;
  for (let k = 0; k < rounds; k++) {
    if (pts.length < 3) return pts;
    const next: Point[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(pts[pts.length - 1]!);
    pts = next;
  }
  return pts;
}

export interface WaveOptions {
  /** How far the line strays from the route, in lattice cells. Default 1.2. */
  amplitude?: number;
  /** Distance between crests. Default 7. */
  wavelength?: number;
  /** Distance over which the wave grows from and fades to the straight line at each end. Default 3. */
  ramp?: number;
  /** Spacing of the samples. Default 0.25. */
  step?: number;
}

/** The route's centreline made wavy: x, y pairs, starting and ending exactly on the route's end points. */
export function wavePolyline(route: Point[], opts: WaveOptions = {}): number[] {
  const amplitude = opts.amplitude ?? 1.2;
  const wavelength = opts.wavelength ?? 7;
  const ramp = opts.ramp ?? 3;
  const step = opts.step ?? 0.25;
  const pts = softenCorners(route);
  if (pts.length < 2) return pts.flatMap((p) => p);
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const out: number[] = [];
  const n = Math.max(2, Math.ceil(total / step));
  let seg = 0;
  for (let k = 0; k <= n; k++) {
    const s = (total * k) / n;
    while (seg < pts.length - 2 && cum[seg + 1]! < s) seg++;
    const a = pts[seg]!;
    const b = pts[seg + 1]!;
    const len = cum[seg + 1]! - cum[seg]! || 1;
    const t = (s - cum[seg]!) / len;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    const edge = Math.min(s, total - s) / Math.min(ramp, total / 2);
    const e = Math.min(1, edge);
    const envelope = e * e * (3 - 2 * e); // smooth in and out
    const w = Math.sin((2 * Math.PI * s) / wavelength) * amplitude * envelope;
    out.push(a[0] + (b[0] - a[0]) * t - ty * w, a[1] + (b[1] - a[1]) * t + tx * w);
  }
  return out;
}
