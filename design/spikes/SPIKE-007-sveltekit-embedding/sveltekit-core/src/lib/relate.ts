// The visit client in module state, as the Astro and Next adapters hold theirs.
import engineUrl from "@relate/relate-wasm/relate_bg.wasm?url";
import { createClient, type Client } from "@relate/contrib-web";

export const DOC = { version: 1 as const, nodes: [{ id: "a", labels: ["Item"] }, { id: "b", labels: ["Item"] }, { id: "c", labels: ["Item"] }], links: [] };

let client: Client | undefined;
export const created = { count: 0 };

export function visitClient(): Client {
  if (!client) {
    created.count++;
    client = createClient({ engineUrl, graph: { document: DOC }, navigation: "client-routing" });
    (globalThis as unknown as { __rel?: unknown }).__rel = { client, created };
  }
  return client;
}
