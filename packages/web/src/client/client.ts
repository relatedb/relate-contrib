// The page-side client: owns a worker that holds one engine instance, and exposes its status, queries and
// subscriptions (specs contracts/client-api.md). Each client is independent; there is no module-level state.
import { validateDescriptor } from "../data/descriptor.js";
import type { Descriptor, Envelope, GraphDocument, IndexSpec } from "../data/types.js";
import { APP_STORE_PREFIX, STORE_PREFIX, VISITOR_TIMEOUT_MS } from "../config.js";
import { GraphError } from "../errors.js";
import { encodeParams } from "../worker/encode.js";
import type { ClientMessage, InitFailReason, InitMessage, Timings, WorkerMessage } from "../worker/protocol.js";
import type { ExportEnvelope, LossReport, StorageStatus } from "../application/types.js";
import { ApplicationSupport, SeedProblem } from "./application.js";
import { diagnosticMessage } from "./diagnostic.js";
import { Emitter, type Events, type ListenOptions } from "./events.js";
import { isWrite, paramFields, recordOf, type Origin, type StatementEvent, type StatementRecord } from "./statements.js";
import { FailureCounter } from "./failure.js";
import { StatusMachine, type Status } from "./status.js";
import { Registry, type Unsubscribe, type Update } from "./subscriptions.js";
import type { Client, ClientInfo, ClientOptions, Diagnostic, Run } from "./types.js";

interface Pending {
  resolve: (value: Envelope) => void;
  reject: (reason: GraphError) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** What a statement the page sent is, so that its reply can be reported (specs/011). */
  meta?: { statement: string; origin: Origin; paramsJson: string | null };
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
  /** Counts the times a worker was ended; a start that began before the latest one has been superseded. */
  private epoch = 0;
  private waiters: Array<{ resolve: () => void; reject: (e: GraphError) => void }> = [];

  private readonly application: ApplicationSupport | null;

  // ---- observing (ADR-001 amendment 2026-11-27) ----
  private revisionCount = 0;
  /** What the worker was last told about whether a `statement` listener exists. */
  private workerObserving = false;
  /** What the worker ran by itself while starting; applied when the instance is ready. */
  private startup: { writes: number; records: StatementRecord[] } = { writes: 0, records: [] };
  private infoBase: Pick<ClientInfo, "name" | "kind"> = { name: null, kind: "memory" };
  private infoValue: ClientInfo | null = null;

  constructor(private readonly options: ClientOptions) {
    if (options.application) {
      this.application = new ApplicationSupport(options, (status) => this.emitter.emit("storage", () => status));
    } else {
      if (!options.graph) throw new Error("createClient takes exactly one of `graph` and `application`");
      this.application = null;
    }
    this.machine = new StatusMachine((status, generation) => this.onStatus(status, generation));
    this.application?.watchPage(
      () => this.release(),
      () => this.restore(),
    );
    void this.start();
  }

  get storage(): StorageStatus {
    return this.application?.holder.value ?? { kind: "memory", persisted: null };
  }

  // ---- application mode (ADR-009) ----------------------------------------------------------------------------
  /** Reset the store and seed it again, on a new worker (the only call that discards stored data). */
  resetApplication(): Promise<void> {
    const application = this.application;
    if (!application) return Promise.reject(new Error("resetApplication is for a client created with `application`"));
    if (this.destroyed) return Promise.reject(new GraphError("lost", "the client was destroyed"));
    this.terminateWorker();
    this.rejectPending(new GraphError("lost", "the instance was reset"));
    application.intent = "reset";
    application.released = false;
    this.diagnostic = null;
    this.failures.reset();
    this.machine.markLoading();
    const done = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    void this.start();
    return done;
  }

  requestPersistence(): Promise<boolean> {
    return this.application ? this.application.requestPersistence() : Promise.resolve(false);
  }

  storageEstimate(): Promise<{ usage: number | null; quota: number | null }> {
    return this.application ? this.application.storageEstimate() : Promise.resolve({ usage: null, quota: null });
  }

