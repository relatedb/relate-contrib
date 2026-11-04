// Evaluating a registered graph's source: validation, the canonical form, the revision and the descriptor
// (spec FR-006 to FR-009). Pure functions; the route entrypoint calls them once per build.
import { createHash } from "node:crypto";
import { validate } from "related-web-core/validate";
import type { GraphDocument, IndexSpec } from "related-web-core/validate";

export interface Evaluated {
  /** The canonical text of the document, which is what is served and what the revision is the hash of. */
  text: string;
  revision: string;
  nodes: number;
  links: number;
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys); // the order of an array property is data
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
};

/** The document as text that does not depend on the order of keys, nodes or links; any `revision` it carries is dropped. */
export function canonicalText(document: GraphDocument): string {
  const nodes = [...document.nodes].map((n) => sortKeys(n) as GraphDocument["nodes"][number]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const key = (l: GraphDocument["links"][number]) => JSON.stringify([l.source, l.target, l.type, sortKeys(l.properties ?? {})]);
  const links = [...document.links].map((l) => sortKeys(l) as GraphDocument["links"][number]).sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return JSON.stringify({ version: 1, nodes, links });
}

export const revisionOf = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 12);

/** Validate and canonicalize a source's output. The error message names the graph and the path of the first problem. */
export function prepare(name: string, raw: unknown): Evaluated {
  const result = validate(raw);
  if (!result.ok) {
    throw new Error(`related-web-astro: graph "${name}": ${result.path ? `${result.path}: ` : ""}${result.message}`);
  }
  const text = canonicalText(result.document);
  return { text, revision: revisionOf(text), nodes: result.document.nodes.length, links: result.document.links.length };
}

/** Call a source, then prepare its output. */
export async function evaluate(name: string, load: () => unknown): Promise<Evaluated> {
  let raw: unknown;
  try {
    raw = await load();
  } catch (e) {
    throw new Error(`related-web-astro: graph "${name}": the source failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return prepare(name, raw);
}

/** The base path of the site joined with a path of the adapter's, without a doubled slash. */
export const withBase = (base: string, path: string): string => `${base.replace(/\/+$/, "")}${path}`;

export const dataPath = (name: string, revision: string): string => `/_related/${name}/graph.${revision}.json`;
export const descriptorPath = (name: string): string => `/_related/${name}/descriptor.json`;

/** The ADR-003 descriptor of an evaluated graph. */
export function descriptorOf(name: string, evaluated: Evaluated, indexes: IndexSpec[], base: string) {
  return {
    version: 1 as const,
    id: name,
    revision: evaluated.revision,
    data: { url: withBase(base, dataPath(name, evaluated.revision)), nodes: evaluated.nodes, links: evaluated.links },
    ...(indexes.length ? { indexes } : {}),
  };
}
