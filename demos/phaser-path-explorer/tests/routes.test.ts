import { describe, expect, it } from "vitest";
import { routes, routeToGraph, withCrossings } from "../src/game/routes.js";
import type { Edge, HexState } from "../src/game/state.js";

const hex = (col: number, row: number, extra: Partial<HexState> = {}): HexState => ({ id: `h:${col},${row}`, col, row, state: "path", ...extra });
const id = (col: number, row: number) => `h:${col},${row}`;
const edge = (a: [number, number], b: [number, number], kind: Edge["kind"] = "LOOSE"): Edge => ({ from: id(...a), to: id(...b), kind });

describe("routes", () => {
  // a thread out of the camp at (3,2) along the row, then bending down-right: (4,2) (5,2) (5,3)... a loose thread
  const tiles = new Map(
    [hex(3, 2, { anchor: true }), hex(4, 2), hex(5, 2), hex(5, 3), hex(6, 3)].map((h) => [h.id, h]),
  );
  const thread: Edge[] = [edge([3, 2], [4, 2]), edge([4, 2], [5, 2]), edge([5, 2], [5, 3]), edge([5, 3], [6, 3])];

  it("runs one route from the source to the explorer, passing through every hex between", () => {
    const { routes: found, ends } = routes(thread, new Set([id(3, 2), id(6, 3)]), tiles);
    expect(found).toEqual([{ kind: "LOOSE", from: id(3, 2), between: [id(4, 2), id(5, 2), id(5, 3)], to: id(6, 3) }]);
    expect(ends.size).toBe(0);
  });

  it("splits at a marked hex in the middle (the explorer walked back onto the path)", () => {
    const { routes: found } = routes(thread, new Set([id(3, 2), id(5, 2), id(6, 3)]), tiles);
    expect(found.map((r) => [r.from, r.between, r.to])).toEqual([
      [id(3, 2), [id(4, 2)], id(5, 2)],
      [id(5, 2), [id(5, 3)], id(6, 3)],
    ]);
  });

  it("ends a route where the thread ends, and reports that hex so it can be marked", () => {
    const { routes: found, ends } = routes(thread, new Set([id(3, 2)]), tiles); // the head is not marked
    expect(found).toHaveLength(1);
    expect(found[0]!.to).toBe(id(6, 3));
    expect([...ends]).toEqual([id(6, 3)]);
  });

  it("draws a loose thread through several hexes as one wavy line along the route, ending in an arrowhead", () => {
    const { routes: found } = routes(thread, new Set([id(3, 2), id(6, 3)]), tiles);
    const g = routeToGraph(found[0]!, tiles);
    expect(g.pieces).toEqual([]); // a thread still being extended has no elbows
    expect(g.waves).toHaveLength(1);
    // the body: the edge of the source's ring, the centre of every hex between, and the edge the head starts from
    expect(g.waves[0]).toHaveLength(3 + 2);
    expect(g.edges).toEqual([{ from: [5, 3], to: id(6, 3), form: "->" }]);
  });

  it("starts the wavy line at the edge of the source's ring, not at its centre", () => {
    const { routes: found } = routes(thread, new Set([id(3, 2), id(6, 3)]), tiles);
    const [start] = routeToGraph(found[0]!, tiles, 8).waves[0]!;
    const centre = [3 * 16 + 8, 2 * 14 + 8.5];
    expect(Math.hypot(start![0] - centre[0]!, start![1] - centre[1]!)).toBeCloseTo(5, 6);
  });

  it("is the design system's wavy arrow when the thread's source and head are neighbours", () => {
    const g = routeToGraph({ kind: "LOOSE", from: id(3, 2), between: [], to: id(4, 2) }, tiles);
    expect(g.pieces).toEqual([]);
    expect(g.waves).toEqual([]);
    expect(g.edges).toEqual([{ from: id(3, 2), to: id(4, 2), form: "~>" }]);
  });

  it("straightens once secured: a straight route of connectors and elbows, with a plain arrow at each end", () => {
    const { routes: found } = routes(thread.map((e) => ({ ...e, kind: "SECURED" as const })), new Set([id(3, 2), id(6, 3)]), tiles);
    const g = routeToGraph(found[0]!, tiles);
    expect(g.waves).toEqual([]);
    expect(g.pieces).toHaveLength(3);
    expect(g.pieces[0]!.ends.slice().sort()).toEqual(["e", "w"]); // (4,2): the route runs on, a straight connector
    expect(g.pieces[1]!.ends).toContain("w");
    expect(["se", "sw"]).toContain(g.pieces[1]!.ends[1]); // (5,2): it turns down, an elbow
    expect(g.pieces.every((p) => p.shaft === "line")).toBe(true); // no double stroke
    expect(g.edges).toEqual([
      { from: id(3, 2), to: [4, 2], form: "-" },
      { from: [5, 3], to: id(6, 3), form: "->" },
    ]);
  });

  it("is a plain arrow when a secured path joins neighbours", () => {
    const g = routeToGraph({ kind: "SECURED", from: id(3, 2), between: [], to: id(4, 2) }, tiles);
    expect(g.edges).toEqual([{ from: id(3, 2), to: id(4, 2), form: "->" }]);
  });
});

