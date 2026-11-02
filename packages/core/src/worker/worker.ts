// The worker entry: owns one engine instance and answers the client's messages (contracts/worker-protocol.md).
import { validateDescriptor } from "../data/descriptor.js";
import { Engine, TrapError } from "./engine.js";
import { dropScope, EngineError, LoadError, loadDocument, loadGraph, prepare } from "./loader.js";
import type {
  ClientMessage,
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

async function init(msg: InitMessage): Promise<void> {
  const t0 = performance.now();
  const timings: Timings = { total: 0 };
  try {
    if (msg.descriptor) {
      const checked = validateDescriptor(msg.descriptor);
      if (!checked.ok) {
        send({ type: "init-failed", reason: "invalid-descriptor", message: `${checked.path}: ${checked.message}` });
        return;
      }
    }
    let t = performance.now();
    await Engine.load(msg.engineUrl);
    timings.init = since(t);
    engine = Engine.memory();

    t = performance.now();
    let input: unknown = msg.document;
    if (input === null) {
      if (!msg.dataUrl) throw new Error("no data location was given");
      const response = await fetch(msg.dataUrl);
      if (!response.ok) throw new Error(`the data could not be fetched: ${response.status} ${response.statusText}`);
      input = await response.json();
    }
    loadDocument(engine, input, { descriptor: msg.descriptor, indexes: msg.indexes });
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

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") void init(msg);
  else if (msg.type === "query") query(msg);
  else if (msg.type === "scoped-add") scopedAdd(msg);
  else if (msg.type === "scoped-drop") scopedDrop(msg);
};
