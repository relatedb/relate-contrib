// Signposts (ADR-011, amended 2026-11-17): a settlement the explorer has arrived at points the way to the settlements
// within a day's walk that are not yet reached, and only to the nearest of the six hex directions. Two settlements the
// same way give one arrow, and how far they are is not shown: the imprecision is in the rules, not in the drawing.
import { SIDES_CLOCKWISE, type Side } from "../hex/core/index.js";

/** The hex direction closest to an axial difference (dq, dr) on a pointy-top grid. */
export function sideOfAxial(dq: number, dr: number): Side {
  const x = Math.sqrt(3) * (dq + dr / 2);
  const y = 1.5 * dr;
  const sector = Math.round((Math.atan2(y, x) * 180) / Math.PI / 60);
  return SIDES_CLOCKWISE[((sector % 6) + 6) % 6]!;
}

/** Group signpost rows by the settlement they stand at, one arrow to a direction. */
export function groupSignposts(rows: { at: string; dq: number; dr: number }[]): Map<string, Side[]> {
  const out = new Map<string, Set<Side>>();
  for (const r of rows) {
    const set = out.get(r.at) ?? new Set<Side>();
    set.add(sideOfAxial(r.dq, r.dr));
    out.set(r.at, set);
  }
  return new Map([...out].map(([at, sides]) => [at, SIDES_CLOCKWISE.filter((s) => sides.has(s))]));
}
