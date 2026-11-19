// `open`: a core client for a graph, tied to the cell that opened it (ADR-006 §2.3; contracts/browser-entry.md).
import { createClient } from "@relate/contrib-web";
import type { Client, Descriptor, GraphDocument, GraphSource, IndexSpec } from "@relate/contrib-web";
import { contentOf, isAttachment, locationOf } from "./attachments.js";
import type { Attachment } from "./attachments.js";
import { makeCypher } from "./results/cypher.js";
import type { Cypher } from "./results/cypher.js";
import { toGraph } from "./results/graph.js";
import { normalize } from "./results/normalize.js";
import type { Envelope, ForceGraph, NormalizedResult } from "./results/types.js";

export type GraphInput =
  /** A descriptor attachment and the attachment of the data it names. */
  | { descriptor: Attachment; data: Attachment }
  /** A document: an attachment of one, or an object the cell holds. No revision and no stored copy. */
  | { document: Attachment | GraphDocument; indexes?: IndexSpec[] };

export interface OpenOptions {
  /** The engine's binary, from a loader that calls `engine()`. */
  engine: Attachment;
  /** The worker module, from a loader that calls `worker()`. */
  worker: Attachment;
  graph: GraphInput;
  /** The cell's `invalidation`: the client is destroyed when it resolves. */
  invalidation: Promise<unknown>;
}

export interface Opened {
  /** The core's client: status, `subscribe`, `run` and the rest of its interface. */
  client: Client;
  /** Resolves when the instance is ready; rejects, with the core's wording, when the client reaches `failed`. */
  ready: Promise<void>;
  cypher: Cypher;
  query(statement: string, params?: Record<string, unknown> | null): Promise<NormalizedResult>;
  graph(result: { rows: Array<Record<string, unknown>> }): ForceGraph;
}

const isThenable = (v: unknown): v is Promise<unknown> => !!v && typeof (v as Promise<unknown>).then === "function";

async function graphSource(graph: GraphInput): Promise<GraphSource> {
  if ("descriptor" in graph) {
    // The descriptor names its data by a logical name; the published name carries a content hash the loader could not know.
    const descriptor = structuredClone(await contentOf(graph.descriptor)) as Descriptor;
    descriptor.data = { ...descriptor.data, url: await locationOf(graph.data) };
    return { descriptor };
  }
  const indexes = graph.indexes;
  return { document: isAttachment(graph.document) ? await locationOf(graph.document) : graph.document, ...(indexes ? { indexes } : {}) };
}

function readiness(client: Client): Promise<void> {
  const ready = new Promise<void>((resolve, reject) => {
    const settle = (): void => {
      if (client.status === "ready") resolve();
      else if (client.status === "failed") reject(new Error(client.failureMessage()));
    };
    client.on("status", settle);
    settle();
  });
  ready.catch(() => undefined); // a cell that never awaits `ready` is not an unhandled rejection
  return ready;
}

let reloaded = false;

/** Tie `client` to its cell and its page. */
function ownedBy(client: Client, invalidation: Promise<unknown>): void {
  const target = globalThis as unknown as EventTarget;
  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    client.destroy();
  };
  const pagehide = (): void => destroy();
  // A page restored from the back-forward cache has a destroyed client and a cell cannot rebuild one, so the document loads again.
  const pageshow = (event: Event): void => {
    if ((event as PageTransitionEvent).persisted && !reloaded) {
      reloaded = true;
      globalThis.location.reload();
    }
  };
  target.addEventListener("pagehide", pagehide);
  target.addEventListener("pageshow", pageshow);
  void invalidation.then(() => {
    destroy();
    target.removeEventListener("pagehide", pagehide);
    target.removeEventListener("pageshow", pageshow);
  });
}

/**
 * Open a graph. The returned promise resolves as soon as the attachments' locations are known and the client exists, not when
 * the graph is ready; `ready` says that. Nothing starts before `open` is called.
 */
export async function open(options: OpenOptions): Promise<Opened> {
  const { engine, worker, graph, invalidation } = options;
  if (!isAttachment(engine) || !isAttachment(worker)) throw new TypeError("@relate/contrib-observable: open(): `engine` and `worker` are file attachments, from FileAttachment(...)");
  if (!isThenable(invalidation)) throw new TypeError("@relate/contrib-observable: open(): `invalidation` is the cell's invalidation promise; without it the client would outlive the cell");
  const [engineUrl, workerUrl] = await Promise.all([locationOf(engine), locationOf(worker)]);
  const source = await graphSource(graph);
  const client = createClient({
    engineUrl,
    graph: source,
    navigation: "multi-page",
    workerFactory: () => new Worker(workerUrl, { type: "module" }),
  });
  ownedBy(client, invalidation);
  const query = async (statement: string, params: Record<string, unknown> | null = null): Promise<NormalizedResult> => normalize((await client.query(statement, params)) as Envelope);
  return { client, ready: readiness(client), query, cypher: makeCypher(query), graph: toGraph };
}
