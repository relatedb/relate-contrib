// The lifecycle of an application store (ADR-010 2.2, 2.3): classify what was opened from its catalog entry, then seed,
// recover, migrate or stop. An operation writes its intent to the entry before it changes data and its outcome after.
// Engine calls stay synchronous; the catalog calls between them are awaited. Everything takes an `Engine` and a
// `Catalog`, so it is tested in Node with the real engine and the in-memory catalog storage.
import { CatalogUnavailable, type Catalog } from "../../catalog/catalog.js";
import type { MigrationStep } from "../../application/types.js";
import type { Descriptor, IndexSpec } from "../../data/types.js";
import type { Engine } from "../engine.js";
import { LoadError, loadGraph, prepare, run } from "../loader.js";
import { userIndexCount } from "../sweep.js";
import { classify, LEGACY_MARKER_LABEL, type Action, type FailureReason, type StoreFacts } from "./classify.js";
import { migrate, MigrationError } from "./migrate.js";

export interface LifecycleInput {
  /** The catalog and the store's name in it (`app-<name>`), with the application's name. */
  catalog: Catalog;
  store: string;
  name: string;
  version: number;
  intent: "open" | "reset";
  /** The seed's data document, already fetched. */
  seed: unknown;
  descriptor: Descriptor | null;
  indexes: IndexSpec[];
  migrations: Record<string, MigrationStep[]>;
}

export type LifecycleResult =
  | { ok: true; restored: boolean }
  | { ok: false; reason: FailureReason | "migration-failed" | "invalid-document" | "mismatch"; message: string };

const count = (engine: Engine, statement: string): number => {
  const v = Object.values(run(engine, statement).rows[0] ?? {})[0];
  return typeof v === "number" ? v : 0;
};

/** The facts about the store the classifier asks for; none is read for a store whose entry decides on its own. */
function readFacts(engine: Engine): StoreFacts {
  const nodeCount = count(engine, "MATCH (n) RETURN count(n) AS c");
  const indexCount = userIndexCount(engine);
  const legacyMarker = nodeCount > 0 && count(engine, `MATCH (n:${LEGACY_MARKER_LABEL}) RETURN count(n) AS c`) > 0;
  return { nodeCount, indexCount, legacyMarker };
}

async function inspect(engine: Engine, input: Pick<LifecycleInput, "catalog" | "store" | "version">): Promise<Action> {
  const lookup = await input.catalog.lookup(input.store);
  return classify(lookup, () => readFacts(engine), { version: input.version });
}

/**
 * Fill a store from the seed: validate, write the intent (`seeding` or `resetting`), reset when the store may hold
 * other data, load the seed and its indexes, then write `ready`. An invalid seed fails before anything is written.
 */
async function seedStore(engine: Engine, input: LifecycleInput, intent: "seeding" | "resetting", reset: boolean): Promise<void> {
  const document = prepare(input.seed, { descriptor: input.descriptor });
  const seeded = document.nodes.length > 0;
  const base = { kind: "application", name: input.name, version: input.version, seeded } as const;
  await input.catalog.set(input.store, { ...base, state: intent });
  if (reset) engine.reset();
  loadGraph(engine, document, { descriptor: input.descriptor, indexes: input.indexes });
  await input.catalog.set(input.store, { ...base, state: "ready" });
}

/** Whether opening this store will load the seed, so a ready store does not fetch it. */
export async function needsSeed(engine: Engine, input: Pick<LifecycleInput, "catalog" | "store" | "version" | "intent">): Promise<boolean> {
  if (input.intent === "reset") return true;
  const action = (await inspect(engine, input)).action;
  return action === "first-run" || action === "reset-and-seed" || action === "finish-removal";
}

export async function openApplication(engine: Engine, input: LifecycleInput): Promise<LifecycleResult> {
  try {
    if (input.intent === "reset") {
      await seedStore(engine, input, "resetting", true);
      return { ok: true, restored: false };
    }
    const action = await inspect(engine, input);
    switch (action.action) {
      case "fail":
        return { ok: false, reason: action.reason, message: action.message };
      case "open":
        return { ok: true, restored: true };
      case "migrate":
        await migrate(engine, { catalog: input.catalog, store: input.store, name: input.name }, action.from, input.version, input.migrations);
        return { ok: true, restored: true };
      case "reset-and-seed":
        await seedStore(engine, input, action.intent, true);
        return { ok: true, restored: false };
      case "finish-removal":
        // The directory cannot be removed while this worker holds it, so the removal is finished by a reset.
        engine.reset();
        await input.catalog.delete(input.store);
        await seedStore(engine, input, "seeding", false);
        return { ok: true, restored: false };
      case "first-run":
        await seedStore(engine, input, "seeding", false);
        return { ok: true, restored: false };
    }
  } catch (e) {
    // A catalog that does not parse, or was written by a newer format, is never written over (ADR-010 2.3).
    if (e instanceof CatalogUnavailable) return { ok: false, reason: e.reason === "newer" ? "store-newer" : "store-unreadable", message: e.message };
    if (e instanceof MigrationError) return { ok: false, reason: "migration-failed", message: e.message };
    if (e instanceof LoadError) return { ok: false, reason: e.reason, message: e.message };
    throw e;
  }
}
