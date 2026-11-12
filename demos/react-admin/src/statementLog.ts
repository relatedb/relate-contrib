// What the provider reports through onStatement, kept so the statement panel can show it (FR-022).
export interface Logged {
  n: number;
  statement: string;
  params: object;
}

const MAX = 40;
let entries: Logged[] = [];
let counter = 0;
const listeners = new Set<() => void>();

export function record(statement: string, params: object): void {
  entries = [{ n: ++counter, statement, params }, ...entries].slice(0, MAX);
  for (const l of listeners) l();
}

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const snapshot = (): Logged[] => entries;
