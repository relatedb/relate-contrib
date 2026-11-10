// The worker entry: owns one engine instance and answers the client's messages (contracts/worker-protocol.md).
import { validateDescriptor } from "../data/descriptor.js";
import { Engine, TrapError } from "./engine.js";
import { dropScope, EngineError, LoadError, loadDocument, loadGraph, prepare } from "./loader.js";
import { openStore } from "./store.js";
import { beginRebuild, canRestore, finishRebuild } from "./cache.js";
import { removeLegacyCopy } from "./legacy-copy.js";
import { openCatalog } from "../catalog/index.js";
import { initApplication, type ApplicationSession } from "./application/init.js";
import { MigrationError } from "./application/migrate.js";
import { SeedError, seedDescriptor } from "./application/seed.js";
import { ImportRejected, exportApplication, importApplication } from "./application/transfer.js";
import type {
  ClientMessage,
  ExportApplicationMessage,
  ImportApplicationMessage,
  InitFailedMessage,
  InitMessage,
  QueryMessage,
  ScopedAddMessage,
  ScopedDropMessage,
  Timings,
  WorkerMessage,
} from "./protocol.js";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<ClientMessage>) => void) | null;
  postMessage(message: WorkerMessage): void;
};

let engine: Engine | null = null;
/** The application this worker serves, when it was started in application mode. */
let application: InitMessage["application"] = undefined;
let session: ApplicationSession | null = null;

const send = (message: WorkerMessage): void => scope.postMessage(message);
const since = (t0: number): number => Math.round((performance.now() - t0) * 10) / 10;
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function failure(e: unknown): InitFailedMessage {
  if (e instanceof LoadError) return { type: "init-failed", reason: e.reason, message: e.message };
  if (e instanceof TrapError) return { type: "init-failed", reason: "trap", message: e.message };
  if (typeof WebAssembly === "undefined") return { type: "init-failed", reason: "unsupported", message: "WebAssembly is not available" };
  if (e instanceof EngineError) return { type: "init-failed", reason: "worker-error", message: e.message };
  return { type: "init-failed", reason: "worker-error", message: messageOf(e) };
}

/** The start-up of contracts/worker-protocol.md: restore from a store when its catalog entry matches, else load. */
async function init(msg: InitMessage): Promise<void> {
  if (msg.application) {
    application = msg.application;
    try {
      session = await initApplication(msg, send);
      engine = session?.engine ?? null;
    } catch (e) {
      send(failure(e));
    }
    return;
  }
  const t0 = performance.now();
  const timings: Timings = { total: 0 };
  try {
    const descriptor = msg.descriptor;
    if (descriptor) {
      const checked = validateDescriptor(descriptor);
      if (!checked.ok) {
        send({ type: "init-failed", reason: "invalid-descriptor", message: `${checked.path}: ${checked.message}` });
        return;
      }
    }
    let t = performance.now();
    await Engine.load(msg.engineUrl);
    timings.init = since(t);

    // With a store: open it (retrying a locked one), and restore if its catalog entry has this revision.
    let rebuild: { catalog: ReturnType<typeof openCatalog> } | null = null;
    if (msg.useStore && descriptor) {
      t = performance.now();
      const opened = await openStore(descriptor.id, (attempt, waitMs) => send({ type: "store-retry", attempt, waitMs }));
      timings.open = since(t);
      if (opened) {
        engine = opened;
        const catalog = openCatalog(true);
        await removeLegacyCopy(descriptor.id);
        t = performance.now();
        if (await canRestore(opened, catalog, descriptor)) {
          timings.restore = since(t);
          timings.total = since(t0);
          send({ type: "ready", restored: true, timings });
          return;
        }
        if (await beginRebuild(opened, catalog, descriptor)) {
          rebuild = { catalog };
        } else {
          // The catalog cannot record the rebuild, so the durable store is not touched: load in memory instead.
          opened.release();
          engine = null;
        }
      }
    }
    engine ??= Engine.memory();

    t = performance.now();
    let input: unknown = msg.document;
    if (input === null) {
      if (!msg.dataUrl) throw new Error("no data location was given");
      const response = await fetch(msg.dataUrl);
      if (!response.ok) throw new Error(`the data could not be fetched: ${response.status} ${response.statusText}`);
      input = await response.json();
    }
    loadDocument(engine, input, { descriptor, indexes: msg.indexes });
    if (rebuild && descriptor) await finishRebuild(rebuild.catalog, descriptor);
    timings.load = since(t);
    timings.total = since(t0);
    send({ type: "ready", restored: false, timings });
  } catch (e) {
    send(failure(e));
  }
}

