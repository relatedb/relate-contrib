// The engine's result envelope as the browser build returns it, and what `normalize` makes of it (data-model.md).

export interface Envelope {
  columns?: string[];
  columnTypes?: string[];
  rows?: Array<Record<string, unknown>>;
  stats?: Record<string, unknown>;
  error?: string | null;
  elapsed_ms?: number | null;
}

export interface NodeValue {
  kind: "node";
  id: number | string;
  labels: string[];
  properties?: Record<string, unknown>;
}

export interface RelationshipValue {
  kind: "relationship";
  id: number | string;
  type: string;
  start_node: number | string;
  end_node: number | string;
  properties?: Record<string, unknown>;
}

export interface NormalizedResult {
  columns: string[];
  columnTypes: string[];
  /** Rows keyed in column order, with the engine's tagged entities. */
  rows: Array<Record<string, unknown>>;
  /** The same rows with entities flattened for tables and accessors. */
  tableRows: Array<Record<string, unknown>>;
  stats: Record<string, unknown>;
  error: string | null;
  elapsedMs: number | null;
}

/** The rows of a query written as a tagged template: flattened rows with the result's metadata attached. */
export type Rows = Array<Record<string, unknown>> & {
  columns: string[];
  columnTypes: string[];
  stats: Record<string, unknown>;
  elapsedMs: number | null;
  /** The normalized result with the engine's original entities; not enumerable. */
  readonly result: NormalizedResult;
};

export interface GraphNode {
  id: number | string;
  label: string;
  name: string;
  properties: Record<string, unknown> | undefined;
}

export interface GraphLink {
  source: number | string;
  target: number | string;
  type: string;
}

export interface ForceGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}
