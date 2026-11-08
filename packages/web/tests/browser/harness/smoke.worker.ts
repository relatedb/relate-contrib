import { Engine } from "../../../src/worker/engine.js";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = async (e) => {
  try {
    await Engine.load(e.data.engineUrl as string);
    const engine = Engine.memory();
    const envelope = JSON.parse(engine.execute("RETURN 1 AS n"));
    scope.postMessage({ rows: envelope.rows, error: envelope.error });
  } catch (err) {
    scope.postMessage({ error: String(err) });
  }
};
