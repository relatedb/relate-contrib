import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Engine } from "../../../src/worker/engine.js";
import type { LifecycleInput } from "../../../src/worker/application/lifecycle.js";

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
export const input = (over: Partial<LifecycleInput> = {}): LifecycleInput => ({
  version: 1,
  intent: "open",
  seed,
  descriptor: null,
  indexes: [{ label: "Person", property: "name" }],
  migrations: {},
  ...over,
});
