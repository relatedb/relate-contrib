import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";

declare global {
  interface Window {
    __smoke?: { rows?: unknown; error?: string };
  }
}

const worker = new Worker(new URL("./smoke.worker.ts", import.meta.url), { type: "module" });
worker.onmessage = (e) => {
  window.__smoke = e.data;
};
worker.onerror = (e) => {
  window.__smoke = { error: e.message };
};
worker.postMessage({ engineUrl });
