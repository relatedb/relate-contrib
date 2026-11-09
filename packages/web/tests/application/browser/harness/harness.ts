// Loads the built core and exposes it on `window.app` so tests can drive application clients with page.evaluate.
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
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
  return client;
}

export const app = { core, engineUrl, generateGraph, make };
window.app = app;
document.documentElement.dataset.harness = "ready";
