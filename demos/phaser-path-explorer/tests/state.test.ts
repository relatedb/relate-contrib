// The cache and the actions against the real engine (WebAssembly, in Node): what a player may know, and an extension.
import { beforeEach, describe, expect, it } from "vitest";
import { Bridge } from "../src/game/bridge.js";
import { GameState } from "../src/game/state.js";
import { COLS, ROWS, START_WAYMARKS, generateRows } from "../src/game/world.js";
import { neighbours } from "../src/hex/core/index.js";
import { engineBuilt, openEngine, seedWorld } from "./helpers/engine.js";

const neighboursOf = (a: { col: number; row: number }, b: { col: number; row: number }) =>
  neighbours(a.col, a.row).some(([c, r]) => c === b.col && r === b.row);

describe.skipIf(!engineBuilt)("game state, on the engine", () => {
  let state: GameState;
  let bridge: Bridge;
  const rows = generateRows("first-light");

  beforeEach(async () => {
    const engine = await openEngine();
    await seedWorld(engine, rows);
    bridge = new Bridge(engine.query);
    state = new GameState(bridge);
    await state.load();
  });

  it("loads every hex, but gives away the ground truth only of what is discovered", () => {
    expect(state.tiles.size).toBe(COLS * ROWS);
    const byState = { hidden: 0, sensed: 0, seen: 0, path: 0 };
    for (const t of state.tiles.values()) {
      byState[t.state]++;
      if (t.state === "hidden") expect(t.terrain, t.id).toBeUndefined();
      else expect(t.terrain, t.id).toBeDefined();
    }
    expect(byState).toEqual({ hidden: COLS * ROWS - 7, sensed: 6, seen: 0, path: 1 });
    expect(state.player.waymarks).toBe(START_WAYMARKS);
    expect(state.here()?.feature).toBe("tent");
  });

  it("refuses an extension onto a hex that is hidden or not next to the explorer, without asking the engine", async () => {
    const hidden = [...state.tiles.values()].find((t) => t.state === "hidden")!;
    expect(state.canExtend(hidden.id)).toBe(false);
    const before = bridge.pending;
    await state.extend(hidden.id);
    expect(bridge.pending).toBe(before);
    expect(state.message).not.toBe("");
    expect(state.player.waymarks).toBe(START_WAYMARKS);
  });

  it("extends onto a sensed neighbour: the hex joins the path, the explorer moves, new hexes are sensed", async () => {
    const target = [...state.tiles.values()].find((t) => t.state === "sensed" && state.canExtend(t.id))!;
    const version = state.version;
    const done = state.extend(target.id);
    expect(state.pending).toBe(target.id); // pending at once; nothing awaited yet
    expect(state.canExtend(target.id)).toBe(false);
    await done;
    expect(state.pending).toBeNull();
    expect(state.version).toBeGreaterThan(version);
    expect(state.tiles.get(target.id)!.state).toBe("path");
    expect(state.player.at).toBe(target.id);
    expect(state.player.waymarks).toBe(START_WAYMARKS - 1);
    const sensed = [...state.tiles.values()].filter((t) => t.state === "sensed");
    expect(sensed.length).toBeGreaterThan(4); // the camp's other neighbours and the new ones
    for (const t of sensed) expect(t.terrain, t.id).toBeDefined(); // the new ones arrive with their terrain
  });

  it("keeps the world in step with the graph: a second state loaded afterwards sees the same board", async () => {
    const target = [...state.tiles.values()].find((t) => t.state === "sensed")!;
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
  async function walkToTower(): Promise<string> {
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
      await state.click(next.id);
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
      expect(state.player.waymarks).toBe(START_WAYMARKS - 1);
      expect(state.facing).toBe("se");
      await state.go(); // straight on, the same direction
      expect(state.edges).toHaveLength(2);
      expect(state.facing).toBe("se");
    });

    it("moving behind reels the thread in when that hex is where it came from, and leaves the facing alone", async () => {
      await state.go(); // east
      await state.go(); // east again
      expect(state.player.waymarks).toBe(START_WAYMARKS - 2);
      await state.go(true); // behind: the hex the thread came from
      expect(state.player.waymarks).toBe(START_WAYMARKS - 1);
      expect(state.facing).toBe("e"); // still facing the way the thread ran, so the next press extends again
      await state.go();
      expect(state.player.waymarks).toBe(START_WAYMARKS - 2);
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
      expect(state.player.waymarks).toBe(START_WAYMARKS);
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
      const a = [...state.tiles.values()].find((t) => t.state === "sensed")!;
      await state.click(a.id);
      expect(state.edges).toEqual([{ from: camp, to: a.id, kind: "LOOSE" }]);
      expect(state.predecessor()).toBe(camp);
    });

    it("reels in when the hex behind the thread is clicked, and gives the waymark back", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => t.state === "sensed")!;
      await state.click(a.id);
      expect(state.player.waymarks).toBe(START_WAYMARKS - 1);
      await state.click(camp);
      expect(state.player.at).toBe(camp);
      expect(state.player.waymarks).toBe(START_WAYMARKS);
      expect(state.edges).toEqual([]);
      expect(state.tiles.get(a.id)!.state).toBe("seen"); // remembered, no longer on a path
    });

    it("steps over known ground, laying no thread, when asked to with shift", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => t.state === "sensed")!;
      await state.click(a.id);
      await state.click(camp); // reel in; a is now remembered ground
      await state.click(a.id, { step: true }); // a seen hex next to the camp: a step
      expect(state.player.at).toBe(a.id);
      expect(state.edges).toEqual([]);
      expect(state.player.waymarks).toBe(START_WAYMARKS);
    });

    it("extends over remembered ground, not just unexplored ground: a click lays thread and costs a waymark", async () => {
      const camp = state.player.at;
      const a = [...state.tiles.values()].find((t) => t.state === "sensed")!;
      await state.click(a.id);
      await state.click(camp); // reel in; a is now remembered ground
      expect(state.tiles.get(a.id)!.state).toBe("seen");
      await state.click(a.id);
      expect(state.edges).toEqual([{ from: camp, to: a.id, kind: "LOOSE" }]);
      expect(state.player.waymarks).toBe(START_WAYMARKS - 1);
      expect(state.player.at).toBe(a.id);
    });

    it("crosses a secured path with a new thread, and the crossed hex stays on its path", async () => {
      await walkToTower();
      const camp = [...state.tiles.values()].find((t) => t.feature === "tent")!;
      await state.click(camp.id); // skip home
      // the first hex of the secured route, next to the camp, and a sensed hex that is next to both it and the camp
      const first = state.edges.find((e) => e.from === camp.id)!.to;
      const p1 = state.tiles.get(first)!;
      const all = [...state.tiles.values()];
      const s1 = all.find((t) => t.state === "sensed" && neighboursOf(camp, t) && neighboursOf(p1, t) && t.id !== p1.id);
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
      const ring = [...state.tiles.values()].filter((t) => t.state === "sensed");
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

    it("skips from one anchor to another along secured paths, in one turn", async () => {
      const tower = await walkToTower();
      const camp = [...state.tiles.values()].find((t) => t.anchor && t.feature === "tent")!;
      await state.click(camp.id);
      expect(state.player.at).toBe(camp.id);
      await state.click(tower);
      expect(state.player.at).toBe(tower);
    });

    it("will not skip while a thread is in play", async () => {
      const tower = await walkToTower();
      const camp = [...state.tiles.values()].find((t) => t.feature === "tent")!;
      await state.click(camp.id); // skip home
      const next = [...state.tiles.values()].find((t) => t.state === "sensed" && state.canExtend(t.id))!;
      await state.click(next.id); // a new loose thread from the camp
      expect(state.loose()).toHaveLength(1);
      await state.step(camp.id); // back onto the camp, thread still in play
      expect(state.player.at).toBe(camp.id);
      await state.click(tower);
      expect(state.player.at).toBe(camp.id);
      expect(state.message).toMatch(/reel in or secure/i);
    });

    it("will not start a second thread from the middle of a path", async () => {
      await walkToTower();
      const here = state.here()!;
      const all = [...state.tiles.values()];
      const mid = all.find(
        (t) => t.state === "path" && !t.anchor && neighboursOf(here, t) && all.some((n) => n.state === "sensed" && neighboursOf(t, n)),
      )!;
      await state.step(mid.id); // walk back one hex along the secured path
      expect(state.player.at).toBe(mid.id);
      const sensed = all.find((n) => n.state === "sensed" && neighboursOf(mid, n))!;
      await state.click(sensed.id);
      expect(state.message).toMatch(/from an anchor/i);
      expect(state.tiles.get(sensed.id)!.state).toBe("sensed");
    });
  });
});
