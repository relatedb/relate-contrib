// Finding a graph by id and making its client (spec FR-018 to FR-022; ADR-007 §2.4). Everything about the instance (worker, status, faults,
// loading) is the core's; this file decides which core client an id gets and who ends it. Module state: touched only after mount, in the
// browser (module state on a server is shared by every request).
import { createClient, createSiteClient } from "@relate/contrib-web";
import { findInline } from "./inline.js";
import { descriptorLocation } from "./locations.js";

/**
 * @typedef {import("@relate/contrib-web").Client} Client
 * @typedef {import("./context.js").Config} Config
 * @typedef {{ navigation?: "client-routing" | "multi-page", descriptor?: string }} GraphOptions
 * @typedef {{ client: Client, release(): void }} Held
 */

const OWNER = "@relate/contrib-sveltekit";

/** @param {Config} config */
const registeredList = (config) => (config.catalog.length ? config.catalog.map((g) => g.id).join(", ") : "(none)");

/** Visit-lifetime clients, one per profile, id and descriptor. Navigation never destroys them. @type {Map<string, Client>} */
const visitClients = new Map();

/**
 * @param {Config} config
 * @param {string} id
 * @param {string} descriptor
 * @param {"client-routing" | "multi-page"} profile
 * @returns {Client}
 */
function visitClient(config, id, descriptor, profile) {
  const key = `${profile}\n${id}\n${descriptor}`;
  let client = visitClients.get(key);
  if (!client) {
    // The core's site client holds one client per visit whatever graph is asked for, so graphs are kept by id here.
    client =
      profile === "multi-page"
        ? createSiteClient({ engineUrl: config.engineUrl, graph: { descriptor }, navigation: profile })
        : createClient({ engineUrl: config.engineUrl, graph: { descriptor }, navigation: profile });
    visitClients.set(key, client);
  }
  return client;
}

/** Page-lifetime clients (registered or inline), shared by their holders. @type {Map<string, { client: Client, holders: number, timer: ReturnType<typeof setTimeout> | null }>} */
const pageEntries = new Map();

const elementIds = new WeakMap();
let nextElement = 1;
/** @param {Element} el */
const idOf = (el) => elementIds.get(el) ?? (elementIds.set(el, nextElement), nextElement++);

let listening = false;

/** A document that ends (a closed tab, a reload, a link to another document) takes its page clients with it: end them now. */
function endPageClientsOnDeparture() {
  if (listening || typeof addEventListener !== "function") return;
  listening = true;
  addEventListener("pagehide", (event) => {
    // A page the browser keeps in its back/forward cache comes back alive; its clients must still be there.
    if (/** @type {PageTransitionEvent} */ (event).persisted) return;
    for (const entry of pageEntries.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.client.destroy();
    }
    pageEntries.clear();
  });
}

/**
 * @param {string} key
 * @param {() => Client} make
 * @returns {Held}
 */
function holdPage(key, make) {
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
      // One task later: SvelteKit destroys the old page's holders before the new page's holders appear, so a graph used by two
      // consecutive pages must survive the gap between a release and the next hold (SPIKE-007 5.3).
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

/**
 * Ask for a graph after mount. Looks among the document's inline graphs, then in the catalog.
 * @param {Config} config
 * @param {string} id
 * @param {GraphOptions} [options]
 * @returns {Held}
 */
export function hold(config, id, options = {}) {
  const profile = options.navigation ?? config.profile;
  const inline = findInline(id);
  if (inline) {
    // The server's check of this needs the catalog at render time, so it is repeated here, where it always can be.
    if (config.catalog.some((g) => g.id === id)) throw new Error(`${OWNER}: "${id}" is both an inline graph of this page and a registered graph; use one id for one or the other`);
    const key = `inline\n${profile}\n${id}\n${idOf(inline.element)}`;
    return holdPage(key, () => createClient({ engineUrl: config.engineUrl, graph: { document: /** @type {never} */ (inline.document), indexes: inline.indexes }, navigation: profile }));
  }
  const entry = config.catalog.find((g) => g.id === id);
  if (!entry) throw new Error(`${OWNER}: no graph with the id "${id}" in this page or among the registered graphs (${registeredList(config)})`);
  const descriptor = options.descriptor ?? descriptorLocation(id);
  if (entry.lifetime === "visit") return { client: visitClient(config, id, descriptor, profile), release() {} };
  // The stored copy is used whenever there is a descriptor, so the next page restores instead of fetching.
  return holdPage(`page\n${profile}\n${id}\n${descriptor}`, () => createClient({ engineUrl: config.engineUrl, graph: { descriptor }, navigation: profile, store: true }));
}

/**
 * A visit-lifetime registered graph, for code that lives across pages (spec FR-023).
 * @param {Config | null} config
 * @param {string} id
 * @param {GraphOptions} [options]
 * @returns {Client}
 */
export function visitGraph(config, id, options = {}) {
  if (!config) throw new Error(`${OWNER}: graph("${id}") was called before RelateProvider mounted; ask after it has mounted, or from a component with useGraph`);
  const entry = config.catalog.find((g) => g.id === id);
  if (!entry) {
    if (findInline(id)) throw new Error(`${OWNER}: "${id}" is an inline graph of a page; ask for it from a component with useGraph`);
    throw new Error(`${OWNER}: no registered graph with the id "${id}" (registered: ${registeredList(config)})`);
  }
  if (entry.lifetime !== "visit") throw new Error(`${OWNER}: "${id}" has the "page" lifetime; ask for it from a component with useGraph, or register it with lifetime "visit"`);
  return visitClient(config, id, options.descriptor ?? descriptorLocation(id), options.navigation ?? config.profile);
}

/** For tests: forget every client without destroying it. */
export function forgetAll() {
  visitClients.clear();
  for (const entry of pageEntries.values()) if (entry.timer !== null) clearTimeout(entry.timer);
  pageEntries.clear();
  listening = false;
}
