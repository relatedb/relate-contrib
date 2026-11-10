import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Engine } from "../../../src/worker/engine.js";
import { Catalog } from "../../../src/catalog/catalog.js";
import { MemoryCatalogStorage } from "../../../src/catalog/memory-storage.js";
import type { Entry, EntryInput } from "../../../src/catalog/types.js";
import { openApplication, type LifecycleInput, type LifecycleResult } from "../../../src/worker/application/lifecycle.js";

type Db = import("@relate/relate-wasm").RelateDb;
type Wasm = { default: (o: { module_or_path: Uint8Array }) => Promise<unknown>; RelateDb: new () => Db };

let loaded: Promise<Wasm> | null = null;

function wasm(): Promise<Wasm> {
  loaded ??= (async () => {
    const dir = dirname(createRequire(import.meta.url).resolve("@relate/relate-wasm"));
    const mod = (await import(join(dir, "relate.js"))) as Wasm;
    await mod.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
    return mod;
  })();
  return loaded;
}

/** The real engine, in memory, initialised from the package's binary (research P-2). */
export async function realEngine(): Promise<Engine> {
  const { RelateDb } = await wasm();
  return Engine.fromDb(new RelateDb());
}

/** Run one statement and return the parsed envelope; an engine error throws. */
export function query(engine: Engine, statement: string, params: object | null = null): { rows: Array<Record<string, any>> } {
  const env = JSON.parse(engine.execute(statement, params ? JSON.stringify(params) : null)) as {
    rows: Array<Record<string, any>>;
    error: string | null;
  };
  if (env.error) throw new Error(env.error);
  return env;
}

/** Every statement an engine is asked to run, in order (the engine is wrapped, nothing else changes). */
export function recording(engine: Engine): { statements: string[] } {
  const record = { statements: [] as string[] };
  const execute = engine.execute.bind(engine);
  engine.execute = (statement: string, params: string | null = null) => {
    record.statements.push(statement);
    return execute(statement, params);
  };
  return record;
}

export const seed = {
  version: 1,
  nodes: [
    { id: "a", labels: ["Person"], properties: { name: "Ada", n: 1 } },
    { id: "b", labels: ["Person"], properties: { name: "Bo", n: 2 } },
  ],
  links: [{ source: "a", target: "b", type: "KNOWS" }],
};

export const STORE = "app-test";
export const NAME = "test";

/** A real in-memory engine and an in-memory catalog, opened the way the worker opens an application store. */
export interface World {
  e: Engine;
  storage: MemoryCatalogStorage;
  catalog: Catalog;
  /** The lifecycle input for this world; `over` replaces any field. */
  input(over?: Partial<LifecycleInput>): LifecycleInput;
  open(over?: Partial<LifecycleInput>): Promise<LifecycleResult>;
  /** The application's entry, or undefined when there is none. */
  entry(): Promise<Entry | undefined>;
  /** Write an entry the way an earlier run would have left it. */
  put(entry: Partial<EntryInput> & { state: string }): Promise<void>;
}

export async function world(): Promise<World> {
  const e = await realEngine();
  const storage = new MemoryCatalogStorage();
  const catalog = new Catalog(storage);
  const input = (over: Partial<LifecycleInput> = {}): LifecycleInput => ({
    catalog,
    store: STORE,
    name: NAME,
    version: 1,
    intent: "open",
    seed,
    descriptor: null,
    indexes: [{ label: "Person", property: "name" }],
    migrations: {},
    ...over,
  });
  return {
    e,
    storage,
    catalog,
    input,
    open: (over) => openApplication(e, input(over)),
    entry: async () => {
      const found = await catalog.lookup(STORE);
      return found.status === "entry" ? found.entry : undefined;
    },
    put: async (entry) => {
      await catalog.set(STORE, { kind: "application", name: NAME, version: 1, seeded: true, ...entry } as EntryInput);
    },
  };
}

/** Everything that happens to the store and the catalog, in order: engine statements, resets and catalog replaces. */
export function timeline(w: Pick<World, "e" | "storage">): string[] {
  const events: string[] = [];
  const execute = w.e.execute.bind(w.e);
  w.e.execute = (statement: string, params: string | null = null) => {
    events.push(`engine: ${statement}`);
    return execute(statement, params);
  };
  const reset = w.e.reset.bind(w.e);
  w.e.reset = () => {
    events.push("engine: reset");
    reset();
  };
  const replace = w.storage.replace.bind(w.storage);
  w.storage.replace = async (text: string) => {
    const file = JSON.parse(text) as { graphs: Record<string, { state: string; version?: number }> };
    events.push(`catalog: ${Object.entries(file.graphs).map(([k, v]) => `${k} ${v.state}${v.version ? ` v${v.version}` : ""}`).join(", ") || "(empty)"}`);
    await replace(text);
  };
  return events;
}
