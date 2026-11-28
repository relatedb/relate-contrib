// Runs the real worker module in Node, wired to a client through a loopback Worker, against the real engine.
// The client and the worker exchange the same messages as in a browser; only the transport differs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { vi } from "vitest";
import { createClient } from "../../../src/client/client.js";
import type { Client, ClientOptions } from "../../../src/client/types.js";
import type { ClientMessage, WorkerMessage } from "../../../src/worker/protocol.js";
import { Engine } from "../../../src/worker/engine.js";

const scope: { onmessage: ((e: { data: ClientMessage }) => void) | null; postMessage: (m: WorkerMessage) => void } = {
  onmessage: null,
  postMessage: () => {},
};
let live: LoopWorker | null = null;
/** Every message the worker sent, in order, for tests that look at the protocol. */
export const sent: WorkerMessage[] = [];
/** Every message the client sent. */
export const received: ClientMessage[] = [];

class LoopWorker {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  constructor() {
    live = this;
    scope.postMessage = (m) => {
      sent.push(m);
      queueMicrotask(() => {
        if (live === this) this.onmessage?.({ data: m } as MessageEvent<WorkerMessage>);
      });
    };
  }
  postMessage(m: ClientMessage): void {
    received.push(m);
    queueMicrotask(() => scope.onmessage?.({ data: m }));
  }
  terminate(): void {
    if (live === this) live = null;
  }
}

let ready: Promise<void> | null = null;
let RealDb: (new () => never) | null = null;

/** Initialise the real engine once, load the real worker module, and stand in for the browser globals the client reads. */
export function boot(): Promise<void> {
  ready ??= (async () => {
    // the engine, initialised from the package's binary, as the other Node tests do; the worker's engine wrapper is pointed at it
    const dir = dirname(createRequire(import.meta.url).resolve("@relate/relate-wasm"));
    const mod = (await import(join(dir, "relate.js"))) as { default: (o: { module_or_path: Uint8Array }) => Promise<unknown>; RelateDb: new () => never };
    await mod.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
    vi.spyOn(Engine, "load").mockResolvedValue(undefined);
    RealDb = mod.RelateDb;
    vi.spyOn(Engine, "memory").mockImplementation(() => Engine.fromDb(new mod.RelateDb()));
    (globalThis as Record<string, unknown>).location = new URL("http://localhost/");
    // the worker module reads `self` once, when it loads; the engine's glue must not see this stand-in afterwards
    const g = globalThis as Record<string, unknown>;
    const had = "self" in g;
    const before = g.self;
    g.self = scope;
    await import("../../../src/worker/worker.js");
    if (had) g.self = before;
    else delete g.self;
  })();
  return ready;
}

export const doc = {
  version: 1,
  nodes: [
    { id: "a", labels: ["Person"], properties: { name: "Ada" } },
    { id: "b", labels: ["Person"], properties: { name: "Bo" } },
  ],
  links: [{ source: "a", target: "b", type: "KNOWS" }],
};

/** A client over an inline document, on the real worker and engine. Destroy it when the test ends. */
export async function client(over: Partial<ClientOptions> = {}, setup?: (c: Client) => void): Promise<Client> {
  await boot();
  sent.length = 0;
  received.length = 0;
  const made = createClient({
    engineUrl: "http://localhost/engine.wasm",
    graph: { document: doc },
    navigation: "client-routing",
    workerFactory: () => new LoopWorker() as unknown as Worker,
    ...over,
  });
  setup?.(made); // synchronously, so that a listener is in place before the worker is started
  return made;
}

/** Wait until the client is ready. */
export async function ready_(c: Client): Promise<Client> {
  for (let i = 0; c.status !== "ready"; i++) {
    if (i > 500 || c.status === "failed") throw new Error(`the client did not become ready (${c.status})`);
    await new Promise((r) => setTimeout(r, 2));
  }
  return c;
}

/** Let queued messages and listeners run. */
export const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The worker fails, as a browser reports a worker script error: the client replaces the instance. */
export function crash(): void {
  live?.onerror?.({ message: "the worker failed" } as ErrorEvent);
}

/** A new in-memory engine from the initialised module (call `boot` first). */
export function newEngine(): Engine {
  if (!RealDb) throw new Error("boot() first");
  return Engine.fromDb(new RealDb());
}
