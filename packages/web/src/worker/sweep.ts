// Start-up checks on an opened store.
import { run } from "./loader.js";
import type { Engine } from "./engine.js";

/** Remove every node that carries a `scope` property: page data a departed page did not get to drop (FR-027). */
export function sweepScoped(engine: Engine): void {
  const found = run(engine, "MATCH (n) WHERE n.scope IS NOT NULL RETURN count(n) AS c").rows[0]?.c;
  if (typeof found === "number" && found > 0) run(engine, "MATCH (n) WHERE n.scope IS NOT NULL DETACH DELETE n");
}

export function nodeCount(engine: Engine): number {
  const c = run(engine, "MATCH (n) RETURN count(n) AS c").rows[0]?.c;
  return typeof c === "number" ? c : 0;
}

/** The indexes someone created: the engine's built-in token lookup indexes (type LOOKUP, present in every store since 1.2) are not counted. */
export function userIndexCount(engine: Engine): number {
  return run(engine, "SHOW INDEXES").rows.filter((r) => r.type !== "LOOKUP").length;
}

/** A store holding no node and no index (a new store, or one just reset). */
export function isEmpty(engine: Engine): boolean {
  return nodeCount(engine) === 0 && userIndexCount(engine) === 0;
}
