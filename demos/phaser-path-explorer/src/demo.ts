// The demo behind the splash (ADR-011, amended 2026-11-17): the explorer wanders a throwaway island at random, laying
// no path, with a clearing in the fog round them. It runs on its own in-memory graph, never the visitor's saved game.
import { neighbours, neighbourAt, oppositeSide, sideTo, turnSide, type Side } from "./hex/core/index.js";
import { hexId } from "./game/graph.js";
import type { Bridge } from "./game/bridge.js";
import type { GameState } from "./game/state.js";
import { DEMO_AT, DEMO_DARKEN, DEMO_LIGHT } from "./game/statements.js";

export type Pos = [number, number];

const WATER = new Set(["D", "w"]);
const key = (p: Pos) => `${p[0]},${p[1]}`;

/** The hexes within `radius` of `at`, nearest first, kept to the board. */
export function within(at: Pos, radius: number, cols: number, rows: number): Pos[] {
  const seen = new Set([key(at)]);
  let ring: Pos[] = [at];
  const out: Pos[] = [at];
  for (let i = 0; i < radius; i++) {
    const next: Pos[] = [];
    for (const p of ring)
      for (const n of neighbours(p[0], p[1])) {
        if (n[0] < 0 || n[1] < 0 || n[0] >= cols || n[1] >= rows || seen.has(key(n))) continue;
        seen.add(key(n));
        next.push(n);
        out.push(n);
      }
    ring = next;
  }
  return out;
}

/**
 * The next hex of a random walk over dry land: it favours going on the way it was going (`heading`), bends a little now
 * and then, and turns back only when there is nowhere else. `rand` gives a number from 0 up to 1.
 */
export function wanderStep(rows: string[], at: Pos, heading: Side | undefined, rand: () => number): Pos | undefined {
  const dry = neighbours(at[0], at[1]).filter(
    ([c, r]) => c >= 0 && r >= 0 && r < rows.length && c < rows[r]!.length && !WATER.has(rows[r]![c]!),
  );
  if (!dry.length) return undefined;
  const from = { col: at[0], row: at[1] };
  const sideOf = (n: Pos) => sideTo(from, { col: n[0], row: n[1] });
  const weight = (n: Pos): number => {
    if (!heading) return 1;
    const s = sideOf(n);
    if (s === heading) return 4;
    if (s === turnSide(heading, 1) || s === turnSide(heading, -1)) return 2;
    return s === oppositeSide(heading) ? 0.2 : 1;
  };
  const weights = dry.map(weight);
  let pick = rand() * weights.reduce((a, b) => a + b, 0);
  for (const [i, n] of dry.entries()) {
    pick -= weights[i]!;
    if (pick <= 0) return n;
  }
  return dry[dry.length - 1];
}

export interface DemoOptions {
  rows: string[];
  state: GameState;
  bridge: Bridge;
  /** Where the explorer starts. */
  start: Pos;
  intervalMs?: number;
  rand?: () => number;
}

/** Walk the demo's explorer, one hex at a time, until stopped. */
export function runDemo(o: DemoOptions): () => void {
  const rand = o.rand ?? Math.random;
  const cols = o.rows[0]!.length;
  let at = o.start;
  let heading: Side | undefined;
  let stopped = false;
  let busy = false;
  const place = async (p: Pos) => {
    const lit = within(p, 3, cols, o.rows.length);
    const sight = new Set(within(p, 2, cols, o.rows.length).map(key));
    const ids = lit.map((q) => hexId(q[0], q[1]));
    await o.bridge.enqueue(DEMO_DARKEN, { ids });
    await o.bridge.enqueue(DEMO_LIGHT, { ids: lit.filter((q) => sight.has(key(q))).map((q) => hexId(q[0], q[1])), state: "viewed" });
    await o.bridge.enqueue(DEMO_LIGHT, { ids: lit.filter((q) => !sight.has(key(q))).map((q) => hexId(q[0], q[1])), state: "sensed" });
    await o.bridge.enqueue(DEMO_AT, { to: hexId(p[0], p[1]) });
  };
  const tick = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const next = wanderStep(o.rows, at, heading, rand);
      if (next) {
        heading = sideTo({ col: at[0], row: at[1] }, { col: next[0], row: next[1] });
        o.state.facing = heading;
        at = next;
        await place(next);
        if (!stopped) await o.state.load();
      }
    } finally {
      busy = false;
    }
  };
  void place(at).then(() => o.state.load());
  const timer = window.setInterval(() => void tick(), o.intervalMs ?? 650);
  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
