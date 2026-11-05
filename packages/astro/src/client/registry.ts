// Finding a graph by name and making its client (spec FR-017 to FR-021; ADR-004 2.3). Everything about the
// instance (worker, status, faults, loading) is the core's; this file only decides which core client a name gets
// and who ends it.
import engineUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import { createClient, createSiteClient } from "@relate/web-core";
import type { Client } from "@relate/web-core";
import { graphs, navigation as configured } from "virtual:relate-web/config";

export type Navigation = "multi-page" | "client-routing";

export interface GraphOptions {
  /** Testing aid: the profile passed to the core instead of the configured one. */
  navigation?: Navigation;
  /** Testing aid: the descriptor URL used instead of the registered graph's. */
  descriptor?: string;
}

interface Inline {
  document: unknown;
  indexes: Array<{ label: string; property: string }>;
}

/** The inline graph of the current document with this name, if any. */
function findInline(name: string): Inline | null {
  for (const el of Array.from(document.querySelectorAll('script[type="application/json"][data-relate-graph]'))) {
    if (el.getAttribute("data-relate-graph") !== name) continue;
    const payload = JSON.parse(el.textContent ?? "{}") as { document: unknown; config?: { indexes?: Inline["indexes"] } };
    return { document: payload.document, indexes: payload.config?.indexes ?? [] };
  }
  return null;
}

const listNames = (): string => {
  const names = Object.keys(graphs);
  return names.length ? names.join(", ") : "(none)";
};

/** Visit-lifetime clients. Under `multi-page` a document is a page, so this is one client per page and name; under
 * `client-routing` the module outlives the pages, so it is one per visit and name. */
const visitClients = new Map<string, Client>();

function visitClient(name: string, descriptor: string, profile: Navigation): Client {
  const key = `${profile}\n${name}\n${descriptor}`;
  let client = visitClients.get(key);
  if (!client) {
    // The core's site client holds one client per visit whatever graph is asked for, so graphs are kept by name here.
    client =
      profile === "multi-page"
        ? createSiteClient({ engineUrl, graph: { descriptor }, navigation: profile })
        : createClient({ engineUrl, graph: { descriptor }, navigation: profile });
    visitClients.set(key, client);
  }
  return client;
}

/** The clients one page has asked for. `dispose` ends the ones that must not outlive it. */
export class PageClients {
  private readonly clients = new Map<string, Client>();
  private readonly owned = new Set<Client>();

  graph(name: string, options: GraphOptions = {}): Client {
    const existing = this.clients.get(name);
    if (existing) return existing;
    const profile = options.navigation ?? configured;
    const inline = findInline(name);
    let client: Client;
    if (inline) {
      client = createClient({ engineUrl, graph: { document: inline.document as never, indexes: inline.indexes }, navigation: profile });
      this.owned.add(client);
    } else {
      const entry = graphs[name];
      if (!entry) throw new Error(`@relate/web-astro: no graph named "${name}" on this page or in the registered graphs (${listNames()})`);
      const descriptor = options.descriptor ?? entry.descriptor;
      if (entry.lifetime === "visit") {
        client = visitClient(name, descriptor, profile);
      } else {
        // The stored copy is used whenever there is a descriptor, so the next page restores instead of fetching.
        client = createClient({ engineUrl, graph: { descriptor }, navigation: profile, store: true });
        this.owned.add(client);
      }
    }
    this.clients.set(name, client);
    return client;
  }

  dispose(): void {
    for (const client of this.owned) client.destroy();
    this.owned.clear();
    this.clients.clear();
  }
}

/** A visit-lifetime registered graph, for code that lives across pages (spec FR-022). */
export function visitGraph(name: string, options: GraphOptions = {}): Client {
  const entry = graphs[name];
  if (!entry) {
    if (findInline(name)) throw new Error(`@relate/web-astro: "${name}" is an inline graph of a page; ask for it from the page's setup (onPage)`);
    throw new Error(`@relate/web-astro: no registered graph named "${name}" (registered: ${listNames()})`);
  }
  if (entry.lifetime !== "visit") {
    throw new Error(`@relate/web-astro: "${name}" has the "page" lifetime; ask for it from the page's setup (onPage), or register it with lifetime "visit"`);
  }
  return visitClient(name, options.descriptor ?? entry.descriptor, options.navigation ?? configured);
}
