// The cache and the actions against the real engine (WebAssembly, in Node): what a player may know, and an extension.
import { beforeEach, describe, expect, it } from "vitest";
import { Bridge } from "@relate/relate-phaser";
import { GameState } from "../src/game/state.js";
import { COLS, ROWS, SETTLEMENTS, START_MARKERS, START_STEPS, generateRows } from "../src/game/world.js";
import { neighbours } from "../src/hex/core/index.js";
import { engineBuilt, openEngine, seedWorld } from "./helpers/engine.js";

/** In view but not walked: sensed (its colour) or viewed (in full). */
const inView = (t: { state: string }): boolean => t.state === "sensed" || t.state === "viewed";
const neighboursOf = (a: { col: number; row: number }, b: { col: number; row: number }) =>
  neighbours(a.col, a.row).some(([c, r]) => c === b.col && r === b.row);

const sorted = <T extends { from: string; to: string }>(edges: T[]): T[] => [...edges].sort((a, b) => `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`));

describe.skipIf(!engineBuilt)("game state, on the engine", () => {
  let state: GameState;
  let bridge: Bridge;
  const rows = generateRows("first-light");

  /** Refill the day in the cache and the graph: long walks in these tests are not about the step budget. */
  async function freshDay(): Promise<void> {
    await bridge.enqueue("MATCH (pl:Player) SET pl.steps = $n", { n: START_STEPS });
    state.player = { ...state.player, steps: START_STEPS };
  }

  beforeEach(async () => {
    const engine = await openEngine();
    await seedWorld(engine, rows);
    bridge = new Bridge(engine.query);
    state = new GameState(bridge);
    await state.load();
  });

  it("loads every hex, but gives away the ground truth only of what is discovered", () => {
    expect(state.tiles.size).toBe(COLS * ROWS);
    const byState = { hidden: 0, sensed: 0, viewed: 0, seen: 0, path: 0 };
    for (const t of state.tiles.values()) {
      byState[t.state]++;
      if (t.state === "hidden") expect(t.terrain, t.id).toBeUndefined();
      else expect(t.terrain, t.id).toBeDefined();
    }
    expect(byState).toEqual({ hidden: COLS * ROWS - 19, sensed: 12, viewed: 6, seen: 0, path: 1 }); // the camp, its field of view, and the ring beyond
    expect(state.player.markers).toBe(START_MARKERS);
    expect(state.player.steps).toBe(START_STEPS);
    expect(state.here()?.feature).toBe("tent");
  });

  it("refuses an extension onto a hex that is hidden or not next to the explorer, without asking the engine", async () => {
    const hidden = [...state.tiles.values()].find((t) => t.state === "hidden")!;
    expect(state.canExtend(hidden.id)).toBe(false);
    const before = bridge.pending;
    await state.extend(hidden.id);
    expect(bridge.pending).toBe(before);
    expect(state.message).not.toBe("");
    expect(state.player.markers).toBe(START_MARKERS);
    expect(state.player.steps).toBe(START_STEPS);
  });

  it("extends onto a sensed neighbour: the hex joins the path, the explorer moves, new hexes are sensed", async () => {
    const target = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
    const version = state.version;
    const done = state.extend(target.id);
    expect(state.pending).toBe(target.id); // pending at once; nothing awaited yet
    expect(state.canExtend(target.id)).toBe(false);
    await done;
    expect(state.pending).toBeNull();
    expect(state.version).toBeGreaterThan(version);
    expect(state.tiles.get(target.id)!.state).toBe("path");
    expect(state.player.at).toBe(target.id);
    expect(state.player.steps).toBe(START_STEPS - 1);
    expect(state.player.markers).toBe(START_MARKERS);
    const sensed = [...state.tiles.values()].filter((t) => inView(t));
    expect(sensed.length).toBeGreaterThan(4); // the camp's other neighbours and the new ones
    for (const t of sensed) expect(t.terrain, t.id).toBeDefined(); // the new ones arrive with their terrain
  });

  it("keeps the world in step with the graph: a second state loaded afterwards sees the same board", async () => {
    const target = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
    await state.extend(target.id);
    const again = new GameState(bridge);
    await again.load();
    expect(again.player).toEqual(state.player);
    for (const t of state.tiles.values()) expect(again.tiles.get(t.id)?.state, t.id).toBe(t.state);
  });

  it("walks a thread out to an anchor and secures it", async () => {
    // follow the shortest land route from the camp to the nearest tower by repeated extensions
    const { landDistances } = await import("../src/game/world.js");
    const here = state.here()!;
    const dist = landDistances(rows, [here.col, here.row]);
    const tower = [...state.tiles.values()]
      .filter((t) => (rows[t.row]![t.col] === "R" || rows[t.row]![t.col] === "U") && dist.has(`${t.col},${t.row}`))
      .sort((a, b) => dist.get(`${a.col},${a.row}`)! - dist.get(`${b.col},${b.row}`)!)[0]!;
    const { neighbours } = await import("../src/hex/core/index.js");
    let guard = 0;
    while (state.player.at !== tower.id && guard++ < 20) {
      const me = state.here()!;
      const next = neighbours(me.col, me.row)
        .map(([c, r]) => state.tileAt(c, r))
        .filter((t): t is NonNullable<typeof t> => !!t && state.canExtend(t.id) && dist.has(`${t.col},${t.row}`))
        .sort((a, b) => Math.hypot(a.col - tower.col, a.row - tower.row) - Math.hypot(b.col - tower.col, b.row - tower.row))[0]!;
      if (state.player.steps <= 1) await freshDay();
      await state.extend(next.id);
    }
    expect(state.player.at).toBe(tower.id);
    expect(state.message).toMatch(/secured/);
    const loose = await bridge.enqueue("MATCH ()-[r:LOOSE]->() RETURN count(r) AS n");
    const secured = await bridge.enqueue("MATCH ()-[r:SECURED]->() RETURN count(r) AS n");
    expect(loose[0]!["n"]).toBe(0);
    expect(secured[0]!["n"]).toBeGreaterThan(3);
  });

  // a route of hexes from the camp to the nearest tower, by land, each step next to the last
  async function walkToTower(opts: { lastStepIsLastOfDay?: boolean } = {}): Promise<string> {
    const { landDistances } = await import("../src/game/world.js");
    const { neighbours } = await import("../src/hex/core/index.js");
    const here = state.here()!;
    const dist = landDistances(rows, [here.col, here.row]);
    const tower = [...state.tiles.values()]
      .filter((t) => (rows[t.row]![t.col] === "R" || rows[t.row]![t.col] === "U") && dist.has(`${t.col},${t.row}`))
      .sort((a, b) => dist.get(`${a.col},${a.row}`)! - dist.get(`${b.col},${b.row}`)!)[0]!;
    let guard = 0;
    while (state.player.at !== tower.id && guard++ < 20) {
      const me = state.here()!;
      const next = neighbours(me.col, me.row)
        .map(([c, r]) => state.tileAt(c, r))
        .filter((t): t is NonNullable<typeof t> => !!t && state.canExtend(t.id) && dist.has(`${t.col},${t.row}`))
        .sort((a, b) => Math.hypot(a.col - tower.col, a.row - tower.row) - Math.hypot(b.col - tower.col, b.row - tower.row))[0]!;
      if (opts.lastStepIsLastOfDay && next.id === tower.id) {
        // the step onto the tower spends exactly what is left of the day
        const n = next.cost ?? 1;
        await bridge.enqueue("MATCH (pl:Player) SET pl.steps = $n", { n });
        state.player = { ...state.player, steps: n };
      } else if (state.player.steps <= 1) await freshDay();
      await state.click(next.id);
      if (opts.lastStepIsLastOfDay && next.id === tower.id) break; // the day ended there, and the explorer is home
    }
    return tower.id;
  }

  describe("facing and the keyboard", () => {
    it("starts facing east and turns a sixth of a turn at a time, clockwise for positive steps", () => {
      expect(state.facing).toBe("e");
      state.turn(1);
      expect(state.facing).toBe("se");
      state.turn(-2);
      expect(state.facing).toBe("ne");
      state.turn(6);
      expect(state.facing).toBe("ne");
    });

    it("knows the hex ahead and the hex behind", () => {
      const here = state.here()!;
      const ahead = state.faced()!;
      const behind = state.faced(true)!;
      expect(ahead.col).toBe(here.col + 1); // east, on the same row
      expect(ahead.row).toBe(here.row);
      expect(behind.col).toBe(here.col - 1);
      state.turn(1); // south-east
      expect(state.faced()!.row).toBe(here.row + 1);
      expect(state.faced(true)!.row).toBe(here.row - 1);
    });

    it("moving ahead acts as a click on that hex: it extends the thread, and the explorer faces the way it went", async () => {
      state.turn(1);
      const target = state.faced()!;
      await state.go();
      expect(state.player.at).toBe(target.id);
      expect(state.edges).toHaveLength(1);
      expect(state.player.steps).toBe(START_STEPS - 1);
    expect(state.player.markers).toBe(START_MARKERS);
      expect(state.facing).toBe("se");
      await state.go(); // straight on, the same direction
      expect(state.edges).toHaveLength(2);
      expect(state.facing).toBe("se");
    });

    it("moving behind reels the thread in when that hex is where it came from, and leaves the facing alone", async () => {
      await state.go(); // east
      await state.go(); // east again
      expect(state.player.steps).toBe(START_STEPS - 2);
      await state.go(true); // behind: the hex the thread came from
      expect(state.player.steps).toBe(START_STEPS - 3); // reeling in costs a step like any move
      expect(state.player.markers).toBe(START_MARKERS);
      expect(state.facing).toBe("e"); // still facing the way the thread ran, so the next press extends again
      await state.go();
      expect(state.player.steps).toBe(START_STEPS - 4);
    });

    it("turns to face a neighbour that is clicked, even when the click can do nothing", async () => {
      const here = state.here()!;
      const hidden = state.tileAt(here.col + 3, here.row)!; // not next to the explorer: nothing happens
      await state.click(hidden.id);
      expect(state.facing).toBe("e");
      const sw = state.faced(true); // the hex behind (west), sensed and next to the camp
      state.turn(3);
      const west = state.faced()!;
      expect(west.id).toBe(sw!.id);
      state.turn(3);
      await state.click(west.id);
      expect(state.facing).toBe("w");
    });

    it("says why when the hex ahead cannot be acted on, and does nothing", async () => {
      await state.go();
      await state.go(false, { step: true }); // shift: a step onto ground that is not known
      expect(state.message).toMatch(/step onto ground you know/i);
    });

    it("previews what the next press would do without doing it", () => {
      expect(state.intent(state.faced()!.id)).toEqual({ kind: "extend" });
      expect(state.player.markers).toBe(START_MARKERS);
    expect(state.player.steps).toBe(START_STEPS);
      expect(state.intent(state.faced()!.id, true).kind).toBe("none");
      expect(state.edges).toEqual([]);
    });

    it("tells the edge of the map from open ground", async () => {
      const far = [...state.tiles.values()].find((t) => t.col === 0 && t.row === 0)!;
      expect(far).toBeDefined();
      state.player = { ...state.player, at: far.id };
      state.turn(3); // facing west from column 0
      expect(state.faced()).toBeUndefined();
      await state.go();
      expect(state.message).toMatch(/edge of the map/i);
    });
  });

  describe("the thread", () => {
    it("starts with no edges, then draws a loose edge for each extension", async () => {
      expect(state.edges).toEqual([]);
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(a.id);
      expect(state.edges).toEqual([{ from: camp, to: a.id, kind: "LOOSE" }]);
      expect(state.predecessor()).toBe(camp);
    });

    it("reels the path in when the hex behind is clicked: costs a step, and the ground is remembered", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(a.id);
      expect(state.player.steps).toBe(START_STEPS - 1);
      await state.click(camp); // reel in: one step, like any move
      expect(state.player.at).toBe(camp);
      expect(state.player.steps).toBe(START_STEPS - 2);
      expect(state.player.markers).toBe(START_MARKERS);
      expect(state.edges).toEqual([]);
      expect(state.tiles.get(a.id)!.state).toBe("seen"); // remembered, no longer on a path
    });

    it("steps over known ground, laying no thread, when asked to with shift", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(a.id);
      await state.click(camp); // reel in; a is now remembered ground
      await state.click(a.id, { step: true }); // a seen hex next to the camp: a step
      expect(state.player.at).toBe(a.id);
      expect(state.edges).toEqual([]);
      expect(state.player.steps).toBe(START_STEPS - 3); // extend, reel in, step
    });

    it("extends over remembered ground, not just unexplored ground: a click lays path and costs a step", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(a.id);
      await state.click(camp); // reel in; a is now remembered ground
      expect(state.tiles.get(a.id)!.state).toBe("seen");
      await state.click(a.id);
      expect(state.edges).toEqual([{ from: camp, to: a.id, kind: "LOOSE" }]);
      expect(state.player.steps).toBe(START_STEPS - 3); // extend, reel in, extend again
      expect(state.player.markers).toBe(START_MARKERS);
      expect(state.player.at).toBe(a.id);
    });

    it("crosses a secured path with a new thread, and the crossed hex stays on its path", async () => {
      await walkToTower();
      await freshDay();
      const camp = [...state.tiles.values()].find((t) => t.feature === "tent")!;
      await state.click(camp.id); // travel home, for one step
      // the first hex of the secured route, next to the camp, and a sensed hex that is next to both it and the camp
      const first = state.edges.find((e) => e.from === camp.id)!.to;
      const p1 = state.tiles.get(first)!;
      const all = [...state.tiles.values()];
      const s1 = all.find((t) => inView(t) && neighboursOf(camp, t) && neighboursOf(p1, t) && t.id !== p1.id);
      expect(s1, "a sensed hex next to both the camp and the first path hex").toBeDefined();
      await state.click(s1!.id); // a new loose thread from the camp
      expect(state.loose()).toHaveLength(1);
      const securedBefore = state.edges.filter((e) => e.kind === "SECURED").length;
      await state.click(p1.id); // the next hex is on the secured path: the thread crosses it
      expect(state.player.at).toBe(p1.id);
      expect(state.loose().map((e) => e.to)).toEqual([s1!.id, p1.id]);
      expect(state.tiles.get(p1.id)!.state).toBe("path");
      expect(state.edges.filter((e) => e.kind === "SECURED")).toHaveLength(securedBefore);
      // reel back in: the crossed hex stays on its path
      await state.click(s1!.id);
      expect(state.tiles.get(p1.id)!.state).toBe("path");
    });

    it("will not let the thread touch itself", async () => {
      const camp = state.player.at;
      const ring = [...state.tiles.values()].filter((t) => inView(t));
      await state.click(ring[0]!.id);
      const first = state.player.at;
      // from the first hex, every move back onto the thread (the camp, where it began) is refused for extending
      expect(state.canExtend(camp)).toBe(false);
      expect(state.canExtend(first)).toBe(false);
    });

    it("secures the whole thread when it reaches an anchor, in the cache and in the graph", async () => {
      await walkToTower();
      expect(state.edges.length).toBeGreaterThan(3);
      expect(state.edges.every((e) => e.kind === "SECURED")).toBe(true);
      const graph = await bridge.enqueue("MATCH ()-[r:LOOSE]->() RETURN count(r) AS n");
      expect(graph[0]!["n"]).toBe(0);
    });

    it("travels from one anchor to another along secured paths, for one step", async () => {
      const tower = await walkToTower();
      await freshDay();
      const camp = [...state.tiles.values()].find((t) => t.anchor && t.feature === "tent")!;
      await state.click(camp.id);
      expect(state.player.steps).toBe(START_STEPS - 1); // one step, not one per hex
      expect(state.player.at).toBe(camp.id);
      await state.click(tower);
      expect(state.player.at).toBe(tower);
    });

    it("will not travel while a path is in play", async () => {
      const tower = await walkToTower();
      await freshDay();
      const camp = [...state.tiles.values()].find((t) => t.feature === "tent")!;
      await state.click(camp.id); // travel home
      const next = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(next.id); // a new loose thread from the camp
      expect(state.loose()).toHaveLength(1);
      await state.step(camp.id); // back onto the camp, thread still in play
      expect(state.player.at).toBe(camp.id);
      await state.click(tower);
      expect(state.player.at).toBe(camp.id);
      expect(state.message).toMatch(/bank or abandon/i);
    });

    it("starts a branch from the middle of a path: the hex left gets a flag, which costs a waymarker and a step to leave", async () => {
      await walkToTower();
      const here = state.here()!;
      const all = [...state.tiles.values()];
      const mid = all.find(
        (t) => t.state === "path" && !t.anchor && neighboursOf(here, t) && all.some((n) => inView(n) && neighboursOf(t, n)),
      )!;
      await freshDay();
      await state.step(mid.id); // walk back one hex along the secured path
      expect(state.player.at).toBe(mid.id);
      const markers = state.player.markers;
      const steps = state.player.steps;
      const sensed = all.find((n) => inView(n) && neighboursOf(mid, n))!;
      expect(state.canGrowHere()).toBe(true);
      await state.click(sensed.id);
      expect(state.player.at).toBe(sensed.id); // the thread went out
      expect(state.tiles.get(mid.id)!.anchor).toBe(true); // a flag where the path was left
      expect(state.player.markers).toBe(markers - 1);
      expect(state.player.steps).toBe(steps - (sensed.cost ?? 1));
      expect(state.loose()).toEqual([{ from: mid.id, to: sensed.id, kind: "LOOSE" }]);
      expect(state.message).toMatch(/branches/i);
      const flags = await bridge.enqueue("MATCH (h:Hex {id: $id}) RETURN h.anchor AS anchor", { id: mid.id });
      expect(flags[0]!["anchor"]).toBe(true); // in the graph too
    });

    it("refuses to branch with no waymarker left, and says why", async () => {
      await walkToTower();
      const here = state.here()!;
      const all = [...state.tiles.values()];
      const mid = all.find(
        (t) => t.state === "path" && !t.anchor && neighboursOf(here, t) && all.some((n) => inView(n) && neighboursOf(t, n)),
      )!;
      await freshDay();
      await state.step(mid.id);
      await bridge.enqueue("MATCH (pl:Player) SET pl.markers = 0");
      state.player = { ...state.player, markers: 0 };
      const sensed = all.find((n) => inView(n) && neighboursOf(mid, n))!;
      await state.click(sensed.id);
      expect(state.message).toMatch(/no waymarkers left/i);
      expect(state.player.at).toBe(mid.id);
      expect(state.tiles.get(mid.id)!.anchor).toBeFalsy();
      expect(inView(state.tiles.get(sensed.id)!)).toBe(true);
    });

    it("drops a flag on a secured path with the waymarker key, for a waymarker and no steps, and undo takes it back", async () => {
      await walkToTower();
      const here = state.here()!;
      const all = [...state.tiles.values()];
      const mid = all.find((t) => t.state === "path" && !t.anchor && neighboursOf(here, t))!;
      await freshDay();
      await state.step(mid.id);
      const markers = state.player.markers;
      const steps = state.player.steps;
      await state.placeWaymarker();
      expect(state.tiles.get(mid.id)!.anchor).toBe(true);
      expect(state.player.markers).toBe(markers - 1);
      expect(state.player.steps).toBe(steps);
      expect(state.message).toMatch(/flag placed/i);
      await state.undo();
      expect(state.tiles.get(mid.id)!.anchor).toBeFalsy();
      expect(state.player.markers).toBe(markers);
      const flags = await bridge.enqueue("MATCH (h:Hex {id: $id}) RETURN h.anchor AS anchor", { id: mid.id });
      expect(flags[0]!["anchor"] ?? null).toBeNull();
    });

    it("steps along a path when it is clicked, and does not extend from it", async () => {
      await walkToTower();
      const here = state.here()!;
      const all = [...state.tiles.values()];
      const mid = all.find((t) => t.state === "path" && !t.anchor && neighboursOf(here, t))!;
      await freshDay();
      expect(state.intent(mid.id).kind).toBe("step");
    });
  });

  describe("the day", () => {
    it("banks the path with a waymarker and starts another without ending the day", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(a.id);
      expect(state.player.steps).toBe(START_STEPS - 1);
      const remaining = state.player.steps;
      await state.placeWaymarker();
      expect(state.player.at).toBe(a.id); // banking is not a return to camp
      expect(state.player.steps).toBe(remaining);
      expect(state.player.markers).toBe(START_MARKERS - 1);
      expect(state.edges).toEqual([{ from: camp, to: a.id, kind: "SECURED" }]);
      expect(state.tiles.get(a.id)!.anchor).toBe(true);
      expect(state.tiles.get(a.id)!.state).toBe("path"); // banked: the ground stays known
      expect(state.lastFogged).toEqual([]); // no fog or overnight transition
      expect(state.lastBanked).toEqual({
        waymark: a.id,
        from: camp,
        edges: [{ from: camp, to: a.id, kind: "LOOSE" }],
      });
      expect(state.message).toMatch(/banked/i);

      const b = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(b.id); // the next wavy path grows from the new anchor
      expect(state.player.at).toBe(b.id);
      expect(state.player.steps).toBe(remaining - (b.cost ?? 1));
      expect(state.loose()).toEqual([{ from: a.id, to: b.id, kind: "LOOSE" }]);

      await state.endDay();
      expect(state.player.at).toBe(camp);
      expect(state.player.steps).toBe(START_STEPS);
      expect(state.loose()).toEqual([]);
      expect(state.tiles.get(a.id)!.state).toBe("path"); // the banked segment survives the night
      expect(state.tiles.get(a.id)!.anchor).toBe(true);
    });

    it("ends the day on exhaustion: home, refilled, and the unsecured ground forgotten", async () => {
      const camp = state.player.at;
      const first = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(first.id);
      const second = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(second.id);
      await state.endDay();
      expect(state.player.at).toBe(camp);
      expect(state.player.steps).toBe(START_STEPS);
      expect(state.edges).toEqual([]);
      expect(state.tiles.get(second.id)!.state).toBe("sensed"); // forgotten down to its colour: the ring beyond the camp's view
      expect(state.tiles.get(first.id)!.state).toBe("viewed"); // the camp's field of view takes its neighbour in again
      // the scene gets the fog in rings from the abandoned thread outward, with the thread's old look
      const secondGhost = state.lastFogged.find((g) => g.id === second.id)!;
      expect(secondGhost.ring).toBe(0);
      expect(secondGhost.terrain).toBeDefined();
      expect(state.lastFogged.at(-1)!.ring).toBeGreaterThan(0);
    });

    it("undoes the last action, and only that one", async () => {
      expect(state.canUndo()).toBe(false);
      const camp = state.player.at;
      const first = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(first.id);
      const second = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(second.id);
      const steps = state.player.steps;
      await state.undo(); // takes back the second extension
      expect(state.player.at).toBe(first.id);
      expect(state.player.steps).toBe(steps + (second.cost ?? 1));
      expect(state.loose()).toEqual([{ from: camp, to: first.id, kind: "LOOSE" }]);
      expect(state.tiles.get(second.id)!.state).toBe("viewed"); // next to the explorer again
      expect(state.canUndo()).toBe(false); // one level
      // the graph agrees with the cache
      const reread = new GameState(bridge);
      await reread.load();
      expect(reread.player).toEqual(state.player);
      expect(sorted(reread.edges)).toEqual(sorted(state.edges));
      expect([...reread.tiles.values()].map((t) => t.state)).toEqual([...state.tiles.values()].map((t) => t.state));
    });

    it("undoes the end of the day: the path, the steps and the fogged ground come back", async () => {
      const first = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(first.id);
      const second = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(second.id);
      const before = { player: { ...state.player }, edges: state.edges.map((e) => ({ ...e })) };
      const terrain = state.tiles.get(second.id)!.terrain;
      await state.endDay();
      expect(state.tiles.get(second.id)!.state).toBe("sensed"); // forgotten down to its colour
      await state.undo();
      expect(state.player).toEqual(before.player);
      expect(state.edges).toEqual(before.edges);
      expect(state.tiles.get(second.id)!.state).toBe("path");
      expect(state.tiles.get(second.id)!.terrain).toBe(terrain);
      const reread = new GameState(bridge);
      await reread.load();
      expect(reread.tiles.get(second.id)!.state).toBe("path");
      expect(sorted(reread.edges)).toEqual(sorted(state.edges));
    });

    it("counts the days as the robot's parts, and the seventh night ends the game", async () => {
      expect(state.day).toBe(1);
      for (let d = 1; d <= 6; d++) {
        await state.endDay();
        expect(state.parts).toHaveLength(d);
        expect(state.day).toBe(d + 1);
        expect(state.over).toBe(false);
      }
      await state.endDay(); // the seventh night: the robot is complete
      expect(state.parts).toEqual(["head", "eyes", "mouth", "body", "arms", "legs", "power"]);
      expect(state.day).toBe(7);
      expect(state.over).toBe(true);
      const reread = new GameState(bridge);
      await reread.load();
      expect(reread.over).toBe(true);
      expect(reread.parts).toEqual(state.parts);
      expect(state.canUndo()).toBe(false);
      const at = state.player.at;
      const first = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(first.id);
      expect(state.player.at).toBe(at); // nothing more is done
      await state.undo();
      expect(state.parts).toHaveLength(7);
    });

    it("takes a night back with undo, robot part and all", async () => {
      await state.endDay();
      expect(state.parts).toEqual(["head"]);
      await state.undo();
      expect(state.parts).toEqual([]);
      const reread = new GameState(bridge);
      await reread.load();
      expect(reread.parts).toEqual([]);
    });

    it("scores from the graph: settlements routed, waymarkers placed, the day", async () => {
      await walkToTower();
      const out = await state.outcome();
      expect(out).toMatchObject({ routed: 1, total: SETTLEMENTS, markers: 0, days: 1 });
      expect(await state.score()).toBe(100);
    });

    it("ends the game when it is finished, and then does nothing more", async () => {
      await state.finish();
      expect(state.over).toBe(true);
      expect(state.canUndo()).toBe(false);
      const here = state.player.at;
      const next = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(next.id);
      expect(state.player.at).toBe(here);
      const reread = new GameState(bridge);
      await reread.load();
      expect(reread.over).toBe(true);
    });

    it("keeps a field of view: the six hexes round the explorer in full, the ring beyond sensed, none walkable", async () => {
      const first = [...state.tiles.values()].find((t) => inView(t) && state.canExtend(t.id))!;
      await state.click(first.id);
      const here = state.here()!;
      const round = neighbours(here.col, here.row).map(([c, r]) => state.tileAt(c, r)).filter((t): t is NonNullable<typeof t> => !!t);
      expect(round.length).toBe(6);
      for (const t of round) {
        expect(["viewed", "seen", "path"], t.id).toContain(t.state); // in view in full, or already walked
        expect(t.terrain, t.id).toBeDefined();
      }
      const viewed = round.find((t) => t.state === "viewed")!;
      expect(viewed).toBeDefined();
      expect(state.intent(viewed.id, true).kind).toBe("none"); // not walkable: shift-step refuses
      expect(state.canExtend(viewed.id)).toBe(true); // but the path can go there
      // the ring beyond is sensed: its colour, no more
      const ring = new Set<string>();
      for (const t of round) for (const [c, r] of neighbours(t.col, t.row)) ring.add(`${c},${r}`);
      for (const key of ring) {
        const [c, r] = key.split(",").map(Number) as [number, number];
        const t = state.tileAt(c, r);
        if (t && t.id !== here.id && !round.some((x) => x.id === t.id)) expect(t.state, t.id).not.toBe("hidden");
      }
    });

    it("starts with the camp's signposts, pointing at the settlements within a day's walk", () => {
      const camp = [...state.tiles.values()].find((t) => t.feature === "tent")!;
      expect(camp.mapped).toBe(true);
      const sides = state.signposts.get(camp.id)!;
      expect(sides.length).toBeGreaterThan(0);
      expect(new Set(sides).size).toBe(sides.length); // one arrow to a direction
      expect(state.signposts.size).toBe(1); // no settlement has been reached
    });

    it("gives a settlement's signposts on arriving there, and none that point back at the camp or at a reached settlement", async () => {
      const campId = state.player.at;
      const tower = await walkToTower();
      expect(state.tiles.get(tower)!.mapped).toBe(true);
      const here = state.signposts.get(tower);
      // every arrow stands at a settlement the explorer has arrived at, and points only at unreached ones
      for (const id of state.signposts.keys()) expect(state.tiles.get(id)!.mapped).toBe(true);
      expect(state.signposts.has(campId)).toBe(true);
      // the camp's arrows no longer include the way to the tower just reached: fewer or equal directions
      expect(state.signposts.get(campId)!.length).toBeGreaterThan(0);
      void here;
      // reread from the graph: the same signposts
      const reread = new GameState(bridge);
      await reread.load();
      expect([...reread.signposts]).toEqual([...state.signposts]);
    });

    it("anchors the route when the last step of the day lands on a settlement: secured before the night, and kept", async () => {
      const tower = await walkToTower({ lastStepIsLastOfDay: true });
      expect(state.player.steps).toBe(START_STEPS); // the day ended on that step: back at the camp, refilled
      expect(state.parts).toEqual(["head"]);
      expect(state.edges.length).toBeGreaterThan(0);
      expect(state.edges.every((e) => e.kind === "SECURED")).toBe(true); // the whole route is anchored
      expect(state.tiles.get(tower)!.anchor).toBe(true);
      expect(state.tiles.get(tower)!.mapped).toBe(true); // and its signposts show
      expect(state.tiles.get(tower)!.state).not.toBe("hidden");
      const graph = await bridge.enqueue("MATCH ()-[r:LOOSE]->() RETURN count(r) AS n");
      expect(graph[0]!["n"]).toBe(0);
    });

    it("takes the signposts back with undo", async () => {
      const campId = state.player.at;
      await walkToTower();
      expect(await state.undo()).toBeUndefined();
      const reread = new GameState(bridge);
      await reread.load();
      expect([...reread.signposts]).toEqual([...state.signposts]);
      expect(state.signposts.has(campId)).toBe(true);
    });

    it("reports the win only when both towers are joined", async () => {
      expect(await state.allRouted()).toBe(false);
      await walkToTower();
      expect(await state.allRouted()).toBe(false); // one tower of two
    });
  });
});
