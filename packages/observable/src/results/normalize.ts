// Normalization of the engine's wire envelope for Framework's components (SPIKE-001 §4.3, re-checked against the current engine).
// Each rule exists because the raw envelope needed it:
//   - row keys can arrive in a different order from the columns
//   - an engine error arrives in `error` with a reduced envelope (no column types)
//   - graph entities are tagged `kind: "node" | "relationship"`
//   - paths are alternating arrays [node, relationship, node, ...]
import type { Envelope, NodeValue, NormalizedResult, RelationshipValue } from "./types.js";

export const isNode = (v: unknown): v is NodeValue => !!v && typeof v === "object" && (v as { kind?: unknown }).kind === "node";
export const isRelationship = (v: unknown): v is RelationshipValue => !!v && typeof v === "object" && (v as { kind?: unknown }).kind === "relationship";
export const isPathArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0 && isNode(v[0]);

/** A readable name for a node: its `name` or `title` property, else its first label and id. */
export function nodeName(node: NodeValue): string {
  const p = node.properties ?? {};
  return String(p.name ?? p.title ?? `${node.labels?.[0] ?? "Node"} ${node.id}`);
}

// Entities flatten for table cells. A table formats cells with String(), so a flattened entity carries a non-enumerable toString.
function flatten(v: unknown): unknown {
  if (isNode(v)) {
    const flat: Record<string, unknown> = { id: v.id, labels: v.labels, ...v.properties };
    Object.defineProperty(flat, "toString", { value: () => `(${v.labels.join(":")} ${nodeName(v)})` });
    return flat;
  }
  if (isRelationship(v)) {
    const flat: Record<string, unknown> = { id: v.id, type: v.type, start: v.start_node, end: v.end_node, ...v.properties };
    Object.defineProperty(flat, "toString", { value: () => `[:${v.type}]` });
    return flat;
  }
  if (isPathArray(v)) {
    const out = v.map(flatten);
    Object.defineProperty(out, "toString", { value: () => v.map((e) => (isNode(e) ? nodeName(e) : `-[:${(e as RelationshipValue).type}]-`)).join("") });
    return out;
  }
  return v;
}

/** The parsed envelope as `{ columns, columnTypes, rows, tableRows, stats, error, elapsedMs }`; `rows` keep the original entities. */
export function normalize(envelope: Envelope): NormalizedResult {
  const columns = envelope.columns ?? [];
  const rows = (envelope.rows ?? []).map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
  return {
    columns,
    columnTypes: envelope.columnTypes ?? [],
    rows,
    tableRows: rows.map((row) => Object.fromEntries(columns.map((c) => [c, flatten(row[c])]))),
    stats: envelope.stats ?? {},
    error: envelope.error ?? null,
    elapsedMs: envelope.elapsed_ms ?? null,
  };
}
