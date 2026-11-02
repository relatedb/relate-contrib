// The page-side client: owns a worker that holds one engine instance, and exposes its status, queries and
// subscriptions (specs contracts/client-api.md). Each client is independent; there is no module-level state.
import { validateDescriptor } from "../data/descriptor.js";
import type { Descriptor, Envelope, GraphDocument, IndexSpec } from "../data/types.js";
import { GraphError } from "../errors.js";
import { encodeParams } from "../worker/encode.js";
import type { ClientMessage, InitFailReason, InitMessage, Timings, WorkerMessage } from "../worker/protocol.js";
import { diagnosticMessage } from "./diagnostic.js";
import { Emitter, type Events } from "./events.js";
import { FailureCounter } from "./failure.js";
import { StatusMachine, type Status } from "./status.js";
import { Registry, type Unsubscribe, type Update } from "./subscriptions.js";
import type { Client, ClientOptions, Diagnostic, Run } from "./types.js";

interface Pending {
  resolve: (value: Envelope) => void;
  reject: (reason: GraphError) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** A start-up problem found on the page before the worker was asked to do anything. */
class StartFailure extends Error {
  readonly reason: InitFailReason;
  constructor(reason: InitFailReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

const defaultWorker = (): Worker => new Worker(new URL("../worker/worker.js", import.meta.url), { type: "module" });
const absolute = (url: string | URL, base: string): string => new URL(String(url), base).href;

export function createClient(options: ClientOptions): Client {
  return new GraphClient(options);
}

class GraphClient implements Client {
  diagnostic: Diagnostic | null = null;

  private readonly machine: StatusMachine;
  private readonly registry = new Registry();
  private readonly emitter = new Emitter();
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 0;
  private readonly failures = new FailureCounter();
  /** Why the instance now starting replaces a ready one; reported when the replacement is ready. */
  private replacing: Events["replaced"]["reason"] | null = null;
  private readonly scopes = new Set<string>();
  private destroyed = false;
  private waiters: Array<{ resolve: () => void; reject: (e: GraphError) => void }> = [];

  constructor(private readonly options: ClientOptions) {
    this.machine = new StatusMachine((status, generation) => this.onStatus(status, generation));
    void this.start();
  }

  get status(): Status {
    return this.machine.status;
  }

  get generation(): number {
    return this.machine.generation;
  }

  // ---- queries -----------------------------------------------------------------------------------------------
  async query(statement: string, params: object | null = null, opts: { timeoutMs?: number } = {}): Promise<Envelope> {
    await this.whenReady();
    return this.execute(statement, params, opts.timeoutMs);
  }

  run(): Run {
    throw new Error("run() is added with user story 6");
  }

  subscribe(statement: string, params: object | null, listener: (update: Update) => void): Unsubscribe {
    return this.registry.subscribe(
      statement,
      params,
      listener,
      { status: this.status, generation: this.generation },
      (s, p) => this.execute(s, p, undefined),
    );
  }

  onGeneration(listener: (generation: number) => void | Promise<void>): Unsubscribe {
    return this.registry.onGeneration(listener);
  }

  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): Unsubscribe {
    return this.emitter.on(event, listener);
  }

  async addScoped(document: GraphDocument, scope: string): Promise<void> {
    await this.whenReady();
    this.scopes.add(scope);
    await this.request((id) => ({ type: "scoped-add", id, scope, document }), undefined);
  }

  async dropScope(scope: string): Promise<void> {
    try {
      await this.whenReady();
      await this.request((id) => ({ type: "scoped-drop", id, scope }), undefined);
    } finally {
      this.scopes.delete(scope);
    }
  }

  async dropAllScopes(): Promise<void> {
    await Promise.all([...this.scopes].map((scope) => this.dropScope(scope).catch(() => undefined)));
  }

  retry(): void {
    if (this.status !== "failed" || this.destroyed) return;
    this.diagnostic = null;
    this.failures.reset();
    this.machine.markLoading();
    void this.start();
  }

  failureMessage(): string {
    return diagnosticMessage(this.diagnostic, this.options.issueUrl);
  }

  destroy(): void {
    this.destroyed = true;
    this.terminateWorker();
    this.rejectPending(new GraphError("lost", "the client was destroyed"));
    this.rejectWaiters(new GraphError("lost", "the client was destroyed"));
  }

  // ---- starting an instance ---------------------------------------------------------------------------------
  private async prepare(): Promise<Omit<InitMessage, "type" | "attempt">> {
    const engineUrl = absolute(this.options.engineUrl, location.href);
    const graph = this.options.graph;
    if ("descriptor" in graph) {
      let value: unknown = graph.descriptor;
      let base = location.href;
      if (typeof value === "string") {
        base = absolute(value, location.href);
        const response = await fetch(base);
        if (!response.ok) throw new StartFailure("worker-error", `the descriptor could not be fetched: ${response.status}`);
        value = await response.json();
      }
      const checked = validateDescriptor(value);
      if (!checked.ok) throw new StartFailure("invalid-descriptor", `${checked.path}: ${checked.message}`);
      const descriptor: Descriptor = checked.descriptor;
      return {
        engineUrl,
        descriptor,
        dataUrl: absolute(descriptor.data.url, base),
        document: null,
        indexes: [],
        useStore: false,
      };
    }
    const indexes: IndexSpec[] = graph.indexes ?? [];
    return typeof graph.document === "string"
      ? { engineUrl, descriptor: null, dataUrl: absolute(graph.document, location.href), document: null, indexes, useStore: false }
      : { engineUrl, descriptor: null, dataUrl: null, document: graph.document, indexes, useStore: false };
  }

  private async start(): Promise<void> {
    if (this.destroyed) return;
    const attempt = this.failures.failures + 1;
    try {
      const init = await this.prepare();
      if (this.destroyed) return;
      const worker = this.options.workerFactory ? this.options.workerFactory() : defaultWorker();
      this.worker = worker;
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        if (worker === this.worker) this.onMessage(e.data);
      };
      worker.onerror = (e: ErrorEvent) => {
        if (worker !== this.worker) return;
        const message = e.message || "the worker failed";
        if (this.status === "ready") this.fault("worker-error");
        else this.attemptFailed("worker-error", message);
      };
      worker.postMessage({ type: "init", ...init, attempt } satisfies ClientMessage);
    } catch (e) {
      if (e instanceof StartFailure) this.attemptFailed(e.reason, e.message);
      else this.attemptFailed("worker-error", e instanceof Error ? e.message : String(e));
    }
  }

