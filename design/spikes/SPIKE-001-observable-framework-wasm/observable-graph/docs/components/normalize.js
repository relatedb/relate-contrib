// Normalization of CypherLite's WASM wire envelope for Observable consumers.
// Each rule below exists because the raw envelope needed it (SPIKE-001, 4.3):
//   - row keys arrive alphabetical, not in column order (cypherlite#528)
//   - engine errors arrive in `error` with a reduced envelope (no columnTypes)
//   - graph entities are tagged kind: "node" | "relationship"
//   - paths are alternating arrays [node, rel, node, ...]; a {nodes, relationships}
//     object is also accepted

const isNode = (v) => v && typeof v === "object" && v.kind === "node";
const isRel = (v) => v && typeof v === "object" && v.kind === "relationship";
const isPathArray = (v) => Array.isArray(v) && v.length > 0 && isNode(v[0]);
const isPathObject = (v) => v && typeof v === "object" && Array.isArray(v.nodes) && Array.isArray(v.relationships);

export function nodeName(node) {
  const p = node.properties ?? {};
  return String(p.name ?? p.title ?? `${node.labels?.[0] ?? "Node"} ${node.id}`);
}

// Flatten an entity for table cells. Inputs.table formats cells with String(),
// so the flattened entity carries a non-enumerable toString.
function flatten(v) {
  if (isNode(v)) {
    const flat = {id: v.id, labels: v.labels, ...v.properties};
    Object.defineProperty(flat, "toString", {value: () => `(${v.labels.join(":")} ${nodeName(v)})`});
    return flat;
  }
  if (isRel(v)) {
    const flat = {id: v.id, type: v.type, start: v.start_node, end: v.end_node, ...v.properties};
    Object.defineProperty(flat, "toString", {value: () => `[:${v.type}]`});
    return flat;
  }
  if (isPathArray(v)) {
    const out = v.map(flatten);
    Object.defineProperty(out, "toString", {
      value: () => v.map((e) => (isNode(e) ? nodeName(e) : `-[:${e.type}]-`)).join("")
    });
    return out;
  }
  return v;
}

// Parsed envelope -> {columns, columnTypes, rows, stats, error, elapsedMs}.
// `rows` keep the original entities; `tableRows` are flattened, in column order.
export function normalize(envelope) {
  const columns = envelope.columns ?? [];
  const rows = (envelope.rows ?? []).map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
  return {
    columns,
    columnTypes: envelope.columnTypes ?? [],
    rows,
    tableRows: rows.map((row) => Object.fromEntries(columns.map((c) => [c, flatten(row[c])]))),
    stats: envelope.stats ?? {},
    error: envelope.error ?? null,
    elapsedMs: envelope.elapsed_ms ?? null
  };
}

// Collect every node and relationship a result carries into the shape the
// force graph consumes. Relationships whose endpoints are not in the result
// are dropped (d3's link force throws on a missing node). A result with no
// entities yields an empty graph; that is intentional.
export function toGraph(result) {
  const nodes = new Map();
  const rels = new Map();
  const visit = (v) => {
    if (isNode(v)) nodes.set(v.id, v);
    else if (isRel(v)) rels.set(v.id, v);
    else if (isPathObject(v)) [...v.nodes, ...v.relationships].forEach(visit);
    else if (Array.isArray(v)) v.forEach(visit);
  };
  for (const row of result.rows) Object.values(row).forEach(visit);
  return {
    nodes: [...nodes.values()].map((n) => ({
      id: n.id,
      label: n.labels?.[0] ?? "Node",
      name: nodeName(n),
      properties: n.properties
    })),
    links: [...rels.values()]
      .filter((r) => nodes.has(r.start_node) && nodes.has(r.end_node))
      .map((r) => ({source: r.start_node, target: r.end_node, type: r.type}))
  };
}
