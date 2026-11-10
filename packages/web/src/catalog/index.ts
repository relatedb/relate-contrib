import { Catalog } from "./catalog.js";
import { MemoryCatalogStorage } from "./memory-storage.js";
import { OpfsCatalogStorage } from "./opfs-storage.js";

export { Catalog, CatalogUnavailable } from "./catalog.js";
export { MemoryCatalogStorage } from "./memory-storage.js";
export { OpfsCatalogStorage, catalogSupported } from "./opfs-storage.js";
export { CatalogError, listGraphs } from "./api.js";
export type { CatalogErrorReason, ListOptions, Listing } from "./api.js";
export type { CatalogStorage, LockMode } from "./storage.js";
export type { ApplicationEntry, ApplicationState, CacheEntry, CacheState, Entry, EntryInput, ListingItem, State } from "./types.js";

/** The catalog a worker uses: the durable file under the Web Lock, or, for a client that runs in memory, one that lives in memory and writes nothing durable. */
export function openCatalog(durable: boolean): Catalog {
  return new Catalog(durable ? new OpfsCatalogStorage() : new MemoryCatalogStorage());
}