  private onMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case "ready":
        this.onReady(msg.restored, msg.timings);
        break;
      case "init-failed":
        this.attemptFailed(msg.reason, msg.message);
        break;
      case "result": {
        const entry = this.take(msg.id);
        entry?.resolve(JSON.parse(msg.envelopeText) as Envelope);
        break;
      }
      case "done": {
        const entry = this.take(msg.id);
        entry?.resolve({ columns: [], rows: [], error: null });
        break;
      }
      case "error": {
        if (msg.reason === "trap") {
          this.take(msg.id)?.reject(new GraphError("trap", msg.message));
          this.fault("trap");
        } else {
          this.take(msg.id)?.reject(new GraphError("invalid-document", msg.message));
        }
        break;
      }
      case "store-retry":
        break;
    }
  }

  private onReady(restored: boolean, timings: Timings): void {
    this.failures.ready();
    this.diagnostic = null;
    this.machine.markReady();
    const generation = this.generation;
    if (this.replacing) {
      const reason = this.replacing;
      this.replacing = null;
      this.emitter.emit("replaced", () => ({ reason, generation }));
    }
    for (const phase of ["init", "open", restored ? "restore" : "load", "total"] as const) {
      const ms = timings[phase];
      if (ms !== undefined) this.emitter.emit("timing", () => ({ phase, ms, restored }));
    }
    this.resolveWaiters();
    void this.registry.ready(generation, (s, p) => this.execute(s, p, undefined));
  }

  /** The instance that was ready is no longer usable: replace it. Calls in flight are lost. */
  private fault(reason: Events["replaced"]["reason"]): void {
    if (this.destroyed || this.status !== "ready") return;
    this.replacing = reason;
    this.terminateWorker();
    this.rejectPending(new GraphError("lost", "the instance was replaced"));
    this.machine.markRecovering();
    void this.start();
  }

  /** An attempt to start an instance ended without reaching `ready`: try again, or stop at the limit. */
  private attemptFailed(reason: InitFailReason, message: string): void {
    this.terminateWorker();
    if (this.failures.attemptFailed(reason) === "retry") {
      this.machine.markRecovering();
      void this.start();
      return;
    }
    this.replacing = null;
    this.diagnostic = { reason, failures: this.failures.failures, engineError: message };
    this.rejectPending(new GraphError("lost", "the instance failed"));
    this.machine.markFailed();
    this.rejectWaiters(new GraphError("failed", message));
  }

  // ---- calls -------------------------------------------------------------------------------------------------
  private whenReady(): Promise<void> {
    if (this.status === "ready") return Promise.resolve();
    if (this.status === "failed") return Promise.reject(new GraphError("failed", this.diagnostic?.engineError ?? "the graph failed to load"));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private execute(statement: string, params: object | null, timeoutMs: number | undefined): Promise<Envelope> {
    const paramsJson = params ? encodeParams(params) : null;
    return this.request((id) => ({ type: "query", id, statement, paramsJson }), timeoutMs);
  }

  /** Send one message that is answered by a result or a done message, with an optional timeout. */
  private request(build: (id: number) => ClientMessage, timeoutMs: number | undefined): Promise<Envelope> {
    const worker = this.worker;
    if (!worker || this.status !== "ready") return Promise.reject(new GraphError("lost", "the instance is not ready"));
    const id = ++this.nextId;
    return new Promise<Envelope>((resolve, reject) => {
      const entry: Pending = { resolve, reject, timer: undefined };
      if (timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          this.take(id)?.reject(new GraphError("timeout"));
          this.fault("timeout");
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      worker.postMessage(build(id));
    });
  }

  private take(id: number): Pending | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;
    this.pending.delete(id);
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    return entry;
  }

  private rejectPending(error: GraphError): void {
    for (const id of [...this.pending.keys()]) this.take(id)?.reject(error);
  }

  private resolveWaiters(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w.resolve();
  }

  private rejectWaiters(error: GraphError): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w.reject(error);
  }

  private terminateWorker(): void {
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }

  private onStatus(status: Status, generation: number): void {
    this.emitter.emit("status", () => ({ status, generation }));
    if (status !== "ready") this.registry.notify(status, generation);
  }
}
