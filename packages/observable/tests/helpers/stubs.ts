// Stand-ins for the core's client and for Framework's file attachments, for unit tests of `open`.
import { vi } from "vitest";

export type Listener = (payload: unknown) => void;

export function stubClient(initial = "loading") {
  const listeners = new Map<string, Listener[]>();
  const client = {
    status: initial,
    destroy: vi.fn(),
    failureMessage: () => "the graph could not be loaded (wording from the core)",
    query: vi.fn(async (_s: string, _p?: unknown) => ({ columns: ["n"], columnTypes: ["INTEGER"], rows: [{ n: 1 }] })),
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return () => undefined;
    },
    emit(event: string, payload: unknown) {
      for (const l of listeners.get(event) ?? []) l(payload);
    },
    setStatus(status: string) {
      client.status = status;
      client.emit("status", { status });
    },
  };
  return client;
}

/** A file attachment as a cell gets one: a location and parsed content, each counted. */
export function attachment(location: string, json: unknown = null) {
  return { url: vi.fn(async () => location), json: vi.fn(async () => json) };
}

/** A page's event target, so `pagehide` and `pageshow` can be dispatched in Node. */
export function installPage() {
  const target = new EventTarget();
  const reload = vi.fn();
  const workers: Array<{ url: string; options: unknown }> = [];
  Object.assign(globalThis, {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    location: { reload },
    Worker: class {
      constructor(url: string, options: unknown) {
        workers.push({ url, options });
      }
    },
  });
  return {
    reload,
    workers,
    pagehide: () => target.dispatchEvent(new Event("pagehide")),
    pageshow: (persisted: boolean) => target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted })),
  };
}
