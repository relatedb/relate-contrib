// Evaluating a graph source: validation, the canonical form and the revision. `owner` is the adapter's name and begins every
// error message, so a message names the package that raised it.
import { validate } from "../validate.js";
import { canonicalText, revisionOf } from "./canonical.js";

export interface Evaluated {
  /** The canonical text of the document, which is what is served and what the revision is the hash of. */
  text: string;
  revision: string;
  nodes: number;
  links: number;
}

/** Validate and canonicalize a source's output. The error message names the graph and the path of the first problem. */
export async function prepare(owner: string, name: string, raw: unknown): Promise<Evaluated> {
  const result = validate(raw);
  if (!result.ok) {
    throw new Error(`${owner}: graph "${name}": ${result.path ? `${result.path}: ` : ""}${result.message}`);
  }
  const text = canonicalText(result.document);
  return { text, revision: await revisionOf(text), nodes: result.document.nodes.length, links: result.document.links.length };
}

/** Call a source, then prepare its output. */
export async function evaluate(owner: string, name: string, load: () => unknown): Promise<Evaluated> {
  let raw: unknown;
  try {
    raw = await load();
  } catch (e) {
    throw new Error(`${owner}: graph "${name}": the source failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return prepare(owner, name, raw);
}
