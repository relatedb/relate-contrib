import { describe, expect, it } from "vitest";
import { neighbours, tileCentre, toAxial } from "../src/hex/core/index.js";

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("hex lattice", () => {
  it("gives every tile six neighbours that are all one step away on screen", () => {
    for (const [col, row] of [[4, 4], [4, 5], [0, 0], [7, 9]] as const) {
      const ns = neighbours(col, row);
      expect(ns).toHaveLength(6);
      const c = tileCentre(col, row);
      const ds = ns.map(([x, y]) => dist(c, tileCentre(x, y)));
      // rows are 14 cells apart and columns 16, so neighbours are 16 away on a row and about 17 across rows
      for (const d of ds) expect(d).toBeGreaterThan(15.9);
      for (const d of ds) expect(d).toBeLessThan(18);
    }
  });

  it("is symmetric: if b is a neighbour of a, a is a neighbour of b", () => {
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 6; col++)
        for (const [x, y] of neighbours(col, row))
          expect(neighbours(x, y).some(([c, r]) => c === col && r === row)).toBe(true);
  });

  it("converts to axial coordinates so neighbours differ by one step", () => {
    const a = toAxial(3, 4);
    for (const [x, y] of neighbours(3, 4)) {
      const b = toAxial(x, y);
      const dq = b.q - a.q;
      const dr = b.r - a.r;
      expect(Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))).toBe(1);
    }
  });
});
