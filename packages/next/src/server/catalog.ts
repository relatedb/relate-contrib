// The catalog of registered graphs, as plain data a server component can pass to the client provider (spec FR-011).
import type { IndexSpec } from "related-web-core/validate";
import { declare, registeredNames } from "./graphs.js";
import type { Graphs, Lifetime } from "./graphs.js";
import { basePath, descriptorPath } from "./route.js";

export interface CatalogEntry {
  id: string;
  /** The descriptor's location, including the site's base path. */
  descriptor: string;
  lifetime: Lifetime;
  indexes: IndexSpec[];
}

export interface Catalog {
  graphs: CatalogEntry[];
}

export function catalog(graphs: Graphs): Catalog {
  const base = basePath().replace(/\/+$/, "");
  const entries = declare(graphs).map((g) => ({ id: g.id, descriptor: `${base}${descriptorPath(g.id)}`, lifetime: g.lifetime, indexes: g.indexes }));
  for (const entry of entries) registeredNames.add(entry.id);
  return { graphs: entries };
}
