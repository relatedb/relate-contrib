import { describe, expect, it } from "vitest";
import { fleeStep, hexDistance, placeRobots, within, wanderStep, type Pos } from "../src/demo.js";
import { generateRows, COLS, ROWS } from "../src/game/world.js";
import { neighbours, sideTo, type Side } from "../src/hex/core/index.js";

const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe("demo lantern", () => {
  it("lights 1, 7 and 19 hexes at radius 0, 1 and 2 in the open, and stays on the board", () => {
    expect(within([10, 10], 0, COLS, ROWS)).toHaveLength(1);
    expect(within([10, 10], 1, COLS, ROWS)).toHaveLength(7);
    expect(within([10, 10], 2, COLS, ROWS)).toHaveLength(19);
    for (const [c, r] of within([0, 0], 3, COLS, ROWS)) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(r).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("demo wanderer", () => {
  const rows = generateRows("first-light");

  it("only ever steps to a neighbouring hex of dry land", () => {
    const rand = lcg(7);
    let at: Pos = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
    for (let i = 0; i < 400; i++) {
      const next = wanderStep(rows, at, undefined, rand);
      expect(next).toBeDefined();
      expect(neighbours(at[0], at[1]).some(([c, r]) => c === next![0] && r === next![1])).toBe(true);
      expect("Dw".includes(rows[next![1]]![next![0]]!)).toBe(false);
      at = next!;
    }
  });

  it("wanders widely, and does not turn straight back when it can go on", () => {
    const rand = lcg(11);
    let at: Pos = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
    let heading: Side | undefined;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const next = wanderStep(rows, at, heading, rand)!;
      seen.add(`${next[0]},${next[1]}`);
      heading = sideTo({ col: at[0], row: at[1] }, { col: next[0], row: next[1] });
      at = next;
    }
    expect(seen.size).toBeGreaterThan(40);
  });

  it("stays put when it is boxed in by water", () => {
    const sea = Array.from({ length: 5 }, () => "wwwww");
    expect(wanderStep(sea, [2, 2], undefined, Math.random)).toBeUndefined();
  });
});

describe("demo robots", () => {
  const rows = generateRows("first-light");
  const rand = () => 0.5;

  it("measures distance in hex steps", () => {
    expect(hexDistance([5, 5], [5, 5])).toBe(0);
    for (const [c, r] of neighbours(5, 5)) expect(hexDistance([5, 5], [c, r])).toBe(1);
    expect(hexDistance([3, 4], [9, 4])).toBe(6);
    expect(hexDistance([3, 4], [9, 4])).toBe(hexDistance([9, 4], [3, 4]));
  });

  it("starts the robots on dry land, well away from the explorer", () => {
    const start: Pos = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
    const robots = placeRobots(rows, start, 3, 6, lcg(3));
    expect(robots).toHaveLength(3);
    for (const [c, r] of robots) {
      expect("Dw".includes(rows[r]![c]!)).toBe(false);
      expect(hexDistance([c, r], start)).toBeGreaterThanOrEqual(6);
    }
  });

  it("runs from a robot: each flee step ends no nearer to it than a stay would, and never on it", () => {
    const grass = Array.from({ length: 9 }, () => "g".repeat(9));
    const at: Pos = [4, 4];
    const threat: Pos = neighbours(4, 4)[1]!;
    const next = fleeStep(grass, at, [threat], rand)!;
    expect(hexDistance(next, threat)).toBeGreaterThan(hexDistance(at, threat));
    expect(`${next}`).not.toBe(`${threat}`);
  });

  it("shies from where it was frightened", () => {
    const grass = Array.from({ length: 15 }, () => "g".repeat(15));
    const at: Pos = [7, 7];
    const shy: Pos[] = [[11, 7]];
    const r = lcg(5);
    let towards = 0;
    for (let i = 0; i < 400; i++) {
      const n = wanderStep(grass, at, undefined, r, shy)!;
      if (hexDistance(n, shy[0]!) < hexDistance(at, shy[0]!)) towards++;
    }
    // without shying about half the six steps go nearer; with it, far fewer
    expect(towards / 400).toBeLessThan(0.3);
  });
});
