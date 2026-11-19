// A client double with what the cache reads: `query`, `status`, `generation`, `on("status", …)` and `onGeneration`. Tests
// drive it: set a status, move to a new generation, and make a call reject the way the core does.
import { GraphError } from "@relate/contrib-web";
import type { Envelope } from "../../src/bridge.js";

export type Status = "loading" | "ready" | "recovering" | "failed";

export class FakeClient {
  status: Status;
  generation: number;
  /** Every statement sent, in order. */
  readonly calls: string[] = [];
  /** When set, the next call rejects with this error (once). */
  rejectNext: Error | null = null;
  private readonly statusListeners = new Set<(p: { status: Status; generation: number }) => void>();
  private readonly generationListeners = new Set<(g: number) => void | Promise<void>>();

  constructor(
    private readonly handler: (statement: string, params?: object | null) => Promise<Envelope> | Envelope,
    status: Status = "ready",
  ) {
    this.status = status;
    this.generation = status === "ready" ? 1 : 0; // the core's generation is 0 until the first instance is ready
  }

  query = async (statement: string, params?: object | null): Promise<Envelope> => {
    this.calls.push(statement);
    if (this.rejectNext) {
      const err = this.rejectNext;
      this.rejectNext = null;
      throw err;
    }
    return this.handler(statement, params);
  };

  on(event: "status", listener: (p: { status: Status; generation: number }) => void): () => void;
  on(event: string, listener: (p: never) => void): () => void;
  on(_event: string, listener: (p: never) => void): () => void {
    const l = listener as (p: { status: Status; generation: number }) => void;
    this.statusListeners.add(l);
    return () => void this.statusListeners.delete(l);
  }

  onGeneration(listener: (g: number) => void | Promise<void>): () => void {
    this.generationListeners.add(listener);
    return () => void this.generationListeners.delete(listener);
  }

  setStatus(status: Status): void {
    this.status = status;
    for (const l of [...this.statusListeners]) l({ status, generation: this.generation });
  }

  /** The first instance becomes ready: generation 1, status `ready`, then the listeners. */
  async becomeReady(): Promise<void> {
    this.generation++;
    this.setStatus("ready");
    for (const l of [...this.generationListeners]) await l(this.generation);
  }

  /** The core's order: a replaced instance goes `recovering`, then `ready` at the next generation, then listeners run. */
  async replaceInstance(): Promise<void> {
    this.setStatus("recovering");
    this.generation++;
    this.setStatus("ready");
    for (const l of [...this.generationListeners]) await l(this.generation);
  }

  lost(): GraphError {
    return new GraphError("lost", "the instance was replaced");
  }
}
