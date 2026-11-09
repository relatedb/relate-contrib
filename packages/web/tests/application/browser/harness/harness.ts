// Loads the built core and exposes it on `window.app` so tests can drive application clients with page.evaluate.
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import workerUrl from "../../../../dist/worker/worker.js?worker&url";
import * as core from "../../../../dist/index.js";
import { generateGraph } from "../../../fixtures/generate-graph.js";

declare global {
  interface Window {
    app: typeof app;
    client?: ReturnType<typeof core.createClient>;
  }
}

/** Create an application client on the page; `options` is the application option (a seed document or URL included). */
function make(application: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const client = core.createClient({
    engineUrl,
    navigation: "client-routing",
    application: application as never,
    ...extra,
  } as never);
  window.client = client;
  // A graph-driven region that never depends on the client: the page's own text and links stay as they are.
  const region = document.getElementById("region");
  const render = (): void => {
    if (region) region.textContent = client.status === "ready" ? "graph ready" : `graph ${client.status}: placeholder`;
  };
  client.on("status", render);
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

export const app = { core, engineUrl, generateGraph, make, patchedWorker, noStoreWorker, workerUrl };
window.app = app;
document.documentElement.dataset.harness = "ready";
