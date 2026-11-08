// Opening the durable store with a bounded retry when another holder has it locked (ADR-001 2.2).
import { STORE_RETRY } from "../config.js";
import { Engine, StorageLockedError } from "./engine.js";

/** Waits between attempts: from the first wait, doubling up to the longest, until the budget is spent. */
export function* retryWaits(config: { initialMs: number; maxMs: number; totalMs: number } = STORE_RETRY): Generator<number> {
  let wait = config.initialMs;
  let remaining = config.totalMs;
  while (remaining > 0) {
    const next = Math.min(wait, remaining);
    yield next;
    remaining -= next;
    wait = Math.min(wait * 2, config.maxMs);
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Open the store `rel-<id>`. A locked store is retried on the schedule above; `onRetry` hears each wait. Returns
 * null when the store stays locked or cannot be opened at all, and the caller continues in memory.
 */
export async function openStore(
  id: string,
  onRetry: (attempt: number, waitMs: number) => void,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<Engine | null> {
  const waits = retryWaits();
  let attempt = 0;
  for (;;) {
    try {
      return await Engine.store(id);
    } catch (e) {
      if (!(e instanceof StorageLockedError)) return null;
      const next = waits.next();
      if (next.done) return null;
      attempt++;
      onRetry(attempt, next.value);
      await sleep(next.value);
    }
  }
}
