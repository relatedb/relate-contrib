// The arrow notation and the hex graph overlay against what the design system's own Arrow and HexGraph produce.
import { describe, expect, it } from "vitest";
import arrowGolden from "./fixtures/arrow-golden.json";
import graphGolden from "./fixtures/hexgraph-golden.json";
import {
  arrowGeometry,
  layoutLink,
  linkTransform,
  pathPolylines,
  placeLink,
  placeNode,
  type GraphEdge,
  type GraphNode,
} from "../src/hex/core/index.js";

describe("arrow notation matches the design system's arrowGeometry", () => {
  for (const c of arrowGolden.cases as unknown as { form: string; sw: number; expected: { W: number; d: string; dots: number[][] } }[]) {
    it(`${c.form} at weight ${c.sw}`, () => {
      const g = arrowGeometry(c.form, c.sw);
      expect(g.W).toBe(c.expected.W);
      expect(g.d).toBe(c.expected.d);
      expect(g.dots).toEqual(c.expected.dots);
    });
  }
});

interface GraphCase {
  name: string;
  input: { nodes: GraphNode[]; edges: GraphEdge[]; nodeSize?: number };
  expected: {
    edges: {
      transform: string;
      casing: { d: string; width: number };
      stroke: { d: string; width: number };
      dots: { cx: number; cy: number; r: number }[];
    }[];
    nodes: {
      casing: { cx: number; cy: number; r: number; fill: string };
      node: { cx: number; cy: number; r: number; fill: string; stroke: string; strokeWidth: number };
    }[];
  };
}

const colour = (css: string) => css.replace(/^var\(--neo-/, "").replace(/\)$/, "");

describe("hex graph overlay matches the design system's HexGraph", () => {
  for (const c of graphGolden.cases as unknown as GraphCase[]) {
    describe(c.name, () => {
      const byId = new Map(c.input.nodes.map((n) => [n.id, n]));
      const opts = c.input.nodeSize ? { nodeSize: c.input.nodeSize } : {};

      it("lays out every link where and how the design system does", () => {
        const layouts = c.input.edges.map((e) => layoutLink(e, byId, opts)).filter((l) => l !== null);
        expect(layouts).toHaveLength(c.expected.edges.length);
        layouts.forEach((l, i) => {
          const want = c.expected.edges[i]!;
          expect(linkTransform(l), `edge ${i} transform`).toBe(want.transform);
          expect(l.d, `edge ${i} path`).toBe(want.stroke.d);
          const placed = placeLink(l, 0.5);
          // the design system draws widths in arrow units and scales them by k
          expect(placed.stroke.width, `edge ${i} width`).toBeCloseTo(want.stroke.width * l.k, 9);
          expect(placed.casing!.width, `edge ${i} casing`).toBeCloseTo(want.casing.width * l.k, 9);
          expect(l.dots.length).toBe(want.dots.length / 2); // one casing dot and one stroke dot each
        });
      });

      it("places every node as the design system does: casing, fill and stroke", () => {
        c.input.nodes.forEach((n, i) => {
          const want = c.expected.nodes[i]!;
          const p = placeNode(n, opts);
          expect(p.cx).toBe(want.node.cx);
          expect(p.cy).toBe(want.node.cy);
          expect(p.r).toBe(want.node.r);
          expect(p.casingR).toBe(want.casing.r);
          expect(p.strokeWidth).toBe(want.node.strokeWidth);
          expect(p.fill).toBe(colour(want.node.fill));
          expect(p.stroke).toBe(colour(want.node.stroke));
        });
      });
    });
  }
});

describe("path polylines", () => {
  it("turns M, H, V, L and Q into straight pieces that end where the path ends", () => {
    const lines = pathPolylines("M0 32H57.9M28 2L57.9 32L28 61.8M0 10Q8 0 16 10");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual([0, 32, 57.9, 32]);
    expect(lines[1]).toEqual([28, 2, 57.9, 32, 28, 61.8]);
    expect(lines[2]!.slice(-2)).toEqual([16, 10]);
    expect(lines[2]!.length).toBeGreaterThan(10); // the curve was sampled
  });
});
