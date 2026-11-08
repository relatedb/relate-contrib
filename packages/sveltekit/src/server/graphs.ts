// Registered graphs: the declaration check (FR-004, FR-012) and the evaluation of a source (FR-008, FR-009).
import { evaluate } from "@relate/web/build";
import type { Evaluated } from "@relate/web/build";
import { validateDescriptor } from "@relate/web/validate";
import type { GraphDocument, IndexSpec } from "@relate/web/validate";

export const OWNER = "@relate/sveltekit";

export type Lifetime = "page" | "visit";

export interface GraphDeclaration {
  /** Returns an ADR-002 document, or a promise of one. Called at build time (twice, independently) and in development on each request. */
  source: () => GraphDocument | Promise<GraphDocument>;
  indexes?: IndexSpec[];
  /** `"page"` (default): ends when the last component using it is removed. `"visit"`: lives for the whole visit. */
  lifetime?: Lifetime;
}

/** A map of id to declaration, or a list of declarations with their ids (a list can repeat an id, which fails). */
export type Graphs = Record<string, GraphDeclaration> | Array<GraphDeclaration & { id: string }>;

export interface Registered {
  id: string;
  source: GraphDeclaration["source"];
  indexes: IndexSpec[];
  lifetime: Lifetime;
}

const PROBE = { version: 1 as const, revision: "0", data: { url: "/x", nodes: 0, links: 0 } };

/** Check the declarations and return them as a list. Throws, naming the problem, for a bad id, a duplicate or a bad field. */
export function declare(graphs: Graphs): Registered[] {
  const entries: Array<[string, GraphDeclaration]> = Array.isArray(graphs) ? graphs.map((g) => [g.id, g]) : Object.entries(graphs);
  const seen = new Set<string>();
  return entries.map(([id, g]) => {
    const name = validateDescriptor({ ...PROBE, id });
    if (!name.ok) throw new Error(`${OWNER}: graph "${id}": ${name.path}: ${name.message}`);
    if (seen.has(id)) throw new Error(`${OWNER}: graph "${id}": the id is declared twice`);
    seen.add(id);
    if (typeof g?.source !== "function") throw new Error(`${OWNER}: graph "${id}": the source must be a function that returns a document`);
    const lifetime = g.lifetime ?? "page";
    if (lifetime !== "page" && lifetime !== "visit") throw new Error(`${OWNER}: graph "${id}": lifetime "${String(lifetime)}" is not "page" or "visit"`);
    const indexes = g.indexes ?? [];
    if (indexes.length) {
      const probe = validateDescriptor({ ...PROBE, id, indexes });
      if (!probe.ok) throw new Error(`${OWNER}: graph "${id}": indexes.${probe.path}: ${probe.message}`);
    }
    return { id, source: g.source, indexes, lifetime };
  });
}

/** Call a source and prepare its output: validated, canonical, with its revision and counts. */
export const evaluateSource = (registered: Registered): Promise<Evaluated> => evaluate(OWNER, registered.id, registered.source);

export const isDevelopment = (): boolean => process.env.NODE_ENV === "development";
