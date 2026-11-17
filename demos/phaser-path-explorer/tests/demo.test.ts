import { describe, expect, it } from "vitest";
import { within, wanderStep, type Pos } from "../src/demo.js";
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
