// Loads the built core and exposes it on `window.app` so tests can drive clients and the catalog operations with
// page.evaluate. The manual check in specs/007-graph-catalog/quickstart.md uses the page's status, storage and listing.
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import workerUrl from "../../../../dist/worker/worker.js?worker&url";
import * as core from "../../../../dist/index.js";
import { Catalog, OpfsCatalogStorage } from "../../../../dist/catalog/index.js";
import { generateGraph } from "../../../fixtures/generate-graph.js";

declare global {
  interface Window {
    app: typeof app;
    client?: ReturnType<typeof core.createClient>;
  }
}

const text = (id: string, value: string): void => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

/** Create a client on the page: an application when `application` is given, otherwise `extra` carries the graph source. */
function make(application: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  const client = core.createClient({
    engineUrl,
    navigation: "client-routing",
    ...(application ? { application: application as never } : {}),
    ...extra,
  } as never);
  window.client = client;
  // A graph-driven region that never depends on the client: the page's own text and links stay as they are.
  const render = (): void => {
    text("region", client.status === "ready" ? "graph ready" : `graph ${client.status}: placeholder`);
    text("status", `status: ${client.status}`);
    text("storage", `storage: ${JSON.stringify((client as { storage?: unknown }).storage ?? null)}`);
  };
  client.on("status", render);
  (client as { on(name: string, fn: () => void): unknown }).on("storage", render);
  render();
  return client;
}

/** A worker factory whose worker first runs `patch` (a statement list) and then the real worker; messages sent meanwhile are replayed. */
function patchedWorker(patch: string): () => Worker {
  return () => {
    const code = `const held = []; self.onmessage = (e) => held.push(e);\n${patch}\nawait import(${JSON.stringify(new URL(workerUrl, location.href).href)});\nconst h = self.onmessage; for (const e of held) h(e);`;
    return new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })), { type: "module" });
  };
}

/** Run a client's worker with `navigator.storage.getDirectory` removed: a browser with no store. */
const noStoreWorker = (): (() => Worker) => patchedWorker("Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined });");

/** Run a client's worker with Web Locks removed: a browser with the file storage and no locks. */
const noLocksWorker = (): (() => Worker) => patchedWorker("Object.defineProperty(navigator, 'locks', { value: undefined });");

/** A worker factory that keeps every worker it makes on `window.workers`, so a test can end one part-way. */
const trackedWorker = (): (() => Worker) => {
  const w = window as unknown as { workers?: Worker[] };
  w.workers = [];
  const make = patchedWorker("");
  return () => {
    const worker = make();
    w.workers!.push(worker);
    return worker;
  };
};

/** The catalog operations, once the core exports them (specs/007 tasks T043 and T046). */
const catalog = (): Record<string, (...args: unknown[]) => Promise<unknown>> => core as never;

document.getElementById("list")?.addEventListener("click", () => {
  const list = catalog().listGraphs;
  if (!list) return text("listing", "listing: not available yet");
  list({ sizes: true }).then((r) => text("listing", JSON.stringify(r, null, 2)), (e) => text("listing", `listing failed: ${String(e)}`));
});

export const app = { catalog, Catalog, OpfsCatalogStorage, core, engineUrl, generateGraph, make, noLocksWorker, noStoreWorker, patchedWorker, trackedWorker, workerUrl };
window.app = app;
document.documentElement.dataset.harness = "ready";
