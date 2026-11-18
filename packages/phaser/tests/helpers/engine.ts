// Test helper: the engine's WebAssembly build in Node, with no worker. The contract between the package and the engine is
// the statement and the result envelope; the worker is the core's concern and is tested there.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Envelope } from "../../src/bridge.js";

type Db = { execute(statement: string, paramsJson?: string | null): string };
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

export interface Engine {
  db: Db;
  query: (statement: string, params?: object | null) => Promise<Envelope>;
}

/** A fresh in-memory engine and a query function over it. */
export async function openEngine(): Promise<Engine> {
  const { RelateDb } = await wasm();
  const db = new RelateDb();
  const query = async (statement: string, params?: object | null): Promise<Envelope> =>
    JSON.parse(db.execute(statement, params && Object.keys(params).length ? JSON.stringify(params) : null)) as Envelope;
  return { db, query };
}
