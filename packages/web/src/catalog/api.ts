// The catalog operations a page calls (ADR-010 2.5, specs/007 contracts/catalog-api.md). They run on the page's main thread or in
// any worker of the origin, need the origin-private storage and Web Locks, and open no engine store.
import { Catalog } from "./catalog.js";
import { listStoreDirectories, opfsDirectories, readStoreSize, reconcile } from "./directory.js";
import { catalogSupported, OpfsCatalogStorage } from "./opfs-storage.js";
import { performRemoval, RemoveRefused, type RemoveOptions, type RemoveResult } from "./remove.js";
import type { ListingItem } from "./types.js";

/** Why a catalog operation was refused. */
export type CatalogErrorReason = "unavailable" | "locked" | "kind-mismatch" | "not-a-store";

export class CatalogError extends Error {
  readonly reason: CatalogErrorReason;
  constructor(reason: CatalogErrorReason, message: string) {
    super(message);
    this.name = "CatalogError";
    this.reason = reason;
  }
}

export interface ListOptions {
  /** Add each store's size and last-modified time, read from its files. Costs a file read per slot file. */
  sizes?: boolean;
}

export interface Listing {
  /** The state of the catalog file: `missing` for an origin that stored nothing. */
  catalog: "ok" | "missing" | "unreadable" | "newer";
  items: ListingItem[];
}

function requireStorage(): void {
  if (!catalogSupported()) throw new CatalogError("unavailable", "this browser does not offer the origin-private storage and Web Locks the catalog needs");
}

/** Every graph the origin has persisted: the catalog's entries joined with the store directories. Opens no store. */
export async function listGraphs(options: ListOptions = {}): Promise<Listing> {
  requireStorage();
  const read = await new Catalog(new OpfsCatalogStorage()).read();
  const items = reconcile(read, await listStoreDirectories());
  if (options.sizes) {
    for (const item of items) {
      if (!item.present) continue;
      const { size, modified } = await readStoreSize(item.store);
      item.size = size;
      item.modified = modified;
    }
  }
  return { catalog: read.status, items };
}

export type { RemoveOptions, RemoveResult } from "./remove.js";

/**
 * Remove one graph by its store name: write `removing`, remove the directory `relate/<store>`, delete the entry. A store
 * another tab holds is refused with reason `locked` and its entry is as its holder left it. Removing an application graph
 * discards the visitor's data, so `options.kind` must say so.
 */
export async function removeGraph(store: string, options: RemoveOptions): Promise<RemoveResult> {
  requireStorage();
  try {
    return await performRemoval(new Catalog(new OpfsCatalogStorage()), opfsDirectories, store, options);
  } catch (e) {
    if (e instanceof RemoveRefused) throw new CatalogError(e.reason, e.message);
    throw e;
  }
}

/** Delete the catalog file and nothing else: the way out of a catalog that does not parse. No store is touched. */
export async function resetCatalog(): Promise<{ deleted: boolean }> {
  requireStorage();
  return { deleted: await new Catalog(new OpfsCatalogStorage()).reset() };
}
