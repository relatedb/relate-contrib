// The last score and the personal best (ADR-011, amended 2026-11-17). They live in the browser's storage, outside the
// graph: the graph is the game in progress, and a new game replaces it, but a score outlives it.

export interface Scores {
  last: number | null;
  best: number | null;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "path-explorer-scores";

/** Read the scores; absent, unreadable or damaged storage gives none. */
export function loadScores(store: KeyValueStore | undefined): Scores {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return { last: null, best: null };
    const parsed = JSON.parse(raw) as Partial<Scores>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { last: num(parsed.last), best: num(parsed.best) };
  } catch {
    return { last: null, best: null };
  }
}

/** Record a finished game: it is the last score, and the best if it beats the best. Storage that fails is ignored. */
export function recordScore(store: KeyValueStore | undefined, score: number): Scores {
  const before = loadScores(store);
  const scores = { last: score, best: Math.max(score, before.best ?? 0) };
  try {
    store?.setItem(KEY, JSON.stringify(scores));
  } catch {
    /* the score simply is not kept */
  }
  return scores;
}
