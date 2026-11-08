// Page views: data that belongs to one page view, added when the view arrives, dropped when it leaves, and added
// again after the instance is replaced (ADR-001 2.5). A scope identifies the view, not the page, so two tabs on
// the same page cannot remove each other's data.
import type { GraphDocument } from "../data/types.js";
import type { Client } from "./types.js";

export function newScope(): string {
  return globalThis.crypto?.randomUUID?.() ?? `view-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export interface View {
  readonly scope: string;
  /** Resolves when the view's data has been added for the first time (or the attempt has ended). */
  readonly ready: Promise<void>;
  /** Drop the view's data and stop re-adding it. Safe to call while the data is still being added. */
  detach(): Promise<void>;
}

const ignore = (): void => undefined;

/**
 * Add `document` as the data of one page view. If the instance is ready it is added now; otherwise it is added
 * when the next instance is ready, before subscriptions re-run. After a replacement it is added again.
 */
export function attachView(client: Client, document: GraphDocument, scope: string = newScope()): View {
  let detached = false;
  let resolveReady!: () => void;
  const ready = new Promise<void>((resolve) => (resolveReady = resolve));

  const add = async (): Promise<void> => {
    if (detached) return;
    try {
      await client.addScoped(document, scope);
    } finally {
      resolveReady();
    }
    if (detached) await client.dropScope(scope).catch(ignore);
  };

  const off = client.onGeneration(add);
  if (client.status === "ready") void add().catch(ignore);

  return {
    scope,
    ready,
    async detach() {
      detached = true;
      off();
      await client.dropScope(scope).catch(ignore);
      resolveReady();
    },
  };
}
