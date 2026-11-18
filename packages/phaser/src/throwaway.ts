// The throwaway client (ADR-012, 2.4): a graph given as data, in memory, with nothing kept. It runs an attract mode, a
// tutorial or a sandbox beside a saved game without touching it.
import { createClient } from "@relate/web";
import type { Client, ClientOptions, GraphDocument } from "@relate/web";

export type ThrowawayOptions = Omit<ClientOptions, "graph" | "application" | "store">;

/**
 * A client over an in-memory graph loaded from `document`, with no descriptor and no store, so nothing persists.
 * Options that name an `application` are refused: that opens a store.
 */
export function createThrowawayClient(options: ThrowawayOptions, document: GraphDocument): Client {
  if ("application" in options || "graph" in options || "store" in options) {
    throw new TypeError("createThrowawayClient takes neither an application nor a graph nor a store: it keeps nothing");
  }
  return createClient({ ...options, graph: { document }, store: false });
}
