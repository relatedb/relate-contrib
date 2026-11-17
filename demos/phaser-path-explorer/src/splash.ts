// The splash (ADR-011, amended 2026-11-17): the game's words, as grey message bubbles drifting across the board, which
// stays in view behind them. It opens on every load, and again on Esc (or H, ?) as the pause. Any key continues the game
// in progress (or starts a new one when there is none); N starts a new one on a random island, which is the
// confirmation that abandons the old one. It only reads its inputs; main.ts owns the game.
import "@fontsource/share-tech-mono/400.css";
import { bubbleRows, readerText, type BubbleRows, type Message } from "./bubbles.js";
import type { Scores } from "./game/scores.js";
import { ODD_SHIFT, ROW_STEP, TILE_H, TILE_W } from "./hex/core/index.js";

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
  /** The board, so the bubbles sit on its hexes: the size of a cell in screen pixels, and the board's tiles across and down. */
  pixel: number;
  cols: number;
  rows: number;
}

const SPEED = 0.07; // pixels a millisecond, about the pace of reading
const GAP_TILES = 3; // empty tiles between one bubble and the next in a row
const GUARD_MS = 1500; // a game that has just ended ignores keys for a moment, so the last move does not skip the result
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead", "Unidentified"]);
const FONT = '"Share Tech Mono"';

/** The hex rows each band of bubbles appears on; a bubble takes one of them, a different one each time. */
const BANDS = { top: [2, 3, 4], middle: [8, 9, 10, 11], bottom: [14, 15, 16, 17] } as const;
const RESULT_ROW = 6;

interface Grid {
  pixel: number;
  cols: number;
  rows: number;
}

/** A bubble is a run of whole hexes in one row: its top and bottom edges follow the hex points. */
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

/** Put a bubble on the hex row, `tiles` wide, and give it the hexes' outline. */
function fit(el: HTMLElement, g: Grid, row: number): number {
  const p = g.pixel;
  document.getElementById("bubbles")!.append(el);
  const tiles = Math.max(2, Math.ceil(el.offsetWidth / (TILE_W * p)));
  const w = tiles * TILE_W;
  const pts: [number, number][] = [[0, 3]];
  for (let i = 0; i < tiles; i++) pts.push([i * TILE_W + 8, 0], [(i + 1) * TILE_W, 3]);
  pts.push([w, 14]);
  for (let i = tiles - 1; i >= 0; i--) pts.push([i * TILE_W + 8, TILE_H], [i * TILE_W, 14]);
  el.style.width = `${w * p}px`;
  el.style.height = `${TILE_H * p}px`;
  el.style.top = `${row * ROW_STEP * p}px`;
  el.style.clipPath = `polygon(${pts.map(([x, y]) => `${x * p}px ${y * p}px`).join(", ")})`;
  return tiles;
}

/** Where, in cells, a bubble on this row starts so that it lies on the hexes: odd rows are shifted half a tile. */
const shift = (row: number) => (row & 1 ? ODD_SHIFT : 0);

/** Drift the rows across `field`; returns the function that stops them and clears the bubbles. */
function drift(field: HTMLElement, rows: BubbleRows, g: Grid, reduced: boolean): () => void {
  let stopped = false;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, ms);
    timers.add(t);
  };
  const p = g.pixel;
  const run = (name: keyof typeof BANDS, messages: Message[], startAt: number, delay: number) => {
    let i = 0;
    let last = -1;
    const next = (first: boolean) => {
      const options = BANDS[name].filter((r) => r !== last);
      const row = options[Math.floor(Math.random() * options.length)]!;
      last = row;
      const el = bubble(messages[i++ % messages.length]!);
      const tiles = fit(el, g, row);
      const w = tiles * TILE_W; // cells
      const full = g.cols * TILE_W + ODD_SHIFT;
      if (reduced) {
        // no motion: one message at a time, in the middle of its row
        el.style.transform = `translate(${(Math.floor((g.cols - tiles) / 2) * TILE_W + shift(row)) * p}px, 0)`;
        later(() => {
          el.remove();
          next(false);
        }, 7000);
        return;
      }
      // enters just past the right edge and leaves past the left, a tile at a time, always on the hexes
      const start = (first ? Math.floor((full * startAt) / TILE_W) * TILE_W : Math.ceil(full / TILE_W) * TILE_W) + shift(row);
      const steps = Math.ceil((start + w) / TILE_W);
      const move = el.animate(
        [{ transform: `translate(${start * p}px, 0)` }, { transform: `translate(${(start - steps * TILE_W) * p}px, 0)` }],
        { duration: (steps * TILE_W * p) / SPEED, easing: `steps(${steps}, jump-end)`, fill: "forwards" },
      );
      move.onfinish = () => el.remove();
      later(() => next(false), (Math.max(0, start + w + GAP_TILES * TILE_W - full) * p) / SPEED);
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
  let shown = 0; // which showing this is, so that one that has been replaced or hidden does not start late
  const grid: Grid = { pixel: opts.pixel, cols: opts.cols, rows: opts.rows };
  const show = (o: { result?: number } = {}) => {
    stop?.();
    root.hidden = false;
    const mine = ++shown;
    guardUntil = o.result === undefined ? 0 : performance.now() + GUARD_MS;
    const rows = bubbleRows({ scores: opts.scores(), canContinue: opts.canContinue() });
    reader.textContent = readerText(rows, o.result);
    stop = () => {
      shown++;
    };
    // the bubbles are measured in the game's font, so wait for it
    void Promise.all([document.fonts.load(`400 19px ${FONT}`)])
      .catch(() => undefined)
      .then(() => {
        if (shown !== mine) return;
        const clear = drift(field, rows, grid, reduce.matches);
        let parked: HTMLElement | undefined;
        if (o.result !== undefined) {
          // the score stays where it can be read, on the hexes in the upper middle of the board
          parked = bubble({ text: `The game is over. You scored ${o.result}.` }, "bubble parked");
          const tiles = fit(parked, grid, RESULT_ROW);
          parked.style.transform = `translate(${(Math.floor((grid.cols - tiles) / 2) * TILE_W + shift(RESULT_ROW)) * grid.pixel}px, 0)`;
        }
        stop = () => {
          shown++;
          clear();
          parked?.remove();
        };
      });
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
