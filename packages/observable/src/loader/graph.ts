// The graph loaders: a source's document, validated and in canonical text, and the ADR-003 descriptor that names its revision.
import { descriptorOf, evaluate } from "@relate/contrib-web/build";
import type { Evaluated } from "@relate/contrib-web/build";
import { validateDescriptor } from "@relate/contrib-web/validate";
import type { IndexSpec } from "@relate/contrib-web/validate";
import { fail } from "./fail.js";

export const OWNER = "@relate/contrib-observable";

/** A module's default export: a function returning an ADR-002 document, or a promise of one. */
export type Source = () => unknown;

export interface DescriptorOptions {
  /** Indexes the core creates before the nodes, as `{ label, property }`. */
  indexes?: IndexSpec[];
}

/** Where the data file is, as the descriptor first names it; the page replaces it with the published location. */
export const dataName = (id: string): string => `data/${id}.graph.json`;

/** Check the graph's id and indexes by the descriptor rules (ADR-003), naming the graph and the problem. */
export function check(id: string, source: unknown, indexes: IndexSpec[] = []): void {
  const probe = validateDescriptor({ version: 1, id, revision: "0", data: { url: "/x", nodes: 0, links: 0 }, ...(indexes.length ? { indexes } : {}) });
  if (!probe.ok) throw new Error(`${OWNER}: graph "${id}": ${probe.path}: ${probe.message}`);
  if (typeof source !== "function") throw new Error(`${OWNER}: graph "${id}": the source must be a function that returns a document`);
}

/** Call the source and prepare its output: validated, canonical, with its revision and counts. */
export async function prepared(id: string, source: Source, indexes: IndexSpec[] = []): Promise<Evaluated> {
  check(id, source, indexes);
  return evaluate(OWNER, id, source);
}

/**
 * The canonical text with the revision it hashes to, carried in the document's own `revision` key (ADR-002). The core's
 * agreement check compares that key with the descriptor's revision at load, which is how a source that is not deterministic is
 * caught: the document and the descriptor come from separate loader runs.
 */
export function withRevision(evaluated: Evaluated): string {
  return evaluated.text.replace(/^\{/, `{"revision":${JSON.stringify(evaluated.revision)},`);
}

/** The loader for a graph's document: writes it, or stops the build naming the graph and the first problem. */
export async function document(id: string, source: Source): Promise<void> {
  try {
    process.stdout.write(withRevision(await prepared(id, source)));
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

/** The loader for a graph's descriptor: the revision and counts of what `document` writes from the same source. */
export async function descriptor(id: string, source: Source, options: DescriptorOptions = {}): Promise<void> {
  try {
    const indexes = options.indexes ?? [];
    const evaluated = await prepared(id, source, indexes);
    process.stdout.write(JSON.stringify(descriptorOf(id, evaluated, indexes, "", dataName(id))) + "\n");
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
