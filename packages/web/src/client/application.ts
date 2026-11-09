// The application-mode half of the client (ADR-009): resolving the seed into an init message, the storage status,
// the departing page releasing its store, and the calls that are only meaningful with an application graph.
import { validateApplication, type NormalisedApplication } from "../application/options.js";
import { readPersisted, requestPersistence, StorageHolder, storageEstimate } from "../application/storage.js";
import type { ApplicationOptions, StorageStatus } from "../application/types.js";
import { validateDescriptor } from "../data/descriptor.js";
import type { Descriptor, GraphDocument } from "../data/types.js";
import type { ApplicationInit } from "../worker/protocol.js";
import type { StorageMessage } from "../worker/protocol.js";
import type { ClientOptions } from "./types.js";

const absolute = (url: string | URL, base: string): string => new URL(String(url), base).href;

/** A problem with the seed found on the page: reported as the matching init failure. */
export class SeedProblem extends Error {
  constructor(readonly reason: "worker-error" | "invalid-descriptor", message: string) {
    super(message);
  }
}

/**
 * Where the seed is. Inline data is checked here; a URL is passed on unresolved, because fetching it on every start would
 * download a seed that a ready store never uses. The worker fetches it only when the store needs it.
 */
function resolveSeed(seed: NormalisedApplication["seed"]): ApplicationInit["seed"] {
  if (typeof seed === "string") return { document: null, dataUrl: null, descriptor: null, url: absolute(seed, location.href) };
  if (seed && typeof seed === "object" && "nodes" in seed) {
    return { document: seed as GraphDocument, dataUrl: null, descriptor: null, url: null };
  }
  const checked = validateDescriptor(seed);
  if (!checked.ok) throw new SeedProblem("invalid-descriptor", `${checked.path}: ${checked.message}`);
  const descriptor: Descriptor = checked.descriptor;
  return { document: null, dataUrl: absolute(descriptor.data.url, location.href), descriptor, url: null };
}

export class ApplicationSupport {
  readonly app: NormalisedApplication;
  readonly holder: StorageHolder;
  /** `reset` for the one start that `resetApplication()` asks for; every other start (a replaced worker) opens. */
  intent: "open" | "reset" = "open";
  /** The page has been hidden and its worker ended; a restore from the back-forward cache starts it again. */
  released = false;
  private listeners: Array<[string, (e: Event) => void]> = [];

  constructor(options: ClientOptions, onStorage: (status: StorageStatus) => void) {
    if (options.application && options.graph) throw new Error("createClient takes exactly one of `graph` and `application`");
    this.app = validateApplication(options.application as ApplicationOptions);
    this.holder = new StorageHolder(onStorage);
  }

  /** The application part of the init message; `seed` is resolved here, on the page. */
  async init(): Promise<ApplicationInit> {
    const { app } = this;
    // The reset intent stays until the instance is ready (the client calls `confirmed()`), so a start that fails after a
    // reset was asked for is retried as a reset, not as an open that would pass for success.
    const intent = this.intent;
    return {
      name: app.name,
      version: app.version,
      intent,
      seed: resolveSeed(app.seed),
      indexes: app.indexes,
      migrations: app.migrations,
      onUnavailable: app.onUnavailable,
      onError: app.onError,
      whenLocked: app.whenLocked,
    };
  }

  /** The instance is ready: a reset, if one was asked for, has happened. Later starts open. */
  confirmed(): void {
    this.intent = "open";
  }

  /** A storage report from the worker; the page adds what only it can ask the browser. */
  onStorage(msg: StorageMessage): void {
    this.holder.apply({ kind: msg.kind, ...(msg.reason ? { reason: msg.reason } : {}) });
    void readPersisted().then((p) => this.holder.setPersisted(p));
  }

  /** Listen for the page leaving (`onHide`) and being restored from the back-forward cache (`onRestore`). */
  watchPage(onHide: () => void, onRestore: () => void): void {
    const target = globalThis as { addEventListener?: (t: string, l: (e: Event) => void) => void };
    if (!target.addEventListener) return;
    const hide = (): void => onHide();
    const show = (e: Event): void => {
      if ((e as PageTransitionEvent).persisted) onRestore();
    };
    this.listeners = [["pagehide", hide], ["pageshow", show]];
    for (const [type, listener] of this.listeners) target.addEventListener(type, listener);
  }

  unwatchPage(): void {
    const target = globalThis as { removeEventListener?: (t: string, l: (e: Event) => void) => void };
    for (const [type, listener] of this.listeners) target.removeEventListener?.(type, listener);
    this.listeners = [];
  }

  requestPersistence = async (): Promise<boolean> => {
    const granted = await requestPersistence();
    this.holder.setPersisted((await readPersisted()) ?? granted);
    return granted;
  };

  storageEstimate = storageEstimate;
}
