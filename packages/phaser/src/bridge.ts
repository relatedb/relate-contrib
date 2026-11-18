// The statement queue (ADR-012, 2.2). A Phaser frame loop never awaits: actions push statements here, a single pump
// outside the frame loop drains them in order, one statement at a time, and each caller holds a promise of its rows.
import type { Client } from "@relate/web";
import { StatementError } from "./errors.js";

export type Row = Record<string, unknown>;
export interface Envelope {
  error: string | null;
  rows: Row[];
}
export type QueryFn = (statement: string, params?: object | null) => Promise<Envelope>;

interface Job {
  statement: string;
  params: object | null;
  resolve: (rows: Row[]) => void;
  reject: (error: Error) => void;
}

export class Bridge {
  private readonly outbox: Job[] = [];
  private readonly settleListeners = new Set<() => void>();
  private pumping = false;
  /** Statements queued or in flight, for a "thinking" indicator. */
  pending = 0;

  constructor(private readonly query: QueryFn) {}

  /** A queue over a core client. A client fault rejects with the client's own `GraphError`. */
  static forClient(client: Pick<Client, "query">): Bridge {
    return new Bridge((statement, params) => client.query(statement, params) as Promise<Envelope>);
  }

  /** Queue a statement. Resolves with its rows; rejects with `StatementError` (the engine refused it) or the client's error. Never blocks the caller. */
  enqueue(statement: string, params: object | null = null): Promise<Row[]> {
    return new Promise((resolve, reject) => {
      this.outbox.push({ statement, params, resolve, reject });
      this.pending++;
      void this.pump();
    });
  }

  /** Resolves when everything queued so far has been answered. */
  idle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.onSettle(() => {
        off();
        resolve();
      });
    });
  }

  /** Call `listener` each time the queue becomes empty. Returns the function that stops it. */
  onSettle(listener: () => void): () => void {
    this.settleListeners.add(listener);
    return () => void this.settleListeners.delete(listener);
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (let job = this.outbox.shift(); job; job = this.outbox.shift()) {
        try {
          const res = await this.query(job.statement, job.params);
          if (res.error) job.reject(new StatementError(res.error));
          else job.resolve(res.rows);
        } catch (err) {
          job.reject(err instanceof Error ? err : new Error(String(err)));
        } finally {
          this.pending--;
        }
      }
    } finally {
      this.pumping = false;
    }
    for (const listener of [...this.settleListeners]) {
      try {
        listener();
      } catch {
        /* one listener's failure must not stop the others */
      }
    }
  }
}
