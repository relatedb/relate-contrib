// A small typed event emitter. With no listener for an event, nothing is built or delivered (FR-036), and events
// are delivered only to listeners registered in this page.
import type { Status } from "./status.js";

export interface Events {
  status: { status: Status; generation: number };
  replaced: { reason: "trap" | "timeout" | "worker-error" | "stopped"; generation: number };
  timing: { phase: "init" | "open" | "load" | "restore" | "total"; ms: number; restored: boolean };
}

type Listener<E extends keyof Events> = (payload: Events[E]) => void;

export class Emitter {
  private readonly listeners = new Map<keyof Events, Set<Listener<any>>>();

  on<E extends keyof Events>(event: E, listener: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  has(event: keyof Events): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  /** The payload is built only when someone is listening, and once however many listeners there are. */
  emit<E extends keyof Events>(event: E, payload: () => Events[E]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    const built = payload();
    for (const listener of [...set]) {
      try {
        listener(built);
      } catch {
        /* a listener's error must not disturb the client or other listeners */
      }
    }
  }
}
