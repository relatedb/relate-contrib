import { Engine, TrapError } from "../../../src/worker/engine.js";
import { LoadError, loadDocument, run, dropScope } from "../../../src/worker/loader.js";
import type { LoadOptions } from "../../../src/worker/loader.js";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

let loaded = false;
let engine: Engine | null = null;

scope.onmessage = async (e) => {
  const { id, op, engineUrl, input, opts, statement, params, name } = e.data as {
    id: number;
    op: string;
    engineUrl: string;
    input?: unknown;
    opts?: LoadOptions;
    statement?: string;
    params?: unknown;
    name?: string;
  };
  try {
    if (!loaded) {
      await Engine.load(engineUrl);
      loaded = true;
    }
    if (op === "fresh" || engine === null) engine = Engine.memory();
    if (op === "load") {
      try {
        scope.postMessage({ id, ok: true, result: loadDocument(engine, input, opts ?? {}) });
      } catch (err) {
        if (err instanceof LoadError) scope.postMessage({ id, ok: false, reason: err.reason, path: err.path, message: err.message });
        else throw err;
      }
    } else if (op === "query") {
      scope.postMessage({ id, ok: true, rows: run(engine, statement ?? "", params ?? null).rows });
    } else if (op === "drop-scope") {
      dropScope(engine, name ?? "");
      scope.postMessage({ id, ok: true });
    } else {
      scope.postMessage({ id, ok: true });
    }
  } catch (err) {
    if (err instanceof TrapError) scope.postMessage({ id, ok: false, reason: "trap", message: err.message });
    else scope.postMessage({ id, ok: false, reason: "error", message: String(err) });
  }
};
