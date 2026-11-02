// Registered queries and the listeners called when a new instance is ready (FR-004, FR-005).
import type { Envelope } from "../data/types.js";
import type { Status } from "./status.js";

export interface Update {
  status: Status;
  generation: number;
  rows: Array<Record<string, unknown>> | null;
  error: string | null;
}

export type Unsubscribe = () => void;
export type Runner = (statement: string, params: object | null) => Promise<Envelope>;

interface Subscription {
  statement: string;
  params: object | null;
  listener: (update: Update) => void;
  active: boolean;
}

export class Registry {
  private readonly subscriptions = new Set<Subscription>();
  private readonly generationListeners = new Set<(generation: number) => void | Promise<void>>();
  /** The newest generation seen; results from an older one are dropped. */
  private latest = 0;

  /**
   * Register a query. When the instance is ready it runs at once; otherwise the listener is told the current
   * status (so a component can show its placeholder) and the query runs when the instance is ready.
   */
  subscribe(
    statement: string,
    params: object | null,
    listener: (update: Update) => void,
    current: { status: Status; generation: number },
    run: Runner,
  ): Unsubscribe {
    const subscription: Subscription = { statement, params, listener, active: true };
    this.subscriptions.add(subscription);
    if (current.status === "ready") {
      this.latest = Math.max(this.latest, current.generation);
      void this.runOne(subscription, current.generation, run);
    } else {
      listener({ status: current.status, generation: current.generation, rows: null, error: null });
    }
    return () => {
      subscription.active = false;
      this.subscriptions.delete(subscription);
    };
  }

  /** Register a listener for new instances. It runs before subscriptions re-run, and may be asynchronous. */
  onGeneration(listener: (generation: number) => void | Promise<void>): Unsubscribe {
    this.generationListeners.add(listener);
    return () => void this.generationListeners.delete(listener);
  }

  /** A new instance is ready: run the generation listeners in order, then re-run every subscription. */
  async ready(generation: number, run: Runner): Promise<void> {
    this.latest = generation;
    for (const listener of [...this.generationListeners]) {
      try {
        await listener(generation);
      } catch {
        /* one listener's failure must not stop the others or the subscriptions */
      }
    }
    await Promise.all([...this.subscriptions].map((s) => this.runOne(s, generation, run)));
  }

  /** Tell every subscriber about a status that is not `ready`; their rows are cleared. */
  notify(status: Status, generation: number): void {
    for (const s of [...this.subscriptions]) {
      s.listener({ status, generation, rows: null, error: null });
    }
  }

  private async runOne(subscription: Subscription, generation: number, run: Runner): Promise<void> {
    let envelope: Envelope;
    try {
      envelope = await run(subscription.statement, subscription.params);
    } catch {
      return; // the instance was replaced or failed; the next generation, or `notify`, tells the subscriber
    }
    if (!subscription.active || generation !== this.latest) return;
    subscription.listener(
      envelope.error
        ? { status: "ready", generation, rows: null, error: envelope.error }
        : { status: "ready", generation, rows: envelope.rows, error: null },
    );
  }
}
