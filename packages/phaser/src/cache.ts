// The reply cache (ADR-012, 2.3 and 2.5). The frame loop reads `state` and never awaits; actions change it through the
// queue, the engine's replies patch it, and a new client generation rebuilds it. The game defines the shape of the
// state and writes the patches; the cache holds what is the same in every game.
import { GraphError } from "@relate/web";
import type { Client } from "@relate/web";
import { Bridge } from "./bridge.js";

export type CacheStatus = "loading" | "ready" | "recovering" | "failed";

/** What the cache reads of a core client. */
export type CacheClient = Pick<Client, "query" | "status" | "generation" | "onGeneration"> & {
  on(event: "status", listener: (payload: { status: CacheStatus; generation: number }) => void): () => void;
};

export type Patch<S> = (state: S) => void;

export interface CacheOptions<S> {
  client: CacheClient;
  /** The queue to use; by default one over the client. */
  bridge?: Bridge;
  initial: S;
  /** The game's read statements: run through the queue, they return the patch that fills the state. */
  load: (bridge: Bridge) => Promise<Patch<S>>;
}

export interface Action<S> {
  /** Change the state at once; return the function that undoes it. Called when the action's turn comes. */
  optimistic?: (state: S) => () => void;
  /** The game's statements, through the queue, committing the patches their replies call for. */
  run: (commit: (patch: Patch<S>) => void, bridge: Bridge) => Promise<void>;
}

export type ActResult = { ok: true } | { ok: false; error: Error };

export class ReplyCache<S> {
  readonly state: S;
  /** Bumped by every commit, rollback and status change, so a frame loop can redraw only when something changed. */
  version = 0;
  /** The key of the one action awaiting its reply, or null. */
  pending: string | null = null;
  status: CacheStatus;
  readonly bridge: Bridge;
  private loadedGeneration = 0;
  private destroyed = false;
  /** Actions scheduled and not yet finished. */
  private depth = 0;
  private turn: Promise<unknown> = Promise.resolve();
  private readonly off: Array<() => void> = [];
  private firstLoad: { promise: Promise<void>; resolve: () => void } | null = null;

  constructor(private readonly opts: CacheOptions<S>) {
    this.state = opts.initial;
    this.status = opts.client.status;
    this.bridge = opts.bridge ?? Bridge.forClient(opts.client);
    this.off.push(
      opts.client.on("status", ({ status }) => {
        if (this.destroyed || status === this.status) return;
        this.status = status;
        this.version++;
      }),
      opts.client.onGeneration(async (generation) => {
        if (this.destroyed || generation <= this.loadedGeneration) return;
        await this.reload();
      }),
    );
  }

  /** The first load. If the client has no instance yet, it is made when the first one is ready. */
  start(): Promise<void> {
    if (this.opts.client.generation > 0) return this.reload();
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.firstLoad = { promise, resolve };
    return promise;
  }

  /** Apply a change to the state and bump `version`. A patch that throws leaves `version` unchanged and the error reaches the caller. */
  commit(patch: Patch<S>): void {
    patch(this.state);
    this.version++;
  }

  /** Run the game's reads and commit the result in one step. A rejected read commits nothing. */
  reload(): Promise<void> {
    return this.exclusive(async () => {
      if (this.destroyed) return;
      const generation = this.opts.client.generation;
      try {
        const patch = await this.opts.load(this.bridge);
        this.loadedGeneration = Math.max(this.loadedGeneration, generation);
        this.commit(patch);
      } catch {
        /* the previous state stays; the client's status says what is wrong */
      } finally {
        if (this.firstLoad) {
          this.firstLoad.resolve();
          this.firstLoad = null;
        }
      }
    });
  }

  /**
   * One action: it holds `pending` while it runs, applies its optimistic change when its turn comes, and never throws.
   * A rejection rolls the optimistic change back and is returned. While the client has failed, nothing is queued.
   */
  act(key: string, action: Action<S>): Promise<ActResult> {
    if (this.status === "failed") return Promise.resolve({ ok: false, error: new GraphError("failed", "the graph has failed") });
    // with no action ahead, the key shows at once, so a game that guards its input on `pending` sees it in the same tick
    if (this.depth === 0) {
      this.pending = key;
      this.version++;
    }
    this.depth++;
    return this.exclusive(async (): Promise<ActResult> => {
      this.pending = key;
      this.version++;
      let undo: (() => void) | undefined;
      try {
        if (action.optimistic) {
          let produced: (() => void) | undefined;
          this.commit((s) => {
            produced = action.optimistic!(s);
          });
          undo = produced;
        }
        await action.run((patch) => this.commit(patch), this.bridge);
        return { ok: true };
      } catch (err) {
        if (undo) this.commit(() => undo!());
        return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
      } finally {
        this.depth--;
        this.pending = this.depth > 0 ? this.pending : null;
        this.version++;
      }
    });
  }

  /** Stop following the client. */
  destroy(): void {
    this.destroyed = true;
    for (const off of this.off) off();
    this.off.length = 0;
  }

  /** Run `fn` after everything before it has finished: an action waits for a pending one, and for a reload. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.turn.then(fn, fn);
    this.turn = next.catch(() => undefined);
    return next;
  }
}
