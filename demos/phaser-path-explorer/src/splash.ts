// The splash (ADR-011, amended 2026-11-17): the game's words, as grey message bubbles drifting across the board, which
// stays in view behind them. It opens on every load, and again on Esc (or H, ?) as the pause. Any key continues the game
// in progress (or starts a new one when there is none); N starts a new one on a random island, which is the
// confirmation that abandons the old one. It only reads its inputs; main.ts owns the game.
import { bubbleRows, readerText, type BubbleRows, type Message } from "./bubbles.js";
import type { Scores } from "./game/scores.js";

export interface Splash {
  readonly open: boolean;
  /** Show the screen; `result` is the score of a game that has just ended. */
  show(opts?: { result?: number }): void;
  hide(): void;
}

export interface SplashOptions {
  /** Is there a game in progress to go back to? A finished game is not. */
  canContinue: () => boolean;
  onNew: () => void;
  scores: () => Scores;
}

const SPEED = 0.07; // pixels a millisecond, about the pace of reading
const GAP = 140; // pixels between one bubble and the next in a row
const ROW_AT = { top: 0.14, middle: 0.5, bottom: 0.86 } as const;
const RESULT_AT = 0.3;
const GUARD_MS = 1500; // a game that has just ended ignores keys for a moment, so the last move does not skip the result
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Unidentified"]);

function bubble(m: Message, className = "bubble"): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  if (m.key) {
    const k = document.createElement("b");
    k.textContent = m.key;
    el.append(k);
  }
  el.append(document.createTextNode(m.text));
  return el;
}

/** Drift the rows across `field`; returns the function that stops them and clears the bubbles. */
function drift(field: HTMLElement, rows: BubbleRows, reduced: boolean): () => void {
  let stopped = false;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, ms);
    timers.add(t);
  };
  const run = (name: keyof typeof ROW_AT, messages: Message[], startAt: number, delay: number) => {
    let i = 0;
    const next = (first: boolean) => {
      const el = bubble(messages[i++ % messages.length]!);
      el.style.top = `${ROW_AT[name] * 100}%`;
      field.append(el);
      if (reduced) {
        // no motion: one message at a time, in the middle of its row
        el.style.transform = "translate(-50%, -50%)";
        el.style.left = "50%";
        later(() => {
          el.remove();
          next(false);
        }, 7000);
        return;
      }
      const w = el.offsetWidth;
      const full = field.clientWidth;
      const from = first ? full * startAt : full;
      el.style.left = "0";
      const move = el.animate(
        [{ transform: `translate(${from}px, -50%)` }, { transform: `translate(${-w}px, -50%)` }],
        { duration: (from + w) / SPEED, easing: "linear", fill: "forwards" },
      );
      move.onfinish = () => el.remove();
      later(() => next(false), Math.max(0, from + w + GAP - full) / SPEED);
    };
    later(() => next(true), delay);
  };
  run("top", rows.top, 0.55, 0);
  run("middle", rows.middle, 0.8, 600);
  run("bottom", rows.bottom, 0.3, 300);
  return () => {
    stopped = true;
    timers.forEach((t) => window.clearTimeout(t));
    field.replaceChildren();
  };
}

export function createSplash(opts: SplashOptions): Splash {
  const root = document.getElementById("splash")!;
  const field = document.getElementById("bubbles")!;
  const reader = document.getElementById("splash-text")!;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const open = () => !root.hidden;
  let stop: (() => void) | undefined;
  let guardUntil = 0;

  const hide = () => {
    root.hidden = true;
    stop?.();
    stop = undefined;
  };
  const show = (o: { result?: number } = {}) => {
    stop?.();
    root.hidden = false;
    guardUntil = o.result === undefined ? 0 : performance.now() + GUARD_MS;
    const rows = bubbleRows({ scores: opts.scores(), canContinue: opts.canContinue() });
    reader.textContent = readerText(rows, o.result);
    stop = drift(field, rows, reduce.matches);
    if (o.result !== undefined) {
      // the score stays where it can be read, in the upper middle of the board
      const parked = bubble({ text: `The game is over. You scored ${o.result}.` }, "bubble parked");
      parked.style.top = `${RESULT_AT * 100}%`;
      field.append(parked);
      const clear = stop;
      stop = () => {
        clear();
        parked.remove();
      };
    }
  };

  // In the capture phase, so that a key which starts or ends the splash is not also a move in the game.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || MODIFIERS.has(e.key)) return;
      if (!open()) {
        if (e.key === "Escape" || e.key === "h" || e.key === "H" || e.key === "?") show();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || performance.now() < guardUntil) return;
      if (e.key === "n" || e.key === "N") return opts.onNew();
      return opts.canContinue() ? hide() : opts.onNew();
    },
    true,
  );
  return { get open() { return open(); }, show, hide };
}
