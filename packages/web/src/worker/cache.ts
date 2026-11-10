// A content cache's use of the catalog (ADR-010 2.4): whether an opened store can be restored, the intent written before a
// store is rebuilt, and the outcome written after. A cache is always rebuildable, so nothing here fails the page: a
// catalog that cannot be read, or written (it does not parse, a newer format wrote it, the storage errors), only means
// the rebuild writes no entry and the next open rebuilds again.
import type { Catalog } from "../catalog/catalog.js";
import type { Descriptor } from "../data/types.js";
import type { Engine } from "./engine.js";
import { isEmpty, nodeCount, sweepScoped } from "./sweep.js";

/** A cache's name in the catalog, as the engine names its store. */
export const cacheStoreName = (id: string): string => `rel-${id}`;

/** A store can be used as it is when its entry is `ready` at the descriptor's revision and it holds all the nodes. */
export async function canRestore(opened: Engine, catalog: Catalog, descriptor: Descriptor): Promise<boolean> {
  const found = await catalog.lookup(cacheStoreName(descriptor.id));
  if (found.status !== "entry" || found.entry.kind !== "cache") return false;
  if (found.entry.state !== "ready" || found.entry.revision !== descriptor.revision) return false;
  sweepScoped(opened);
  return nodeCount(opened) === descriptor.data.nodes;
}

/**
 * Prepare a store for a rebuild: write `loading` (intent first), then reset the store if it holds anything. Returns
 * whether the catalog took the write; when it did not, the caller skips the outcome write too.
 */
export async function beginRebuild(opened: Engine, catalog: Catalog, descriptor: Descriptor): Promise<boolean> {
  let writable = true;
  try {
    await catalog.set(cacheStoreName(descriptor.id), { kind: "cache", name: descriptor.id, state: "loading", revision: descriptor.revision });
  } catch {
    writable = false;
  }
  if (!isEmpty(opened)) opened.reset();
  return writable;
}

/** After a complete load: write `ready` with the revision, last. */
export async function finishRebuild(catalog: Catalog, descriptor: Descriptor): Promise<void> {
  try {
    await catalog.set(cacheStoreName(descriptor.id), { kind: "cache", name: descriptor.id, state: "ready", revision: descriptor.revision });
  } catch {
    /* the cache works without its entry; the next open rebuilds */
  }
}
