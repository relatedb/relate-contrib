// A small typed event emitter. With no listener for an event, nothing is built or delivered (FR-036), and events
// are delivered only to listeners registered in this page.
import type { StorageStatus } from "../application/types.js";
import type { Status } from "./status.js";
import type { StatementEvent } from "./statements.js";

export interface Events {
  status: { status: Status; generation: number };
  replaced: { reason: "trap" | "timeout" | "worker-error" | "stopped"; generation: number };
  storage: StorageStatus;
  timing: { phase: "init" | "open" | "load" | "restore" | "total"; ms: number; restored: boolean };
  statement: StatementEvent;
  revision: { revision: number; generation: number };
}

/** Options a listener may give. `params` is honoured for the `statement` event only. */
export interface ListenOptions {
  params?: boolean;
}

type Listener<E extends keyof Events> = (payload: Events[E]) => void;

export class Emitter {
  private readonly listeners = new Map<keyof Events, Set<Listener<any>>>();

  private readonly options = new Map<Listener<any>, ListenOptions>();

  on<E extends keyof Events>(event: E, listener: Listener<E>, options?: ListenOptions): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    if (options) this.options.set(listener, options);
    return () => {
      set.delete(listener);
      this.options.delete(listener);
    };
  }

  has(event: keyof Events): boolean {
    return (this.listeners.get(event)?.size ?? 0) > 0;
  }

  /** The payload is built only when someone is listening, and once however many listeners there are. */
  emit<E extends keyof Events>(event: E, payload: () => Events[E], extra?: () => object): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    const built = payload();
    // `extra` (built once, only if a listener asked for it) goes to the listeners that opted in, and to no one else
    let added: object | null = null;
    for (const listener of [...set]) {
      try {
        if (extra && this.options.get(listener)?.params) listener({ ...built, ...(added ??= extra()) });
        else listener(built);
      } catch {
        /* a listener's error must not disturb the client or other listeners */
      }
    }
  }
}
