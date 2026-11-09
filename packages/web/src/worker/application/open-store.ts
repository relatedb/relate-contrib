// Opening an application's store (ADR-009 2.4): the bounded retry of ADR-001, then waiting (or memory) for a locked
// store, memory or failure for a browser with no store, and failure by default for any other open error.
import { APP_STORE_PREFIX, WAIT_RETRY_MS } from "../../config.js";
import type { ApplicationInit } from "../protocol.js";
import { Engine, StorageLockedError } from "../engine.js";
import { retryWaits } from "../store.js";

export type StorageReport = { kind: "durable" } | { kind: "memory"; reason: "unavailable" | "locked" | "error" } | { kind: "waiting"; reason: "locked" };

export type OpenOutcome =
  | { engine: Engine; storage: Exclude<StorageReport, { kind: "waiting" }> }
  | { fail: "unavailable" | "store-unreadable"; message: string };

export interface OpenHooks {
  /** Tell the page the state changed (only `waiting` is sent from here; the caller reports the outcome). */
  report(report: StorageReport): void;
  open?: (name: string) => Promise<Engine>;
  hasStorage?: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  waits?: () => Iterable<number>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** True when the browser gives this worker an origin-private file system. */
export async function storageAvailable(): Promise<boolean> {
  try {
    const nav = (globalThis as { navigator?: { storage?: { getDirectory?: () => Promise<unknown> } } }).navigator;
    if (!nav?.storage?.getDirectory) return false;
    await nav.storage.getDirectory();
    return true;
  } catch {
    return false;
  }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function openApplicationStore(
  app: Pick<ApplicationInit, "name" | "onUnavailable" | "onError" | "whenLocked">,
  hooks: OpenHooks,
): Promise<OpenOutcome> {
  const open = hooks.open ?? ((name: string) => Engine.store(name, APP_STORE_PREFIX));
  const sleep = hooks.sleep ?? defaultSleep;

  if (!(await (hooks.hasStorage ?? storageAvailable)())) {
    if (app.onUnavailable === "fail") return { fail: "unavailable", message: "the browser offers no storage for this application" };
    return { engine: Engine.memory(), storage: { kind: "memory", reason: "unavailable" } };
  }

  const attempt = async (): Promise<OpenOutcome | "locked"> => {
    try {
      return { engine: await open(app.name), storage: { kind: "durable" } };
    } catch (e) {
      if (e instanceof StorageLockedError) return "locked";
      if (app.onError === "memory") return { engine: Engine.memory(), storage: { kind: "memory", reason: "error" } };
      return { fail: "store-unreadable", message: messageOf(e) };
    }
  };

  let outcome = await attempt();
  for (const wait of hooks.waits ? hooks.waits() : retryWaits()) {
    if (outcome !== "locked") return outcome;
    await sleep(wait);
    outcome = await attempt();
  }
  if (outcome !== "locked") return outcome;

  if (app.whenLocked === "memory") return { engine: Engine.memory(), storage: { kind: "memory", reason: "locked" } };
  hooks.report({ kind: "waiting", reason: "locked" });
  for (;;) {
    await sleep(WAIT_RETRY_MS);
    outcome = await attempt();
    if (outcome !== "locked") return outcome;
  }
}
