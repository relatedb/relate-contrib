// The catalog of registered graphs as plain data (spec FR-011): ids, lifetimes and indexes, and no locations (ADR-007 §2.2).
import { declare } from "./graphs.js";
import type { Graphs, Lifetime } from "./graphs.js";
import type { IndexSpec } from "@relate/web/validate";

export interface CatalogEntry {
  id: string;
  lifetime: Lifetime;
  indexes: IndexSpec[];
}

export function catalog(graphs: Graphs): CatalogEntry[] {
  return declare(graphs).map(({ id, lifetime, indexes }) => ({ id, lifetime, indexes }));
}
