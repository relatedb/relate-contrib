// Checking and serializing an inline graph (spec FR-013 to FR-015). Used by GraphData.astro at render time.
import { validate, validateDescriptor } from "related-web-core/validate";
import type { GraphDocument, IndexSpec } from "related-web-core/validate";

export interface InlineConfig {
  /** Indexes the core creates before the nodes. The one place for later per-graph settings. */
  indexes?: IndexSpec[];
}

export interface InlineGraph {
  document: GraphDocument;
  config: InlineConfig;
}

const fail = (page: string, id: string, detail: string): never => {
  throw new Error(`related-web-astro: ${page}: inline graph "${id}": ${detail}`);
};

/** JSON that is safe inside a <script> element: nothing in it can close the element or open a comment. */
export function escapeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/**
 * Validate an inline graph. `seen` holds the names already used on this page; `registered` the registered names.
 * Throws an error that names the page, the graph and the first problem.
 */
export function checkInline(page: string, id: string, document: unknown, config: InlineConfig | undefined, seen: Set<string>, registered: string[]): InlineGraph {
  const name = validateDescriptor({ version: 1, id, revision: "0", data: { url: "/x", nodes: 0, links: 0 } });
  if (!name.ok) fail(page, String(id), `${name.path}: ${name.message}`);
  if (seen.has(id)) fail(page, id, "the name is used twice on this page");
  if (registered.includes(id)) fail(page, id, "the name is also a registered graph; use one or the other");
  const result = validate(document);
  if (!result.ok) fail(page, id, `${result.path ? `${result.path}: ` : ""}${result.message}`);
  const settings = config ?? {};
  for (const key of Object.keys(settings)) {
    if (key !== "indexes") fail(page, id, `config.${key}: unknown setting`);
  }
  if (settings.indexes !== undefined) {
    const probe = validateDescriptor({ version: 1, id, revision: "0", data: { url: "/x", nodes: 0, links: 0 }, indexes: settings.indexes });
    if (!probe.ok) fail(page, id, `config.${probe.path}: ${probe.message}`);
  }
  seen.add(id);
  return { document: (result as { document: GraphDocument }).document, config: settings };
}
