import { describe, expect, it } from "vitest";
import { PARTS, PERFECT, computeScore, parDays } from "../src/game/score.js";
import { loadScores, recordScore, type KeyValueStore } from "../src/game/scores.js";

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

describe("the score", () => {
  it("is 600 for a perfect game: six settlements, within par, no waymarker", () => {
    expect(parDays(6)).toBe(3);
    expect(PERFECT).toBe(600);
    expect(computeScore({ routed: 6, total: 6, markers: 0, days: 3 })).toBe(600);
    expect(computeScore({ routed: 6, total: 6, markers: 0, days: 1 })).toBe(600);
  });

  it("loses 5 a waymarker and 10 a day over par, and never goes below zero", () => {
    expect(computeScore({ routed: 6, total: 6, markers: 4, days: 3 })).toBe(580);
    expect(computeScore({ routed: 6, total: 6, markers: 0, days: 7 })).toBe(560);
    expect(computeScore({ routed: 1, total: 6, markers: 50, days: 7 })).toBe(0);
  });

  it("has a robot part for each of the seven days", () => {
    expect(PARTS).toHaveLength(7);
    expect(PARTS.at(-1)).toBe("power");
  });
});

describe("kept scores", () => {
  it("starts with none, then keeps the last and the best", () => {
    const store = memory();
    expect(loadScores(store)).toEqual({ last: null, best: null });
    expect(recordScore(store, 300)).toEqual({ last: 300, best: 300 });
    expect(recordScore(store, 200)).toEqual({ last: 200, best: 300 });
    expect(loadScores(store)).toEqual({ last: 200, best: 300 });
  });

  it("copes with missing, damaged or failing storage", () => {
    expect(loadScores(undefined)).toEqual({ last: null, best: null });
    const damaged = memory();
    damaged.data.set("path-explorer-scores", "{nope");
    expect(loadScores(damaged)).toEqual({ last: null, best: null });
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(recordScore(full, 100)).toEqual({ last: 100, best: 100 });
  });
});
