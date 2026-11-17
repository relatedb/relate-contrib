// The splash screen (ADR-011, amended 2026-11-17): the game's one screen of words. It opens on every load, and again on
// Esc (or H, ?) as the pause screen. Enter continues the game in progress, N starts a new one on a random island;
// choosing new game is the confirmation that abandons the old one. It only reads its inputs; main.ts owns the game.
import { PERFECT } from "./game/score.js";
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

export function createSplash(opts: SplashOptions): Splash {
  const root = document.getElementById("splash")!;
  const result = document.getElementById("result")!;
  const scores = document.getElementById("scores")!;
  const cont = document.getElementById("continue") as HTMLButtonElement;
  const fresh = document.getElementById("new") as HTMLButtonElement;
  const open = () => !root.hidden;

  const render = (score?: number) => {
    const s = opts.scores();
    const n = (v: number | null) => (v === null ? "none yet" : String(v));
    scores.textContent = `Last game: ${n(s.last)}. Best: ${n(s.best)}. A perfect game scores ${PERFECT}.`;
    result.hidden = score === undefined;
    if (score !== undefined) result.textContent = `The game is over. You scored ${score}.`;
    cont.hidden = !opts.canContinue();
    (cont.hidden ? fresh : cont).focus({ preventScroll: true });
  };
  const hide = () => {
    root.hidden = true;
  };
  const show = (o: { result?: number } = {}) => {
    root.hidden = false;
    render(o.result);
  };

  cont.addEventListener("click", hide);
  fresh.addEventListener("click", () => opts.onNew());
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const toggle = e.key === "Escape" || e.key === "h" || e.key === "H" || e.key === "?";
    if (!open()) {
      if (toggle) show();
      return;
    }
    if (e.key === "n" || e.key === "N") return opts.onNew();
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return opts.canContinue() ? hide() : opts.onNew();
    }
    if (toggle && opts.canContinue()) hide();
  });
  return { get open() { return open(); }, show, hide };
}
