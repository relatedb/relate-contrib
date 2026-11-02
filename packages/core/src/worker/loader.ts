// Loads a validated graph data document into an engine through two fixed statements (specs research R2).
// Link endpoints are resolved through the element ids the engine returns for the nodes, so no label or index
// takes part, and the statements do not depend on which labels or types a document uses.
import { BATCH_SIZE } from "../config.js";
import { checkAgreement } from "../data/descriptor.js";
import type { Descriptor, GraphDocument, IndexSpec } from "../data/types.js";
import { validate } from "../data/validate.js";
import { encodeParams } from "./encode.js";
import type { Engine } from "./engine.js";

/** The document was rejected before any statement ran. */
export class LoadError extends Error {
  readonly reason: "invalid-document" | "mismatch";
  readonly path: string;
  constructor(reason: "invalid-document" | "mismatch", path: string, message: string) {
    super(path === "" ? message : `${path}: ${message}`);
    this.name = "LoadError";
    this.reason = reason;
    this.path = path;
  }
}

/** The engine reported an error in a result envelope. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineError";
  }
}

export const NODE_STATEMENT =
  "UNWIND $rows AS row CREATE (n:$(row.labels)) SET n = row.props RETURN row.k AS k, elementId(n) AS e";
export const LINK_STATEMENT =
  "UNWIND $rows AS row MATCH (a) WHERE elementId(a) = row.s MATCH (b) WHERE elementId(b) = row.t " +
  "CREATE (a)-[r:$(row.type)]->(b) SET r = row.props";

export interface LoadOptions {
  /** When present, the data must agree with it and its indexes are the ones created. */
  descriptor?: Descriptor | null;
  /** The indexes to create when there is no descriptor. */
  indexes?: IndexSpec[];
  /** Added as a `scope` property to every node the load creates. */
  scope?: string | null;
}

export interface LoadResult {
  nodes: number;
  links: number;
}

/** Run one statement and return the parsed envelope; an error in the envelope throws. */
export function run(engine: Engine, statement: string, params: unknown = null): { rows: Array<Record<string, unknown>> } {
  const envelope = JSON.parse(engine.execute(statement, params === null ? null : encodeParams(params))) as {
    rows: Array<Record<string, unknown>>;
    error: string | null;
  };
  if (envelope.error) throw new EngineError(envelope.error);
  return envelope;
}

const quote = (name: string): string => `\`${name.replace(/`/g, "``")}\``;

/** Create exactly these indexes (an index that already exists is left alone). */
export function createIndexes(engine: Engine, specs: IndexSpec[]): void {
  for (const { label, property } of specs) {
    run(engine, `CREATE INDEX IF NOT EXISTS FOR (n:${quote(label)}) ON (n.${quote(property)})`);
  }
}

/** Validate a document and, when there is a descriptor, check that the two agree. Throws LoadError. */
export function prepare(input: unknown, opts: LoadOptions = {}): GraphDocument {
  const checked = validate(input, { scoped: Boolean(opts.scope) });
  if (!checked.ok) throw new LoadError("invalid-document", checked.path, checked.message);
  if (opts.descriptor) {
    const agreement = checkAgreement(opts.descriptor, checked.document);
    if (!agreement.ok) throw new LoadError("mismatch", agreement.path, agreement.message);
  }
  return checked.document;
}

/** Load a document that has already been through `prepare`. Indexes are created before the nodes. */
export function loadGraph(engine: Engine, document: GraphDocument, opts: LoadOptions = {}): LoadResult {
  createIndexes(engine, opts.descriptor?.indexes ?? opts.indexes ?? []);

  const elementIds = new Map<string, string>();
  for (let i = 0; i < document.nodes.length; i += BATCH_SIZE) {
    const batch = document.nodes.slice(i, i + BATCH_SIZE);
    const rows = batch.map((node, j) => ({
      k: j,
      labels: node.labels ?? [],
      props: { id: node.id, ...node.properties, ...(opts.scope ? { scope: opts.scope } : {}) },
    }));
    const result = run(engine, NODE_STATEMENT, { rows }).rows;
    if (result.length !== batch.length) throw new EngineError(`a node batch created ${result.length} of ${batch.length} nodes`);
    for (const row of result) {
      const node = batch[row.k as number];
      if (!node) throw new EngineError("the engine returned a row for an unknown node");
      elementIds.set(node.id, row.e as string);
    }
  }

  for (let i = 0; i < document.links.length; i += BATCH_SIZE) {
    const batch = document.links.slice(i, i + BATCH_SIZE);
    const rows = batch.map((link) => ({
      s: elementIds.get(link.source),
      t: elementIds.get(link.target),
      type: link.type,
      props: link.properties ?? {},
    }));
    run(engine, LINK_STATEMENT, { rows });
  }
  return { nodes: document.nodes.length, links: document.links.length };
}

/** Validate, check agreement, create the indexes and load. Nothing runs if the document is rejected. */
export function loadDocument(engine: Engine, input: unknown, opts: LoadOptions = {}): LoadResult {
  return loadGraph(engine, prepare(input, opts), opts);
}

/** Remove the nodes of one scope (and their relationships). */
export function dropScope(engine: Engine, scope: string): void {
  run(engine, "MATCH (n) WHERE n.scope = $scope DETACH DELETE n", { scope });
}
