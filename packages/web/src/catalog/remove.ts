// Removing a graph (ADR-010 2.5, specs/007 contracts/catalog-api.md): intent first, then the directory, then the entry.
// Only a tab that does not hold the store can remove it, because the browser refuses to remove files another tab has open.
import { CatalogUnavailable, type Catalog } from "./catalog.js";
import { StoreHeldError, type StoreDirectories } from "./directory.js";
import { splitStoreName } from "./file.js";
import type { Entry, EntryInput } from "./types.js";

export type RemoveFailure = "locked" | "kind-mismatch" | "not-a-store";

export class RemoveRefused extends Error {
  readonly reason: RemoveFailure;
  constructor(reason: RemoveFailure, message: string) {
    super(message);
    this.name = "RemoveRefused";
    this.reason = reason;
  }
}

export interface RemoveOptions {
  /** What the caller says it is removing: required, and an application graph's data cannot be removed without saying so. */
  kind: "application" | "cache";
}

export interface RemoveResult {
  store: string;
  kind: "application" | "cache";
  /** The entry as it was, or null when the store had none. */
  entry: Entry | null;
  /** What was discarded: the visitor's data, a cache, a directory the catalog did not know, or nothing at all. */
  discarded: "application data" | "cache" | "unregistered directory" | "nothing";
}

/** An entry as input again: the catalog stamps its own `updatedAt` on every write. */
const withoutTime = (entry: Entry): EntryInput => {
  const { updatedAt: _updatedAt, ...rest } = entry as unknown as Record<string, unknown>;
  void _updatedAt;
  return rest as unknown as EntryInput;
};

export async function performRemoval(catalog: Catalog, directories: StoreDirectories, store: string, options: RemoveOptions): Promise<RemoveResult> {
  const parts = splitStoreName(store);
  if (!parts) throw new RemoveRefused("not-a-store", `"${store}" is not the name of a store the core keeps (app-<name> or rel-<id>)`);
  if (options?.kind !== "application" && options?.kind !== "cache") {
    throw new RemoveRefused("kind-mismatch", 'say what is being removed: { kind: "application" } or { kind: "cache" }');
  }
  // The stated kind must match the store's name before anything is read, so removing an application graph's data
  // always takes an explicit "application", whatever the catalog holds or whether it can be read.
  if (parts.kind !== options.kind) {
    const named = parts.kind === "application" ? "an application graph" : "a cache";
    throw new RemoveRefused("kind-mismatch", `${store} is named as ${named}; say so to remove it (kind: "${parts.kind}")`);
  }
  return directories.serialize(store, () => removeStore(catalog, directories, store, parts.kind));
}

async function removeStore(catalog: Catalog, directories: StoreDirectories, store: string, kind: "application" | "cache"): Promise<RemoveResult> {
  // Intent first. A catalog that cannot be used does not stop a removal the caller asked for.
  let previous: Entry | undefined;
  let written: Entry | undefined;
  let malformed: string | undefined; // the stored text of an entry that is there but not valid
  let usable = true;
  try {
    const result = await catalog.update(store, (current, raw) => {
      previous = current;
      if (!current) {
        malformed = raw !== undefined ? JSON.stringify(raw) : undefined;
        return undefined;
      }
      // `target` belongs to a migrating entry only; an entry that kept it would not be valid in the state `removing`.
      const { target: _target, ...rest } = withoutTime(current) as EntryInput & { target?: number };
      void _target;
      return { ...rest, state: "removing" } as EntryInput;
    });
    written = result.changed ? (result.entry ?? undefined) : undefined;
  } catch (e) {
    if (!(e instanceof CatalogUnavailable)) throw e;
    usable = false;
  }

  const hadDirectory = await directories.exists(store);
  try {
    await directories.remove(store);
  } catch (e) {
    if (usable && previous && written) await restore(catalog, store, previous, written);
    if (e instanceof StoreHeldError) throw new RemoveRefused("locked", e.message);
    throw e;
  }

  if (usable && written) {
    await catalog.update(store, (current) => (current && current.state === "removing" && current.updatedAt === written!.updatedAt ? null : undefined));
  } else if (usable && malformed !== undefined) {
    // An entry that was not valid goes with its store, unless someone has written it since.
    await catalog.update(store, (current, raw) => (current === undefined && raw !== undefined && JSON.stringify(raw) === malformed ? null : undefined));
  }

  const discarded: RemoveResult["discarded"] =
    previous || malformed !== undefined ? (kind === "application" ? "application data" : "cache") : hadDirectory ? "unregistered directory" : "nothing";
  return { store, kind, entry: previous ?? null, discarded };
}

/** Put the entry back as it was, but only if nobody has changed it since the removal wrote `removing`. */
async function restore(catalog: Catalog, store: string, previous: Entry, written: Entry): Promise<void> {
  await catalog.update(store, (current) => (current && current.state === "removing" && current.updatedAt === written.updatedAt ? withoutTime(previous) : undefined));
}
