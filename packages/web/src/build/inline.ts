// Checking and serializing an inline graph (ADR-004 §2.2, ADR-005 §2.3). Used at render time by an adapter's component.
import { validate, validateDescriptor } from "../validate.js";
import type { GraphDocument, IndexSpec } from "../validate.js";

export interface InlineConfig {
  /** Indexes the core creates before the nodes. The one place for later per-graph settings. */
  indexes?: IndexSpec[];
}

export interface InlineGraph {
  document: GraphDocument;
  config: InlineConfig;
}

const fail = (owner: string, page: string, id: string, detail: string): never => {
  throw new Error(`${owner}: ${page}: inline graph "${id}": ${detail}`);
};

/** JSON that is safe inside a <script> element: nothing in it can close the element or open a comment. */
export function escapeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

/**
 * Validate an inline graph. `seen` holds the names already used on this page; `registered` the registered names.
 * Throws an error that names the owner, the page, the graph and the first problem.
 */
export function checkInline(owner: string, page: string, id: string, document: unknown, config: InlineConfig | undefined, seen: Set<string>, registered: string[]): InlineGraph {
  const probeBase = { version: 1, id, revision: "0", data: { url: "/x", nodes: 0, links: 0 } } as const;
  const name = validateDescriptor(probeBase);
  if (!name.ok) fail(owner, page, String(id), `${name.path}: ${name.message}`);
  if (seen.has(id)) fail(owner, page, id, "the name is used twice on this page");
  if (registered.includes(id)) fail(owner, page, id, "the name is also a registered graph; use one or the other");
  const result = validate(document);
  if (!result.ok) fail(owner, page, id, `${result.path ? `${result.path}: ` : ""}${result.message}`);
  const settings = config ?? {};
  for (const key of Object.keys(settings)) {
    if (key !== "indexes") fail(owner, page, id, `config.${key}: unknown setting`);
  }
  if (settings.indexes !== undefined) {
    const probe = validateDescriptor({ ...probeBase, indexes: settings.indexes });
    if (!probe.ok) fail(owner, page, id, `config.${probe.path}: ${probe.message}`);
  }
  seen.add(id);
  return { document: (result as { document: GraphDocument }).document, config: settings };
}
