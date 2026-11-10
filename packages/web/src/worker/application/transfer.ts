// Export and import of an application graph (ADR-009 2.5, ADR-010 2.2). Export reads nodes and relationships in pages
// with typed reads and reports what the data format cannot carry; import validates the whole document, then writes the
// entry `importing`, resets, loads, writes it `ready` and migrates.
import type { ExportEnvelope, LossKind, LossReport, MigrationStep } from "../../application/types.js";
import type { Catalog } from "../../catalog/catalog.js";
import { BATCH_SIZE } from "../../config.js";
import type { GraphDocument, GraphLink, GraphNode, IndexSpec, Properties } from "../../data/types.js";
import { validate } from "../../data/validate.js";
import type { Engine } from "../engine.js";
import { loadGraph, prepare, run } from "../loader.js";
import { migrate } from "./migrate.js";
import { convert, type TypedValue } from "./losses.js";

/** The envelope or the document was refused before the store was touched. */
export class ImportRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportRejected";
  }
}

const NODE_PAGE =
  "MATCH (n) WITH n ORDER BY elementId(n) SKIP $skip LIMIT $limit " +
  "RETURN elementId(n) AS e, labels(n) AS labels, properties(n) AS p, [k IN keys(n) | [k, valueType(n[k]), toString(n[k])]] AS t";
const LINK_PAGE =
  "MATCH (a)-[r]->(b) WITH a, r, b ORDER BY elementId(r) SKIP $skip LIMIT $limit " +
  "RETURN elementId(a) AS s, elementId(b) AS t, type(r) AS type, properties(r) AS p, [k IN keys(r) | [k, valueType(r[k]), toString(r[k])]] AS tv";

const ORDER: LossKind[] = ["integer-beyond-2^53", "whole-number-float", "date", "duration", "point", "empty-list", "node-without-string-id"];

class Losses {
  private counts = new Map<LossKind, number>();
  droppedLinks = 0;
  add(kind: LossKind): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
  }
  report(): LossReport {
    return ORDER.filter((k) => this.counts.has(k)).map((kind) => ({
      kind,
      count: this.counts.get(kind)!,
      ...(kind === "node-without-string-id" && this.droppedLinks > 0 ? { droppedLinks: this.droppedLinks } : {}),
    }));
  }
}

function properties(json: Record<string, unknown>, typed: TypedValue[], skip: string | null, losses: Losses): Properties {
  const out: Record<string, unknown> = {};
  for (const [key, type, text] of typed) {
    if (key === skip) continue;
    const c = convert(type, text, json[key]);
    if (c.loss) losses.add(c.loss);
    if (c.keep) out[key] = c.value;
  }
  return out as Properties;
}

/** Read every node and relationship into an ADR-002 document, counting what it cannot carry. */
export function readDocument(engine: Engine): { document: GraphDocument; losses: LossReport } {
  const losses = new Losses();
  const ids = new Map<string, string>(); // element id -> document id, for the nodes that have one
  const nodes: GraphNode[] = [];
  for (let skip = 0; ; skip += BATCH_SIZE) {
    const page = run(engine, NODE_PAGE, { skip, limit: BATCH_SIZE }).rows;
    for (const row of page) {
      const typed = row.t as TypedValue[];
      const id = typed.find(([k]) => k === "id");
      if (!id || !id[1].startsWith("STRING") || id[2] === "") {
        losses.add("node-without-string-id");
        continue;
      }
      const labels = row.labels as string[];
      ids.set(row.e as string, id[2]);
      nodes.push({ id: id[2], ...(labels.length ? { labels } : {}), properties: properties(row.p as Record<string, unknown>, typed, "id", losses) });
    }
    if (page.length < BATCH_SIZE) break;
  }
  const links: GraphLink[] = [];
  for (let skip = 0; ; skip += BATCH_SIZE) {
    const page = run(engine, LINK_PAGE, { skip, limit: BATCH_SIZE }).rows;
    for (const row of page) {
      const source = ids.get(row.s as string);
      const target = ids.get(row.t as string);
      if (!source || !target) {
        losses.droppedLinks++;
        continue;
      }
      const props = properties(row.p as Record<string, unknown>, row.tv as TypedValue[], null, losses);
      links.push({ source, target, type: row.type as string, ...(Object.keys(props).length ? { properties: props } : {}) });
    }
    if (page.length < BATCH_SIZE) break;
  }
  // The engine's element ids differ between a store and its import, so the document is put in a fixed order:
  // an export, an import and an export give the same document (FR-023).
  const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  nodes.sort((a, b) => byText(a.id, b.id));
  const linkKey = (l: GraphLink): string => `${l.source}\u0000${l.target}\u0000${l.type}\u0000${JSON.stringify(l.properties ?? {})}`;
  links.sort((a, b) => byText(linkKey(a), linkKey(b)));
  return { document: { version: 1, nodes, links }, losses: losses.report() };
}

export function exportApplication(
  engine: Engine,
  application: { name: string; version: number },
  allowLoss: boolean,
): { envelope: ExportEnvelope | null; losses: LossReport } {
  const { document, losses } = readDocument(engine);
  if (losses.length > 0 && !allowLoss) return { envelope: null, losses };
  const checked = validate(document, { scoped: false });
  if (!checked.ok) throw new ImportRejected(`the graph cannot be written in the data format: ${checked.path}: ${checked.message}`);
  // A client that is ready has been carried to the code's version, so that is the version the data is at.
  return {
    envelope: {
      format: "relate-application-export",
      version: 1,
      application: { name: application.name, version: application.version },
      document,
    },
    losses,
  };
}

export interface ImportContext {
  catalog: Catalog;
  store: string;
  name: string;
  version: number;
  indexes: IndexSpec[];
  migrations: Record<string, MigrationStep[]>;
}

/** Check an envelope against this application before anything is written. Throws ImportRejected. */
export function checkEnvelope(envelope: unknown, ctx: Pick<ImportContext, "name" | "version">): ExportEnvelope {
  const e = envelope as Partial<ExportEnvelope> | null;
  if (!e || typeof e !== "object" || e.format !== "relate-application-export") throw new ImportRejected('the envelope is not a "relate-application-export"');
  if (e.version !== 1) throw new ImportRejected(`the envelope's format version ${String(e.version)} is not one this code reads (1)`);
  const app = e.application;
  if (!app || typeof app.name !== "string" || !Number.isInteger(app.version) || app.version < 1) throw new ImportRejected("the envelope has no valid application name and version");
  if (app.name !== ctx.name) throw new ImportRejected(`the envelope is for the application "${app.name}", not "${ctx.name}"`);
  if (app.version > ctx.version) throw new ImportRejected(`the envelope's version ${app.version} is newer than this code's ${ctx.version}`);
  return e as ExportEnvelope;
}

export async function importApplication(engine: Engine, ctx: ImportContext, input: unknown): Promise<void> {
  const envelope = checkEnvelope(input, ctx);
  const document = prepare(envelope.document); // validates the whole document before any write
  const base = { kind: "application", name: ctx.name, version: envelope.application.version, seeded: document.nodes.length > 0 } as const;
  await ctx.catalog.set(ctx.store, { ...base, state: "importing" });
  engine.reset();
  loadGraph(engine, document, { indexes: ctx.indexes });
  await ctx.catalog.set(ctx.store, { ...base, state: "ready" });
  await migrate(engine, ctx, envelope.application.version, ctx.version, ctx.migrations);
}
