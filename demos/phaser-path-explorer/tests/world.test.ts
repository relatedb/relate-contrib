import { describe, expect, it } from "vitest";
import { generateRows, landDistances, COLS, ROWS, SETTLEMENTS, START_STEPS } from "../src/game/world.js";
import { worldDocument } from "../src/game/graph.js";
import { neighbours } from "../src/hex/core/index.js";

describe("world", () => {
  it("is a pure function of its seed", () => {
    expect(generateRows("a")).toEqual(generateRows("a"));
    expect(generateRows("a")).not.toEqual(generateRows("b"));
  });

  it("has the camp at the centre and at least one tower", () => {
    const rows = generateRows("first-light");
    expect(rows).toHaveLength(ROWS);
    expect(rows[Math.floor(ROWS / 2)]![Math.floor(COLS / 2)]).toBe("t");
    expect(rows.join("")).toMatch(/[RU]/);
  });
});

describe("terrain variety", () => {
  const seeds = ["first-light", "another", "tide", "ember", "moss", "x9"];
  const kinds = (rows: string[]) => {
    const counts: Record<string, number> = {};
    for (const ch of rows.join("")) counts[ch] = (counts[ch] ?? 0) + 1;
    return counts;
  };

  it("uses most of the terrain kinds, whatever the seed", () => {
    for (const seed of seeds) {
      const counts = kinds(generateRows(seed));
      const terrain = ["D", "w", "s", "g", "f", "h", "m", "b"].filter((k) => (counts[k] ?? 0) > 0);
      expect(terrain.length, seed).toBeGreaterThanOrEqual(7);
    }
  });

  it("does not let any one land terrain cover most of the land", () => {
    for (const seed of seeds) {
      const counts = kinds(generateRows(seed));
      const land = ["s", "g", "f", "h", "m", "b", "R", "U", "t"].reduce((n, k) => n + (counts[k] ?? 0), 0);
      for (const k of ["g", "f", "h", "m", "b"]) expect((counts[k] ?? 0) / land, `${seed} ${k}`).toBeLessThan(0.45);
    }
  });

  it("keeps a clearing of grass and trees round the camp", () => {
    for (const seed of seeds) {
      const rows = generateRows(seed);
      const col = Math.floor(COLS / 2);
      const row = Math.floor(ROWS / 2);
      expect(rows[row]![col]).toBe("t");
      for (const [c, r] of neighbours(col, row)) expect(["g", "f"], `${seed} ${c},${r}`).toContain(rows[r]![c]);
    }
  });

  it("places several towers, apart from the camp and from each other", () => {
    for (const seed of seeds) {
      const rows = generateRows(seed);
      const towers: [number, number][] = [];
      rows.forEach((r, row) => [...r].forEach((ch, col) => (ch === "R" || ch === "U") && towers.push([col, row])));
      expect(towers.length, seed).toBeGreaterThanOrEqual(3);
      for (const [i, a] of towers.entries())
        for (const b of towers.slice(i + 1)) expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("reach", () => {
  it("puts at least two towers within a day's steps of the camp, by land, for any seed", () => {
    for (const seed of ["first-light", "another", "tide", "ember", "moss", "x9", "a", "b", "c", "d", "e", "f", "g", "h"]) {
      const rows = generateRows(seed);
      const dist = landDistances(rows, [Math.floor(COLS / 2), Math.floor(ROWS / 2)]);
      let near = 0;
      rows.forEach((r, row) =>
        [...r].forEach((ch, col) => {
          const d = dist.get(`${col},${row}`);
          if ((ch === "R" || ch === "U") && d !== undefined && d <= START_STEPS) near++;
        }),
      );
      expect(near, seed).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("world document", () => {
  const doc = worldDocument(generateRows("first-light"));
  const hexes = doc.nodes.filter((n) => n.labels!.includes("Hex"));

  it("has a hex per tile, a player at the camp, and string ids", () => {
    expect(hexes).toHaveLength(COLS * ROWS);
    for (const n of doc.nodes) expect(typeof n.id).toBe("string");
    const camp = hexes.filter((h) => h.properties!["origin"]);
    expect(camp).toHaveLength(1);
    expect(doc.nodes.find((n) => n.id === "player")!.properties!["at"]).toBe(camp[0]!.id);
  });

  it("links neighbours once per pair and never to a hex outside the map", () => {
    const ids = new Set(hexes.map((h) => h.id));
    const pairs = new Set<string>();
    for (const l of doc.links) {
      expect(l.type).toBe("ADJ");
      expect(ids.has(l.source) && ids.has(l.target)).toBe(true);
      const key = [l.source, l.target].sort().join("|");
      expect(pairs.has(key), key).toBe(false);
      pairs.add(key);
    }
    // a 16 by 14 offset grid has 3 * 16 * 14 - 2 * 16 - 14 * 1 - ... edges; check the interior rule instead
    expect(doc.links.length).toBeGreaterThan(COLS * ROWS * 2);
  });

  it("starts with the camp on the path, its neighbours sensed and the rest hidden", () => {
    const states = hexes.map((h) => h.properties!["state"]);
    expect(states.filter((s) => s === "path")).toHaveLength(1);
    expect(states.filter((s) => s === "sensed")).toHaveLength(6);
    expect(states.filter((s) => s === "hidden")).toHaveLength(COLS * ROWS - 7);
  });

  it("marks the camp and the towers as anchors", () => {
    const anchors = hexes.filter((h) => h.properties!["anchor"]);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    for (const a of anchors) expect(a.properties!["feature"]).toBeTruthy();
  });
});

describe("settlements", () => {
  const seeds = ["first-light", "another", "tide", "ember", "moss", "x9"];

  it("places six, every one within a day's reach of the camp or another settlement, two of them of the camp", () => {
    for (const seed of seeds) {
      const rows = generateRows(seed);
      const camp: [number, number] = [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
      const towers: [number, number][] = [];
      rows.forEach((r, row) => [...r].forEach((ch, col) => (ch === "R" || ch === "U") && towers.push([col, row])));
      expect(towers.length, seed).toBe(SETTLEMENTS);
      const fromCamp = landDistances(rows, camp);
      expect(towers.filter(([c, r]) => (fromCamp.get(`${c},${r}`) ?? Infinity) <= START_STEPS).length, seed).toBeGreaterThanOrEqual(2);
      // routing can spread outwards a day at a time: every settlement is reached from the camp through the others
      const reached: [number, number][] = [camp];
      const left = [...towers];
      for (let grew = true; grew && left.length; ) {
        grew = false;
        for (const t of [...left]) {
          const near = reached.some((from) => (landDistances(rows, from).get(`${t[0]},${t[1]}`) ?? Infinity) <= START_STEPS);
          if (near) {
            reached.push(t);
            left.splice(left.indexOf(t), 1);
            grew = true;
          }
        }
      }
      expect(left, seed).toEqual([]);
    }
  });
});
