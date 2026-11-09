// What the page can learn about whether its data is stored (ADR-009 2.4): the current status, its change event, and
// the two on-demand calls to the browser. The browser functions are parameters so that tests can stub them.
import type { StorageStatus } from "./types.js";

export class StorageHolder {
  private current: StorageStatus = { kind: "waiting", persisted: null };

  constructor(private readonly onChange: (status: StorageStatus) => void) {}

  get value(): StorageStatus {
    return this.current;
  }

  /**
   * The worker reported where the data is. A client in memory never becomes durable (it would need a new client),
   * so a later `durable` report is ignored. Returns true when the status changed.
   */
  apply(report: { kind: StorageStatus["kind"]; reason?: StorageStatus["reason"] }): boolean {
    if (this.current.kind === "memory" && report.kind === "durable") return false;
    const next: StorageStatus = { kind: report.kind, persisted: this.current.persisted, ...(report.reason ? { reason: report.reason } : {}) };
    return this.set(next);
  }

  setPersisted(persisted: boolean | null): boolean {
    return this.set({ ...this.current, persisted });
  }

  private set(next: StorageStatus): boolean {
    const a = this.current;
    if (a.kind === next.kind && a.reason === next.reason && a.persisted === next.persisted) return false;
    this.current = next;
    this.onChange(next);
    return true;
  }
}

interface StorageManagerLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

const browserStorage = (): StorageManagerLike | undefined => (globalThis as { navigator?: { storage?: StorageManagerLike } }).navigator?.storage;

/** The browser's answer to `persisted()`, or null when the page cannot ask. */
export async function readPersisted(storage: StorageManagerLike | undefined = browserStorage()): Promise<boolean | null> {
  try {
    return storage?.persisted ? await storage.persisted() : null;
  } catch {
    return null;
  }
}

/** Ask the browser for persistent storage. Only ever called from the application's own action; false when absent or refused. */
export async function requestPersistence(storage: StorageManagerLike | undefined = browserStorage()): Promise<boolean> {
  try {
    return storage?.persist ? Boolean(await storage.persist()) : false;
  } catch {
    return false;
  }
}

export async function storageEstimate(storage: StorageManagerLike | undefined = browserStorage()): Promise<{ usage: number | null; quota: number | null }> {
  try {
    const e = storage?.estimate ? await storage.estimate() : undefined;
    return { usage: e?.usage ?? null, quota: e?.quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}
