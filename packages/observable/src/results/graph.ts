import { isNode, isRelationship, nodeName } from "./normalize.js";
import type { ForceGraph, NodeValue, RelationshipValue } from "./types.js";

const isPathObject = (v: unknown): v is { nodes: unknown[]; relationships: unknown[] } =>
  !!v && typeof v === "object" && Array.isArray((v as { nodes?: unknown }).nodes) && Array.isArray((v as { relationships?: unknown }).relationships);

/**
 * Every node and relationship a result carries, in the shape a force layout takes. A relationship whose endpoints are not both in
 * the result is dropped (a layout's link force fails on a missing node). A result with no entities gives an empty graph.
 */
export function toGraph(result: { rows: Array<Record<string, unknown>> }): ForceGraph {
  const nodes = new Map<number | string, NodeValue>();
  const relationships = new Map<number | string, RelationshipValue>();
  const visit = (v: unknown): void => {
    if (isNode(v)) nodes.set(v.id, v);
    else if (isRelationship(v)) relationships.set(v.id, v);
    else if (isPathObject(v)) [...v.nodes, ...v.relationships].forEach(visit);
    else if (Array.isArray(v)) v.forEach(visit);
  };
  for (const row of result.rows) Object.values(row).forEach(visit);
  return {
    nodes: [...nodes.values()].map((n) => ({ id: n.id, label: n.labels?.[0] ?? "Node", name: nodeName(n), properties: n.properties })),
    links: [...relationships.values()]
      .filter((r) => nodes.has(r.start_node) && nodes.has(r.end_node))
      .map((r) => ({ source: r.start_node, target: r.end_node, type: r.type })),
  };
}
