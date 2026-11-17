// The seven day game's end and score (ADR-011, amended 2026-11-17). Nothing here is stored in the graph: the day is the
// robot's parts, the waymarkers used are the anchors that are not the camp or a tower, and the settlements and their
// routes are read from the graph. The score is computed from those when the game ends.
import { DAYS, SETTLEMENTS } from "./world.js";

/** The robot's parts, one added each night: the day is the number of parts plus one. Seven parts, seven days. */
export const PARTS = ["head", "eyes", "mouth", "body", "arms", "legs", "power"] as const;
export type Part = (typeof PARTS)[number];

export const POINTS = { settlement: 100, marker: 5, lateDay: 10 } as const;

/** Par: two settlements routed a day. */
export const parDays = (settlements: number): number => Math.ceil(settlements / 2);

export interface Outcome {
  /** Settlements joined to the camp by secured paths. */
  routed: number;
  total: number;
  /** Waymarkers placed. */
  markers: number;
  /** The day the game ended on, 1 to DAYS. */
  days: number;
}

/** 100 a settlement routed, less 5 a waymarker and 10 a day over par; never below zero. */
export function computeScore(o: Outcome): number {
  const late = Math.max(0, o.days - parDays(o.total));
  return Math.max(0, POINTS.settlement * o.routed - POINTS.marker * o.markers - POINTS.lateDay * late);
}

/** The best a game can score: every settlement, within par, with no waymarker. */
export const PERFECT = POINTS.settlement * SETTLEMENTS;

if (PARTS.length !== DAYS) throw new Error("one robot part for each day");
