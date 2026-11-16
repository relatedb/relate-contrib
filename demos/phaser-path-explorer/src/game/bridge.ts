// The database bridge (ADR-011, 2.6). The frame loop never awaits: actions push statements onto an outbox, a single
// pump outside the frame loop drains it in order, one statement at a time, and replies resolve the promises that
// callers hold. Rendering reads only the cache that replies patch (state.ts).

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
  private pumping = false;
  /** Statements queued or in flight, for a "thinking" indicator. */
  pending = 0;

  constructor(private readonly query: QueryFn) {}

  /** Queue a statement. Resolves with its rows, or rejects with the engine's error. Never blocks the caller. */
  enqueue(statement: string, params: object | null = null): Promise<Row[]> {
    return new Promise((resolve, reject) => {
      this.outbox.push({ statement, params, resolve, reject });
      this.pending++;
      void this.pump();
    });
  }

  /** Resolves when everything queued so far has been answered. */
  async idle(): Promise<void> {
    while (this.pending > 0) await new Promise((r) => setTimeout(r, 0));
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (let job = this.outbox.shift(); job; job = this.outbox.shift()) {
        try {
          const res = await this.query(job.statement, job.params);
          if (res.error) job.reject(new Error(res.error));
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
  }
}
