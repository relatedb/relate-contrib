// The hex elbow and straight connector against the design system's own HexElbow, and the arc sampling that draws it.
import { describe, expect, it } from "vitest";
import golden from "./fixtures/hexelbow-golden.json";
import { elbowPath, neighbours, pathPolylines, sideTo, SIDE_VECTORS, tileCentre, type Side } from "../src/hex/core/index.js";

describe("hex elbows match the design system's HexElbow", () => {
  const cases = golden.cases as unknown as { ends: [Side, Side]; shaft: "line" | "double"; radius: number; expected: { d: string } }[];
  it("covers every ordered pair of sides, both shafts, sharp and rounded", () => {
    expect(cases).toHaveLength(6 * 5 * 2 * 2);
  });
  it("produces the same path text for every one", () => {
    for (const c of cases) expect(elbowPath(c.ends, 0.8, c.shaft, c.radius), `${c.ends} ${c.shaft} r${c.radius}`).toBe(c.expected.d);
  });
});

describe("sides", () => {
  it("names the side a neighbour lies on, from either row parity, and its midpoint is half way to the neighbour's centre", () => {
    for (const [col, row] of [[4, 4], [4, 5]] as const) {
      for (const [c, r] of neighbours(col, row)) {
        const side = sideTo({ col, row }, { col: c, row: r });
        const [cx, cy] = tileCentre(col, row);
        const [nx, ny] = tileCentre(c, r);
        expect((nx - cx) / 2, `${col},${row} -> ${c},${r}`).toBeCloseTo(SIDE_VECTORS[side][0], 9);
        expect((ny - cy) / 2).toBeCloseTo(SIDE_VECTORS[side][1], 9);
      }
    }
  });
  it("refuses a hex that is not a neighbour", () => {
    expect(() => sideTo({ col: 1, row: 1 }, { col: 5, row: 5 })).toThrow();
  });
});

describe("arcs in path text", () => {
  it("samples a circular arc: every point on the circle, ends exact, bulging the way the sweep flag says", () => {
    // from (0,0) to (5,5), radius 5, sweep 1 (clockwise on screen): the centre is (0,5)
    const [line] = pathPolylines("M0 0A5 5 0 0 1 5 5", 20);
    for (let i = 0; i < line!.length; i += 2) expect(Math.hypot(line![i]! - 0, line![i + 1]! - 5)).toBeCloseTo(5, 6);
    expect(line!.slice(-2)).toEqual([5, 5]);
    const mid = [line![20]!, line![21]!]; // the middle sample: the start point, then samples 1..20, so sample 10 is at 2 + 9 * 2
    expect(mid[0]).toBeCloseTo(5 * Math.cos(-Math.PI / 4), 6);
    expect(mid[1]).toBeCloseTo(5 + 5 * Math.sin(-Math.PI / 4), 6);
    // sweep 0 mirrors it: the centre is (5,0)
    const [back] = pathPolylines("M0 0A5 5 0 0 0 5 5", 20);
    for (let i = 0; i < back!.length; i += 2) expect(Math.hypot(back![i]! - 5, back![i + 1]! - 0)).toBeCloseTo(5, 6);
  });
});

import crossGolden from "./fixtures/hexcross-golden.json";
import { axisOf, crossGeom, type Axis, type CrossStyle } from "../src/hex/core/index.js";

describe("hex crossings match the design system's HexCross", () => {
  const cases = crossGolden.cases as unknown as {
    axes: Axis[];
    style: CrossStyle;
    over?: Axis;
    expected: { d: string; dots: number[][] };
  }[];
  it("covers plain, junction, bridge and hop, both ways over, and three strokes", () => {
    expect(cases).toHaveLength(6 * 4 * 2 + 2);
  });
  it("produces the same path text and dots for every one", () => {
    for (const c of cases) {
      const g = crossGeom(c.axes, c.style, c.over, 0.8);
      expect(g.d, `${c.axes} ${c.style} over ${c.over}`).toBe(c.expected.d);
      expect(g.dots, `${c.axes} ${c.style} dots`).toEqual(c.expected.dots);
    }
  });
  it("names the axis of a straight piece, either way round, and none for a bend", () => {
    expect(axisOf(["w", "e"])).toBe("ew");
    expect(axisOf(["e", "w"])).toBe("ew");
    expect(axisOf(["se", "nw"])).toBe("nwse");
    expect(axisOf(["ne", "sw"])).toBe("nesw");
    expect(axisOf(["e", "se"])).toBeUndefined();
  });
});

import { neighbourAt, oppositeSide, SIDES_CLOCKWISE, turnSide } from "../src/hex/core/index.js";

describe("facing helpers", () => {
  it("turns through the six sides clockwise on screen and back", () => {
    expect(SIDES_CLOCKWISE).toEqual(["e", "se", "sw", "w", "nw", "ne"]);
    expect(turnSide("e", 1)).toBe("se");
    expect(turnSide("e", -1)).toBe("ne");
    expect(turnSide("ne", 1)).toBe("e");
    expect(turnSide("w", 6)).toBe("w");
    expect(turnSide("sw", -9)).toBe("ne");
  });
  it("has an opposite for each side", () => {
    for (const s of SIDES_CLOCKWISE) expect(oppositeSide(oppositeSide(s))).toBe(s);
    expect(oppositeSide("e")).toBe("w");
    expect(oppositeSide("nw")).toBe("se");
  });
  it("finds the neighbour on a side, the inverse of sideTo, from either row parity", () => {
    for (const from of [{ col: 4, row: 4 }, { col: 4, row: 5 }, { col: 0, row: 0 }]) {
      for (const side of SIDES_CLOCKWISE) expect(sideTo(from, neighbourAt(from, side))).toBe(side);
    }
  });
});