describe("crossings", () => {
  // a secured path along a row through (4,2), and a loose thread through (4,2) on the other diagonal
  const ts = new Map(
    [hex(3, 2, { anchor: true }), hex(4, 2), hex(5, 2, { anchor: true }), hex(3, 1, { anchor: true }), hex(4, 3)].map((h) => [h.id, h]),
  );
  const crossing: Edge[] = [
    edge([3, 2], [4, 2], "SECURED"),
    edge([4, 2], [5, 2], "SECURED"),
    edge([3, 1], [4, 2], "LOOSE"),
    edge([4, 2], [4, 3], "LOOSE"),
  ];
  const marked = new Set([id(3, 2), id(5, 2), id(3, 1), id(4, 3)]);

  it("sends each route straight through the shared hex, by its own kind", () => {
    const { routes: found, ends } = routes(crossing, marked, ts);
    expect(ends.size).toBe(0);
    const byKind = Object.fromEntries(found.map((r) => [r.kind, r]));
    expect(byKind["SECURED"]).toEqual({ kind: "SECURED", from: id(3, 2), between: [id(4, 2)], to: id(5, 2) });
    expect(byKind["LOOSE"]).toEqual({ kind: "LOOSE", from: id(3, 1), between: [id(4, 2)], to: id(4, 3) });
  });

  it("draws a loose thread crossing a path as a wave over the path's piece", () => {
    const { routes: found } = routes(crossing, marked, ts);
    const drawn = found.map((r) => routeToGraph(r, ts));
    expect(drawn.flatMap((d) => d.pieces)).toHaveLength(1); // only the secured path has a piece in the shared hex
    expect(drawn.flatMap((d) => d.waves)).toHaveLength(1); // the thread is a wavy line, laid over it
  });

  it("draws two secured paths crossing as one bridge", () => {
    const both: Edge[] = [
      edge([3, 2], [4, 2], "SECURED"),
      edge([4, 2], [5, 2], "SECURED"),
      edge([3, 1], [4, 2], "SECURED"),
      edge([4, 2], [4, 3], "SECURED"),
    ];
    const { routes: found } = routes(both, marked, ts);
    const pieces = found.flatMap((r) => routeToGraph(r, ts).pieces);
    expect(pieces).toHaveLength(2);
    const merged = withCrossings(pieces);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ col: 4, row: 2, style: "bridge" });
    expect((merged[0] as { cross: string[] }).cross.slice().sort()).toEqual(["ew", "nwse"]);
  });

  it("pairs the edges by the far side when both routes are secured", () => {
    const both: Edge[] = [
      edge([3, 2], [4, 2], "SECURED"),
      edge([4, 2], [5, 2], "SECURED"),
      edge([3, 1], [4, 2], "SECURED"),
      edge([4, 2], [4, 3], "SECURED"),
    ];
    const { routes: found } = routes(both, marked, ts);
    const pairs = found.map((r) => `${r.from}>${r.between.join(",")}>${r.to}`).sort();
    expect(pairs).toEqual([`${id(3, 1)}>${id(4, 2)}>${id(4, 3)}`, `${id(3, 2)}>${id(4, 2)}>${id(5, 2)}`].sort());
  });

  it("leaves bending pieces to overlap rather than merging them", () => {
    const bend = (ends: [string, string]) => ({ col: 4, row: 2, ends: ends as never, shaft: "line" as const });
    expect(withCrossings([bend(["w", "e"]), bend(["e", "se"])])).toHaveLength(2);
    expect(withCrossings([bend(["w", "e"]), bend(["e", "w"])])).toHaveLength(2); // the same axis
  });
});
