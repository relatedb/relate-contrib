import { describe, expect, it } from "vitest";
import { PART_CELLS, robotCells, robotSlot } from "../src/game/robot.js";
import { PARTS } from "../src/game/score.js";

describe("the robot along the bottom row", () => {
  it("has art for every part, inside its 16 by 16 sprite", () => {
    for (const part of PARTS) {
      expect(PART_CELLS[part].length, part).toBeGreaterThan(0);
      for (const [x, y] of PART_CELLS[part]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(16);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(16);
      }
    }
  });

  it("grows by one part at a time, and the power lights the eyes", () => {
    expect(robotCells(0)).toEqual([]);
    for (let n = 1; n <= PARTS.length; n++) expect(robotCells(n).length).toBeGreaterThanOrEqual(robotCells(n - 1).length);
    const eye = (n: number) => robotCells(n).find(([x, y]) => x === 5 && y === 4)?.[2];
    expect(eye(1)).toBe("C"); // the bare face
    expect(eye(2)).toBe("g"); // a dead eye
    expect(eye(7)).toBe("Y"); // lit
  });

  it("hops an even four tiles a day across a 25 wide board, left to right", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => robotSlot(d, 25))).toEqual([0, 4, 8, 12, 16, 20, 24]);
  });
});
