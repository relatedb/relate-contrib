import { describe, expect, it } from "vitest";
import { softenCorners, wavePolyline, tileCentre, type Point } from "../src/hex/core/index.js";

const route: Point[] = [tileCentre(3, 4), tileCentre(4, 4), tileCentre(5, 4), tileCentre(5, 5), tileCentre(6, 5)];

describe("wavy route", () => {
  it("starts and ends exactly on the route's end points", () => {
    const w = wavePolyline(route);
    expect(w[0]).toBeCloseTo(route[0]![0], 9);
    expect(w[1]).toBeCloseTo(route[0]![1], 9);
    expect(w[w.length - 2]).toBeCloseTo(route[route.length - 1]![0], 9);
    expect(w[w.length - 1]).toBeCloseTo(route[route.length - 1]![1], 9);
  });

  it("never strays further from the (softened) route than its amplitude", () => {
    const amplitude = 1.2;
    const w = wavePolyline(route, { amplitude });
    const base = softenCorners(route);
    for (let i = 0; i < w.length; i += 2) {
      let best = Infinity;
      for (let j = 0; j < base.length - 1; j++) {
        const [ax, ay] = base[j]!;
        const [bx, by] = base[j + 1]!;
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((w[i]! - ax) * dx + (w[i + 1]! - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(w[i]! - (ax + dx * t), w[i + 1]! - (ay + dy * t)));
      }
      expect(best).toBeLessThanOrEqual(amplitude + 1e-6);
    }
  });

  it("is continuous: no sample jumps further than the spacing allows, even at the corners", () => {
    const w = wavePolyline(route, { step: 0.25, amplitude: 1.2 });
    for (let i = 2; i < w.length; i += 2) expect(Math.hypot(w[i]! - w[i - 2]!, w[i + 1]! - w[i - 1]!)).toBeLessThan(0.9);
  });

  it("does wave in the middle: it leaves the centreline somewhere", () => {
    const w = wavePolyline([[0, 0], [30, 0]]);
    const maxY = Math.max(...w.filter((_, i) => i % 2 === 1).map(Math.abs));
    expect(maxY).toBeGreaterThan(1.1);
  });

  it("softens corners without moving the end points", () => {
    const s = softenCorners([[0, 0], [10, 0], [10, 10]]);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([10, 10]);
    expect(s.length).toBeGreaterThan(3);
    // the sharp corner at (10, 0) is cut
    expect(s.some(([x, y]) => x === 10 && y === 0)).toBe(false);
  });
});
