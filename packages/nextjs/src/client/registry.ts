// Finding a graph by name and making its client (spec FR-018 to FR-022; ADR-005 §2.4). Everything about the instance
// (worker, status, faults, loading) is the core's; this file decides which core client a name gets and who ends it.
import { createClient, createSiteClient } from "@relate/web";
import type { Client } from "@relate/web";
import type { Navigation } from "../env.js";
import type { Catalog } from "../server/catalog.js";
import { findInline } from "./inline.js";

export type { Navigation } from "../env.js";

export interface Config {
  catalog: Catalog;
  engineUrl: string | URL;
  profile: Navigation;
}

export interface GraphOptions {
  /** Testing aid: the profile passed to the core instead of the configured one. */
  navigation?: Navigation;
  /** Testing aid: the descriptor location used instead of the registered graph's. */
  descriptor?: string;
}

export interface Held {
  client: Client;
  /** Give the client back. A page client is destroyed one task after its last holder is released. */
  release(): void;
}

const registeredList = (catalog: Catalog): string => (catalog.graphs.length ? catalog.graphs.map((g) => g.id).join(", ") : "(none)");

/** Visit-lifetime clients, one per profile, name and descriptor. Module state: navigation never destroys them. */
const visitClients = new Map<string, Client>();

function visitClient(config: Config, id: string, descriptor: string, profile: Navigation): Client {
  const key = `${profile}\n${id}\n${descriptor}`;
  let client = visitClients.get(key);
  if (!client) {
    // The core's site client holds one client per visit whatever graph is asked for, so graphs are kept by name here.
    client =
      profile === "multi-page"
        ? createSiteClient({ engineUrl: config.engineUrl, graph: { descriptor }, navigation: profile })
        : createClient({ engineUrl: config.engineUrl, graph: { descriptor }, navigation: profile });
    visitClients.set(key, client);
  }
  return client;
}

interface PageEntry {
  client: Client;
  holders: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Page-lifetime clients (registered or inline), shared by their holders. */
const pageEntries = new Map<string, PageEntry>();

const elementIds = new WeakMap<Element, number>();
let nextElement = 1;
const idOf = (el: Element): number => elementIds.get(el) ?? (elementIds.set(el, nextElement), nextElement++);

let listening = false;

/** A document that ends (a closed tab, a reload, a link to another document) takes its page clients with it: end them now. */
function endPageClientsOnDeparture(): void {
  if (listening || typeof addEventListener !== "function") return;
  listening = true;
  addEventListener("pagehide", (event) => {
    // A page the browser keeps in its back/forward cache comes back alive; its clients must still be there.
    if ((event as PageTransitionEvent).persisted) return;
    for (const entry of pageEntries.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.client.destroy();
    }
    pageEntries.clear();
  });
}

function holdPage(key: string, make: () => Client): Held {
  endPageClientsOnDeparture();
  let entry = pageEntries.get(key);
  if (!entry) {
    entry = { client: make(), holders: 0, timer: null };
    pageEntries.set(key, entry);
  }
  if (entry.timer !== null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.holders++;
  const mine = entry;
  let released = false;
  return {
    client: mine.client,
    release() {
      if (released) return;
      released = true;
      if (--mine.holders > 0) return;
      // One task later, so a release and a hold in the same task (React's development double mount) end nothing.
      mine.timer = setTimeout(() => {
        mine.timer = null;
        if (mine.holders === 0 && pageEntries.get(key) === mine) {
          pageEntries.delete(key);
          mine.client.destroy();
        }
      }, 0);
    },
  };
}

/** Ask for a graph from a component's effect. Looks among the document's inline graphs, then in the catalog. */
export function hold(config: Config, id: string, options: GraphOptions = {}): Held {
  const profile = options.navigation ?? config.profile;
  const inline = findInline(id);
  if (inline) {
    // The server's check of this needs `catalog()` to have run before the page rendered, so it is repeated here, where it always can.
    if (config.catalog.graphs.some((g) => g.id === id)) {
      throw new Error(`@relate/nextjs: "${id}" is both an inline graph of this page and a registered graph; use one name for one or the other`);
    }
    const key = `inline\n${profile}\n${id}\n${idOf(inline.element)}`;
    return holdPage(key, () => createClient({ engineUrl: config.engineUrl, graph: { document: inline.document as never, indexes: inline.indexes }, navigation: profile }));
  }
  const entry = config.catalog.graphs.find((g) => g.id === id);
  if (!entry) throw new Error(`@relate/nextjs: no graph named "${id}" in this page or among the registered graphs (${registeredList(config.catalog)})`);
  const descriptor = options.descriptor ?? entry.descriptor;
  if (entry.lifetime === "visit") return { client: visitClient(config, id, descriptor, profile), release() {} };
  // The stored copy is used whenever there is a descriptor, so the next page restores instead of fetching.
  return holdPage(`page\n${profile}\n${id}\n${descriptor}`, () => createClient({ engineUrl: config.engineUrl, graph: { descriptor }, navigation: profile, store: true }));
}

/** A visit-lifetime registered graph, for code that lives across pages (spec FR-022). */
export function visitGraph(config: Config | null, id: string, options: GraphOptions = {}): Client {
  if (!config) throw new Error(`@relate/nextjs: graph("${id}") was called before the provider mounted; ask after RelateProvider has mounted, or from a component with useGraph`);
  const entry = config.catalog.graphs.find((g) => g.id === id);
  if (!entry) {
    if (findInline(id)) throw new Error(`@relate/nextjs: "${id}" is an inline graph of a page; ask for it from a component with useGraph`);
    throw new Error(`@relate/nextjs: no registered graph named "${id}" (registered: ${registeredList(config.catalog)})`);
  }
  if (entry.lifetime !== "visit") {
    throw new Error(`@relate/nextjs: "${id}" has the "page" lifetime; ask for it from a component with useGraph, or register it with lifetime "visit"`);
  }
  return visitClient(config, id, options.descriptor ?? entry.descriptor, options.navigation ?? config.profile);
}