  /** Read the whole graph into an export envelope, with what the data format could not carry. */
  async exportApplication(opts: { allowLoss?: boolean } = {}): Promise<{ envelope: ExportEnvelope; losses: LossReport }> {
    if (!this.application) throw new Error("exportApplication is for a client created with `application`");
    await this.whenReady();
    const answer = (await this.request((id) => ({ type: "export-application", id, allowLoss: opts.allowLoss === true }), undefined)) as unknown as {
      envelope: ExportEnvelope | null;
      losses: LossReport;
    };
    if (!answer.envelope) {
      const kinds = answer.losses.map((l) => `${l.count} ${l.kind}`).join(", ");
      const error = new GraphError("export-loss", `the export format cannot carry some values (${kinds}); pass allowLoss: true to export without them`);
      error.losses = answer.losses;
      throw error;
    }
    return { envelope: answer.envelope, losses: answer.losses };
  }

  /** Replace the stored data with an envelope's document. The page exports the current data first; this does not. */
  async importApplication(envelope: ExportEnvelope): Promise<void> {
    if (!this.application) throw new Error("importApplication is for a client created with `application`");
    await this.whenReady();
    await this.request((id) => ({ type: "import-application", id, envelope }), undefined);
  }

  /** The page is leaving: end the worker so that the next page finds the store free (ADR-009 2.2). */
  private release(): void {
    if (this.destroyed || !this.application) return;
    this.application.released = true;
    this.terminateWorker();
  }

  /** A page restored from the back-forward cache starts its instance again. */
  private restore(): void {
    const application = this.application;
    if (this.destroyed || !application?.released) return;
    application.released = false;
    this.rejectPending(new GraphError("lost", "the page was restored"));
    this.machine.markRecovering();
    void this.start();
  }

  get status(): Status {
    return this.machine.status;
  }

  get generation(): number {
    return this.machine.generation;
  }

  get revision(): number {
    return this.revisionCount;
  }

  get info(): ClientInfo | null {
    return this.status === "ready" ? this.infoValue : null;
  }

  // ---- queries -----------------------------------------------------------------------------------------------
  async query(statement: string, params: object | null = null, opts: { timeoutMs?: number } = {}): Promise<Envelope> {
    await this.whenReady();
    return this.execute(statement, params, opts.timeoutMs, "query");
  }

  /**
   * A statement typed by a visitor. It has a timeout (the visitor timeout when none is given) and a stop control;
   * both end by replacing the instance, since a running statement can only be ended by ending its worker.
   */
  run(statement: string, params: object | null = null, opts: { timeoutMs?: number } = {}): Run {
    const timeoutMs = opts.timeoutMs ?? this.options.visitorTimeoutMs ?? VISITOR_TIMEOUT_MS;
    const call: { id: number | null; stopped: boolean } = { id: null, stopped: false };
    const paramsJson = params ? encodeParams(params) : null;
    const result = this.whenReady().then(() => {
      if (call.stopped) throw new GraphError("stopped");
      const started = this.startRequest((id) => ({ type: "query", id, statement, paramsJson }), timeoutMs, { statement, origin: "run", paramsJson });
      call.id = started.id;
      return started.promise;
    });
    return {
      result,
      stop: () => {
        call.stopped = true;
        if (call.id === null) return;
        const entry = this.take(call.id);
        if (!entry) return; // it already finished
        entry.reject(new GraphError("stopped"));
        this.fault("stopped");
      },
    };
  }

  subscribe(statement: string, params: object | null, listener: (update: Update) => void): Unsubscribe {
    return this.registry.subscribe(
      statement,
      params,
      listener,
      { status: this.status, generation: this.generation },
      (s, p) => this.execute(s, p, undefined, "subscription"),
    );
  }

