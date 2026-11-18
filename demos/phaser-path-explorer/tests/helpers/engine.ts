// Test helper: the engine's WebAssembly build in Node, loaded with a world from the game's own seed document.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Envelope, QueryFn } from "../../src/game/bridge.js";
import { worldDocument } from "../../src/game/graph.js";

const here = dirname(fileURLToPath(import.meta.url));
export const pkgDir = resolve(here, "../../node_modules/@relate/relate-wasm");
export const wasmPath = resolve(pkgDir, "relate_bg.wasm");
export const engineBuilt = existsSync(wasmPath);

export interface Engine {
  db: { execute(query: string, params?: string | null): string };
  query: QueryFn;
}

export async function openEngine(): Promise<Engine> {
  const mod = await import(resolve(pkgDir, "relate.js"));
  mod.initSync({ module: readFileSync(wasmPath) });
  const db = new mod.RelateDb();
  const query: QueryFn = async (statement, params) =>
    JSON.parse(db.execute(statement, params ? JSON.stringify(params) : null)) as Envelope;
  return { db, query };
}

/** Load a world into the engine as the core's application seed would: hexes, the player, ADJ links. */
export async function seedWorld(engine: Engine, rows: string[]): Promise<void> {
  const doc = worldDocument(rows);
  const hexes = doc.nodes.filter((n) => n.labels?.includes("Hex")).map((n) => ({ id: n.id, ...n.properties }));
  const player = doc.nodes.find((n) => n.id === "player")!;
  const check = (r: Envelope) => {
    if (r.error) throw new Error(r.error);
  };
  check(await engine.query("CREATE INDEX FOR (h:Hex) ON (h.id)"));
  check(await engine.query("CREATE (:Robot {id: 'robot'})"));
  check(await engine.query("UNWIND $hexes AS h CREATE (x:Hex) SET x = h", { hexes }));
  check(await engine.query("CREATE (p:Player) SET p = $p", { p: { id: "player", ...player.properties } }));
  for (const type of ["ADJ", "NEAR"]) {
    check(
      await engine.query(`UNWIND $links AS l MATCH (a:Hex {id: l.source}), (b:Hex {id: l.target}) CREATE (a)-[:${type}]->(b)`, {
        links: doc.links.filter((l) => l.type === type),
      }),
    );
  }
}
