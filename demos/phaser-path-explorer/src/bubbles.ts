// The words of the splash (ADR-011, amended 2026-11-17), as message bubbles that drift across the board in three rows:
// the premise along the top, the keys through the middle, the prompt and the scores along the bottom.
import { PERFECT } from "./game/score.js";
import type { Scores } from "./game/scores.js";

export interface Message {
  /** The key or keys, shown in bold before the text. */
  key?: string;
  text: string;
}

export interface BubbleRows {
  top: Message[];
  middle: Message[];
  bottom: Message[];
}

export function bubbleRows(o: { scores: Scores; canContinue: boolean }): BubbleRows {
  const n = (v: number | null) => (v === null ? "none yet" : String(v));
  return {
    top: [
      { text: "Rogue robots are being built, one part a night." },
      { text: "On the seventh night they wake and head for the nearest settlement." },
      { text: "Join each settlement to the camp by a secured path before then." },
      { text: "The robots spare settlements that are connected, and destroy the rest." },
    ],
    middle: [
      { key: "← →", text: "Turn" },
      { key: "↑", text: "Move ahead. On new ground this lays path." },
      { key: "↓", text: "Move back. Along your path this takes it in." },
      { key: "Shift + ↑ ↓", text: "Step over known ground without laying path" },
      { key: "P", text: "Place a waymarker here: secure the path, or on a path, drop a flag to branch" },
      { key: "E", text: "End the day" },
      { key: "Backspace, ⌘Z", text: "Undo the last action" },
      { key: "Esc, H, ?", text: "Pause, and see these messages again" },
    ],
    bottom: [
      { text: o.canContinue ? "Press any key to continue." : "Press any key to start a new game." },
      ...(o.canContinue ? [{ key: "N", text: "Start a new game on a new island" }] : []),
      { text: `Last game: ${n(o.scores.last)}. Best: ${n(o.scores.best)}.` },
      { text: `A perfect game scores ${PERFECT}.` },
    ],
  };
}

/** Everything the bubbles say, as plain text for a screen reader. */
export function readerText(rows: BubbleRows, result?: number): string {
  const line = (m: Message) => (m.key ? `${m.key}: ${m.text}` : m.text);
  const all = [
    ...(result === undefined ? [] : [`The game is over. You scored ${result}.`]),
    ...rows.top.map(line),
    ...rows.middle.map(line),
    ...rows.bottom.map(line),
  ];
  return all.join("\n");
}