  onGeneration(listener: (generation: number) => void | Promise<void>): Unsubscribe {
    return this.registry.onGeneration(listener);
  }

  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void, options?: ListenOptions): Unsubscribe {
    const off = this.emitter.on(event, listener, options);
    if (event === "statement") this.syncObserve();
    return () => {
      off();
      if (event === "statement") this.syncObserve();
    };
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
    this.application?.unwatchPage();
    this.terminateWorker();
    this.rejectPending(new GraphError("lost", "the client was destroyed"));
    this.rejectWaiters(new GraphError("lost", "the client was destroyed"));
  }

  // ---- starting an instance ---------------------------------------------------------------------------------
  private async prepare(): Promise<Omit<InitMessage, "type" | "attempt">> {
    const engineUrl = absolute(this.options.engineUrl, location.href);
    if (this.application) {
      this.infoBase = { name: `${APP_STORE_PREFIX}${this.application.app.name}`, kind: "application" };
      return {
        engineUrl,
        descriptor: null,
        dataUrl: null,
        document: null,
        indexes: [],
        useStore: false,
        application: await this.application.init(),
      };
    }
    const graph = this.options.graph!;
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
      const useStore = this.options.store ?? this.options.navigation === "multi-page";
      this.infoBase = useStore ? { name: `${STORE_PREFIX}${descriptor.id}`, kind: "cache" } : { name: null, kind: "memory" };
      return {
        engineUrl,
        descriptor,
        dataUrl: absolute(descriptor.data.url, base),
        document: null,
        indexes: [],
        useStore,
      };
    }
    const indexes: IndexSpec[] = graph.indexes ?? [];
    this.infoBase = { name: null, kind: "memory" };
    return typeof graph.document === "string"
      ? { engineUrl, descriptor: null, dataUrl: absolute(graph.document, location.href), document: null, indexes, useStore: false }
      : { engineUrl, descriptor: null, dataUrl: null, document: graph.document, indexes, useStore: false };
  }

  private async start(): Promise<void> {
    if (this.destroyed) return;
    const attempt = this.failures.failures + 1;
    const epoch = this.epoch;
    try {
      const init = await this.prepare();
      // A page hidden, a reset or a destroy while the seed was being resolved supersedes this start.
      if (this.destroyed || epoch !== this.epoch) return;
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
      this.workerObserving = this.emitter.has("statement");
      this.startup = { writes: 0, records: [] };
      worker.postMessage({ type: "init", ...init, attempt, observe: this.workerObserving } satisfies ClientMessage);
    } catch (e) {
      if (e instanceof StartFailure || e instanceof SeedProblem) this.attemptFailed(e.reason, e.message);
      else this.attemptFailed("worker-error", e instanceof Error ? e.message : String(e));
    }
  }

  private onMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case "ready":
        this.onReady(msg.restored, msg.timings, msg.engine ?? null);
        break;
      case "init-failed":
        this.attemptFailed(msg.reason, msg.message);
        break;
      case "result": {
        const entry = this.take(msg.id);
        const envelope = JSON.parse(msg.envelopeText) as Envelope;
        if (entry?.meta) this.reportStatement(entry.meta, envelope);
        entry?.resolve(envelope);
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
        } else if (msg.reason === "migration-failed") {
          // the store is at the last completed version; start again so the client fails with the diagnostic
          this.take(msg.id)?.reject(new GraphError("failed", msg.message));
          this.fault("worker-error");
        } else {
          this.take(msg.id)?.reject(new GraphError("invalid-document", msg.message));
        }
        break;
      }
      case "statements":
        this.onStatements(msg.writes, msg.records);
        break;
      case "store-retry":
        break;
      case "storage":
        this.application?.onStorage(msg);
        break;
      case "application-exported": {
        // an export's answer is not an engine envelope; `exportApplication` reads it as what it is
        this.take(msg.id)?.resolve(msg as unknown as Envelope);
        break;
      }
    }
  }

  private onReady(restored: boolean, timings: Timings, engine: string | null): void {
    this.application?.confirmed();
    this.failures.ready();
    this.diagnostic = null;
    // a new instance starts a new revision: what it wrote while starting is the first of it
    const startup = this.startup;
    this.startup = { writes: 0, records: [] };
    this.revisionCount = startup.writes;
    this.infoValue = { ...this.infoBase, readOnly: false, engine };
    this.machine.markReady();
    const generation = this.generation;
    for (const record of startup.records) this.reportRecord(record, "internal");
    if (startup.writes > 0) this.emitter.emit("revision", () => ({ revision: this.revisionCount, generation }));
    this.syncObserve();
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
    void this.registry.ready(generation, (s, p) => this.execute(s, p, undefined, "subscription"));
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

  // ---- observing -----------------------------------------------------------------------------------------------
  /** Tell the worker whether a `statement` listener exists, when it has not been told so already. */
  private syncObserve(): void {
    const want = this.emitter.has("statement");
    // a worker that is still starting is told when it is ready (and its init message carried what was true then)
    if (want === this.workerObserving || !this.worker || this.status !== "ready") return;
    this.workerObserving = want;
    this.worker.postMessage({ type: "observe", on: want } satisfies ClientMessage);
  }

  /** A statement the page sent has been answered. */
  private reportStatement(meta: NonNullable<Pending["meta"]>, envelope: Envelope): void {
    this.emitter.emit(
      "statement",
      () => ({ ...recordOf(meta.statement, envelope), origin: meta.origin }) satisfies StatementEvent,
      () => paramFields(meta.paramsJson),
    );
    if (isWrite(envelope.stats)) this.stepRevision(1);
  }

  /** A statement the worker ran by itself. */
  private reportRecord(record: StatementRecord, origin: Origin): void {
    this.emitter.emit("statement", () => ({ ...record, origin }) satisfies StatementEvent);
  }

  private stepRevision(by: number): void {
    this.revisionCount += by;
    const generation = this.generation;
    this.emitter.emit("revision", () => ({ revision: this.revisionCount, generation }));
  }

  /** What the worker ran by itself: held while the instance starts, reported at once when it is ready. */
  private onStatements(writes: number, records: StatementRecord[] | null): void {
    if (this.status !== "ready") {
      this.startup.writes += writes;
      if (records) this.startup.records.push(...records);
      return;
    }
    for (const record of records ?? []) this.reportRecord(record, "internal");
    if (writes > 0) this.stepRevision(writes);
  }

  // ---- calls -------------------------------------------------------------------------------------------------
  private whenReady(): Promise<void> {
    if (this.status === "ready") return Promise.resolve();
    if (this.status === "failed") return Promise.reject(new GraphError("failed", this.diagnostic?.engineError ?? "the graph failed to load"));
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  private execute(statement: string, params: object | null, timeoutMs: number | undefined, origin: Origin): Promise<Envelope> {
    const paramsJson = params ? encodeParams(params) : null;
    return this.startRequest((id) => ({ type: "query", id, statement, paramsJson }), timeoutMs, { statement, origin, paramsJson }).promise;
  }

  /** Send one message that is answered by a result or a done message, with an optional timeout. */
  private request(build: (id: number) => ClientMessage, timeoutMs: number | undefined): Promise<Envelope> {
    return this.startRequest(build, timeoutMs).promise;
  }

  /** As `request`, also giving the call's id so that it can be stopped. */
  private startRequest(
    build: (id: number) => ClientMessage,
    timeoutMs: number | undefined,
    meta?: Pending["meta"],
  ): { id: number | null; promise: Promise<Envelope> } {
    const worker = this.worker;
    if (!worker || this.status !== "ready") return { id: null, promise: Promise.reject(new GraphError("lost", "the instance is not ready")) };
    const id = ++this.nextId;
    const promise = new Promise<Envelope>((resolve, reject) => {
      const entry: Pending = { resolve, reject, timer: undefined, meta };
      if (timeoutMs !== undefined) {
        entry.timer = setTimeout(() => {
          this.take(id)?.reject(new GraphError("timeout"));
          this.fault("timeout");
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      worker.postMessage(build(id));
    });
    return { id, promise };
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
    this.epoch++;
    const worker = this.worker;
    this.worker = null;
    worker?.terminate();
  }

  private onStatus(status: Status, generation: number): void {
    this.emitter.emit("status", () => ({ status, generation }));
    if (status !== "ready") this.registry.notify(status, generation);
  }
}
