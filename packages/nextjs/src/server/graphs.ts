// Registered graphs: the declaration check and the per-process evaluation of sources (spec FR-004, FR-012; research D-5).
import { evaluate } from "@relate/web/build";
import type { Evaluated } from "@relate/web/build";
import { validateDescriptor } from "@relate/web/validate";
import type { GraphDocument, IndexSpec } from "@relate/web/validate";

export const OWNER = "@relate/nextjs";

export type Lifetime = "page" | "visit";

export interface GraphDeclaration {
  /** Returns an ADR-002 document, or a promise of one. Called at build time, and in more than one process. */
  source: () => GraphDocument | Promise<GraphDocument>;
  indexes?: IndexSpec[];
  /** `"page"` (default): ends when the last component using it is removed. `"visit"`: lives for the whole visit. */
  lifetime?: Lifetime;
}

/** A map of name to declaration, or a list of declarations with their names (a list can repeat a name, which fails). */
export type Graphs = Record<string, GraphDeclaration> | Array<GraphDeclaration & { id: string }>;

export interface Registered {
  id: string;
  source: GraphDeclaration["source"];
  indexes: IndexSpec[];
  lifetime: Lifetime;
}

/** Check the declarations and return them as a list. Throws, naming the problem, for a bad name, a duplicate or a bad field. */
export function declare(graphs: Graphs): Registered[] {
  const entries: Array<[string, GraphDeclaration]> = Array.isArray(graphs) ? graphs.map((g) => [g.id, g]) : Object.entries(graphs);
  const seen = new Set<string>();
  return entries.map(([id, g]) => {
    const name = validateDescriptor({ version: 1, id, revision: "0", data: { url: "/x", nodes: 0, links: 0 } });
    if (!name.ok) throw new Error(`${OWNER}: graph "${id}": ${name.path}: ${name.message}`);
    if (seen.has(id)) throw new Error(`${OWNER}: graph "${id}": the name is declared twice`);
    seen.add(id);
    if (typeof g?.source !== "function") throw new Error(`${OWNER}: graph "${id}": source must be a function that returns a document`);
    const lifetime = g.lifetime ?? "page";
    if (lifetime !== "page" && lifetime !== "visit") throw new Error(`${OWNER}: graph "${id}": lifetime "${String(lifetime)}" is not "page" or "visit"`);
    const indexes = g.indexes ?? [];
    if (indexes.length) {
      const probe = validateDescriptor({ version: 1, id, revision: "0", data: { url: "/x", nodes: 0, links: 0 }, indexes });
      if (!probe.ok) throw new Error(`${OWNER}: graph "${id}": indexes.${probe.path}: ${probe.message}`);
    }
    return { id, source: g.source, indexes, lifetime };
  });
}

/** Names the catalog has seen in this process, for `GraphData`'s check that an inline id is not also registered. */
export const registeredNames = new Set<string>();

export const isDevelopment = (): boolean => process.env.NODE_ENV === "development";

/** Evaluates sources: once per process in production, on every call in development (the source may have changed). */
export class Evaluations {
  private readonly cache = new Map<string, Promise<Evaluated>>();

  constructor(private readonly registered: Map<string, Registered>) {}

  get(id: string): Promise<Evaluated> {
    const graph = this.registered.get(id);
    if (!graph) return Promise.reject(new Error(`${OWNER}: graph "${id}" is not registered`));
    if (isDevelopment()) return evaluate(OWNER, id, graph.source);
    let pending = this.cache.get(id);
    if (!pending) {
      pending = evaluate(OWNER, id, graph.source);
      this.cache.set(id, pending);
    }
    return pending;
  }
}
