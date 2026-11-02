// A page that drives the engine and loader directly in a worker, for tests of the loader alone.
import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";

declare global {
  interface Window {
    rpc: (op: string, payload?: Record<string, unknown>) => Promise<any>;
  }
}

const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
const pending = new Map<number, (value: unknown) => void>();
let next = 0;
worker.onmessage = (e) => {
  pending.get(e.data.id)?.(e.data);
  pending.delete(e.data.id);
};
window.rpc = (op, payload = {}) =>
  new Promise((resolve) => {
    const id = ++next;
    pending.set(id, resolve);
    worker.postMessage({ id, op, engineUrl, ...payload });
  });
document.documentElement.dataset.ready = "1";
