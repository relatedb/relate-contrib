// The demo behind the splash (ADR-011, amended 2026-11-17): the explorer wanders a throwaway island at random, laying
// no path, with a clearing in the fog round them. It runs on its own in-memory graph, never the visitor's saved game.
import { neighbours, oppositeSide, sideTo, toAxial, turnSide, type Side } from "./hex/core/index.js";
import { hexId } from "./game/graph.js";
import type { Bridge } from "@relate/contrib-phaser";
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

/** Steps between two hexes. */
export function hexDistance(a: Pos, b: Pos): number {
  const p = toAxial(a[0], a[1]);
  const q = toAxial(b[0], b[1]);
  const dq = p.q - q.q;
  const dr = p.r - q.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** The neighbouring hexes that are on the board and not water. */
function dryNeighbours(rows: string[], at: Pos): Pos[] {
  return neighbours(at[0], at[1]).filter(
    ([c, r]) => c >= 0 && r >= 0 && r < rows.length && c < rows[r]!.length && !WATER.has(rows[r]![c]!),
  );
}

/**
 * The next hex of a random walk over dry land: it favours going on the way it was going (`heading`), bends a little now
 * and then, and turns back only when there is nowhere else. It shies from hexes that lead towards any of `shy`, the
 * places it was frightened at lately. `rand` gives a number from 0 up to 1.
 */
export function wanderStep(rows: string[], at: Pos, heading: Side | undefined, rand: () => number, shy: Pos[] = []): Pos | undefined {
  const dry = dryNeighbours(rows, at);
  if (!dry.length) return undefined;
  const from = { col: at[0], row: at[1] };
  const sideOf = (n: Pos) => sideTo(from, { col: n[0], row: n[1] });
  const weight = (n: Pos): number => {
    let w = 1;
    if (heading) {
      const s = sideOf(n);
      if (s === heading) w = 4;
      else if (s === turnSide(heading, 1) || s === turnSide(heading, -1)) w = 2;
      else if (s === oppositeSide(heading)) w = 0.2;
    }
    // towards somewhere it was frightened: a quarter as likely
    if (shy.some((t) => hexDistance(n, t) < hexDistance(at, t))) w *= 0.25;
    return w;
  };
  const weights = dry.map(weight);
  let pick = rand() * weights.reduce((a, b) => a + b, 0);
  for (const [i, n] of dry.entries()) {
    pick -= weights[i]!;
    if (pick <= 0) return n;
  }
  return dry[dry.length - 1];
}

/** Run from the `threats`: the neighbouring dry hex that ends furthest from the nearest of them. */
export function fleeStep(rows: string[], at: Pos, threats: Pos[], rand: () => number): Pos | undefined {
  const taken = new Set(threats.map(key));
  const dry = dryNeighbours(rows, at).filter((n) => !taken.has(key(n)));
  if (!dry.length) return undefined;
  const far = (n: Pos) => Math.min(...threats.map((t) => hexDistance(n, t)));
  const best = Math.max(...dry.map(far));
  const choices = dry.filter((n) => far(n) === best);
  return choices[Math.floor(rand() * choices.length)];
}

/** Somewhere dry for each of `count` robots to start, all at least `apart` steps from `from`. */
export function placeRobots(rows: string[], from: Pos, count: number, apart: number, rand: () => number): Pos[] {
  const far: Pos[] = [];
  rows.forEach((r, row) => [...r].forEach((ch, col) => !WATER.has(ch) && hexDistance([col, row], from) >= apart && far.push([col, row])));
  const out: Pos[] = [];
  while (out.length < count && far.length) out.push(far.splice(Math.floor(rand() * far.length), 1)[0]!);
  return out;
}

export interface DemoOptions {
  rows: string[];
  state: GameState;
  bridge: Bridge;
  /** Where the explorer starts. */
  start: Pos;
  /** How many robots roam (default 3). They are only told of when the explorer can see them. */
  robots?: number;
  /** The robots the explorer can see now, after every step. */
  onRobots?: (seen: Pos[]) => void;
  intervalMs?: number;
  rand?: () => number;
}

const SIGHT = 2; // the lantern's reach, in hexes
const FRIGHT_TICKS = 8; // how long the explorer keeps clear of where it saw a robot

/**
 * Walk the demo's explorer, one hex at a time, until stopped. Robots roam too, unseen in the fog; one that comes into
 * the lantern is seen, and the explorer runs from it, and keeps away from there for a while.
 */
export function runDemo(o: DemoOptions): () => void {
  const rand = o.rand ?? Math.random;
  const cols = o.rows[0]!.length;
  let at = o.start;
  let heading: Side | undefined;
  let stopped = false;
  let timer = 0;
  const robots = placeRobots(o.rows, at, o.robots ?? 3, 6, rand).map((pos) => ({ pos, heading: undefined as Side | undefined }));
  let shy: { at: Pos; left: number }[] = [];
  const place = async (p: Pos) => {
    const lit = within(p, SIGHT + 1, cols, o.rows.length);
    const sight = new Set(within(p, SIGHT, cols, o.rows.length).map(key));
    const ids = lit.map((q) => hexId(q[0], q[1]));
    await o.bridge.enqueue(DEMO_DARKEN, { ids });
    await o.bridge.enqueue(DEMO_LIGHT, { ids: lit.filter((q) => sight.has(key(q))).map((q) => hexId(q[0], q[1])), state: "viewed" });
    await o.bridge.enqueue(DEMO_LIGHT, { ids: lit.filter((q) => !sight.has(key(q))).map((q) => hexId(q[0], q[1])), state: "sensed" });
    await o.bridge.enqueue(DEMO_AT, { to: hexId(p[0], p[1]) });
  };
  const inSight = () => robots.filter((r) => hexDistance(r.pos, at) <= SIGHT).map((r) => r.pos);
  const tick = async (): Promise<boolean> => {
    // the robots roam, slowly, never onto the explorer
    for (const r of robots) {
      if (rand() > 0.6) continue;
      const next = wanderStep(o.rows, r.pos, r.heading, rand);
      if (next && key(next) !== key(at)) {
        r.heading = sideTo({ col: r.pos[0], row: r.pos[1] }, { col: next[0], row: next[1] });
        r.pos = next;
      }
    }
    const threats = inSight();
    for (const t of threats) shy = [...shy.filter((s) => key(s.at) !== key(t)), { at: t, left: FRIGHT_TICKS }];
    shy = shy.map((s) => ({ ...s, left: s.left - 1 })).filter((s) => s.left > 0);
    const next = threats.length
      ? fleeStep(o.rows, at, threats, rand)
      : wanderStep(o.rows, at, heading, rand, shy.map((s) => s.at));
    if (next) {
      heading = sideTo({ col: at[0], row: at[1] }, { col: next[0], row: next[1] });
      o.state.facing = heading;
      at = next;
      await place(next);
      if (!stopped) await o.state.load();
    }
    o.onRobots?.(inSight());
    return threats.length > 0;
  };
  // one step after another, quicker while running
  const loop = (afterMs: number) => {
    timer = window.setTimeout(async () => {
      if (stopped) return;
      let frightened = false;
      try {
        frightened = await tick();
      } finally {
        if (!stopped) loop(frightened ? 380 : (o.intervalMs ?? 650));
      }
    }, afterMs);
  };
  void place(at).then(() => o.state.load());
  loop(o.intervalMs ?? 650);
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
