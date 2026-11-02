// Loads the built core and exposes it on `window.gw` so tests can drive it with page.evaluate.
// Options that cannot be passed through evaluate (the engine URL, generated graphs) are provided here.
import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import * as core from "../../../dist/index.js";
import { generateGraph } from "../../fixtures/generate-graph.js";
import * as faults from "./faults.js";

declare global {
  interface Window {
    gw: typeof gw;
  }
}

export const gw = { core, engineUrl, generateGraph, faults };
window.gw = gw;
document.documentElement.dataset.harness = "ready";