function query(msg: QueryMessage): void {
  try {
    if (!engine) throw new TrapError("no instance");
    send({ type: "result", id: msg.id, envelopeText: engine.execute(msg.statement, msg.paramsJson) });
  } catch (e) {
    send({ type: "error", id: msg.id, reason: "trap", message: messageOf(e) });
  }
}

function scopedAdd(msg: ScopedAddMessage): void {
  try {
    if (!engine) throw new TrapError("no instance");
    loadGraph(engine, prepare(msg.document, { scope: msg.scope }), { scope: msg.scope });
    send({ type: "done", id: msg.id });
  } catch (e) {
    if (e instanceof LoadError) send({ type: "error", id: msg.id, reason: "invalid-document", message: e.message });
    else send({ type: "error", id: msg.id, reason: "trap", message: messageOf(e) });
  }
}

function scopedDrop(msg: ScopedDropMessage): void {
  try {
    if (!engine) throw new TrapError("no instance");
    dropScope(engine, msg.scope);
    send({ type: "done", id: msg.id });
  } catch (e) {
    send({ type: "error", id: msg.id, reason: "trap", message: messageOf(e) });
  }
}

function transferError(id: number, e: unknown): void {
  if (e instanceof MigrationError) send({ type: "error", id, reason: "migration-failed", message: e.message });
  else if (e instanceof ImportRejected || e instanceof LoadError || e instanceof SeedError) send({ type: "error", id, reason: "rejected", message: e.message });
  else send({ type: "error", id, reason: "trap", message: messageOf(e) });
}

function exportApp(msg: ExportApplicationMessage): void {
  try {
    if (!engine || !application) throw new TrapError("no application instance");
    const { envelope, losses } = exportApplication(engine, application, msg.allowLoss);
    send({ type: "application-exported", id: msg.id, envelope, losses });
  } catch (e) {
    transferError(msg.id, e);
  }
}

async function importApp(msg: ImportApplicationMessage): Promise<void> {
  try {
    if (!engine || !application) throw new TrapError("no application instance");
    // the indexes of a seed given as a URL are in its descriptor, which a restored store never fetched
    const indexes = (await seedDescriptor(application.seed))?.indexes ?? application.indexes;
    if (!session) throw new TrapError("no application session");
    await importApplication(
      engine,
      { catalog: session.catalog, store: session.store, name: application.name, version: application.version, indexes, migrations: application.migrations },
      msg.envelope,
    );
    send({ type: "done", id: msg.id });
  } catch (e) {
    transferError(msg.id, e);
  }
}

// Messages that use the store run one at a time, in arrival order. An import awaits the catalog between engine steps, and
// without this a query, an export or another import could run inside it and see (or change) a half-imported store.
let chain: Promise<void> = Promise.resolve();
const serially = (job: () => void | Promise<void>): void => {
  chain = chain.then(job).catch(() => undefined);
};

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") void init(msg);
  else if (msg.type === "query") serially(() => query(msg));
  else if (msg.type === "scoped-add") serially(() => scopedAdd(msg));
  else if (msg.type === "scoped-drop") serially(() => scopedDrop(msg));
  else if (msg.type === "export-application") serially(() => exportApp(msg));
  else if (msg.type === "import-application") serially(() => importApp(msg));
};
