// The start-up of an application graph in the worker (ADR-009 2.2, 2.4): load the engine, fetch the seed, open the
// store, run the lifecycle, and report storage and readiness. A failure is reported and the store is left alone.
import type { Engine } from "../engine.js";
import { Engine as EngineClass } from "../engine.js";
import type { InitFailedMessage, InitMessage, Timings, WorkerMessage } from "../protocol.js";
import { needsSeed, openApplication } from "./lifecycle.js";
import { loadSeed, SeedError } from "./seed.js";
import { openApplicationStore } from "./open-store.js";

const since = (t0: number): number => Math.round((performance.now() - t0) * 10) / 10;
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Returns the engine to serve queries with, or null after sending `init-failed`. */
export async function initApplication(msg: InitMessage, send: (m: WorkerMessage) => void): Promise<Engine | null> {
  const app = msg.application!;
  const t0 = performance.now();
  const timings: Timings = { total: 0 };
  const fail = (reason: InitFailedMessage["reason"], message: string): null => {
    send({ type: "init-failed", reason, message });
    return null;
  };

  let t = performance.now();
  await EngineClass.load(msg.engineUrl);
  timings.init = since(t);

  t = performance.now();
  const outcome = await openApplicationStore(app, { report: (r) => send({ type: "storage", ...r }) });
  timings.open = since(t);
  if ("fail" in outcome) return fail(outcome.fail, outcome.message);

  // The seed is fetched only when it will be used: a ready store restores without it.
  let seed: unknown = app.seed.document;
  let descriptor = app.seed.descriptor;
  if (seed === null && needsSeed(outcome.engine, app.version, app.intent)) {
    try {
      const loaded = await loadSeed(app.seed);
      seed = loaded.document;
      descriptor = loaded.descriptor;
    } catch (e) {
      outcome.engine.release();
      return fail(e instanceof SeedError ? e.reason : "worker-error", messageOf(e));
    }
  }

  t = performance.now();
  const result = openApplication(outcome.engine, {
    version: app.version,
    intent: app.intent,
    seed,
    descriptor,
    indexes: app.indexes,
    migrations: app.migrations,
  });
  if (!result.ok) {
    outcome.engine.release();
    return fail(result.reason, result.message);
  }
  if (result.restored) timings.restore = since(t);
  else timings.load = since(t);
  timings.total = since(t0);
  send({ type: "storage", ...outcome.storage });
  send({ type: "ready", restored: result.restored, timings });
  return outcome.engine;
}
