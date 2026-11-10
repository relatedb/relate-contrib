// The engine's browser stores as the origin-private directory shows them (ADR-010 2.5, SPIKE-011): each store is a directory
// `relate/<store>` of slot files. Listing reads names, and, when asked, the files' sizes and modification times. Nothing here
// opens a store, so it works while another tab holds one. The layout is the engine's own; only the directory's name is used.
import { splitStoreName, validateEntry } from "./file.js";
import type { ListingItem, ReadResult } from "./types.js";

/** The engine's directory at the origin-private root. */
const ENGINE_DIR = "relate";

type Entries = { entries(): AsyncIterable<[string, FileSystemHandle]> };
const entriesOf = (dir: FileSystemDirectoryHandle): AsyncIterable<[string, FileSystemHandle]> => (dir as unknown as Entries).entries();

const isNotFound = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { name?: string }).name === "NotFoundError";

async function engineDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(ENGINE_DIR);
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/** The names of the store directories under `relate/`, sorted. An origin that stored nothing has none. */
export async function listStoreDirectories(): Promise<string[]> {
  const dir = await engineDirectory();
  if (!dir) return [];
  const names: string[] = [];
  for await (const [name, handle] of entriesOf(dir)) if (handle.kind === "directory") names.push(name);
  return names.sort();
}

/** A store's size (the sum of its files, in bytes) and newest modification time. A file that cannot be read counts as nothing. */
export async function readStoreSize(store: string): Promise<{ size: number; modified: number }> {
  let size = 0;
  let modified = 0;
  const base = await engineDirectory();
  if (!base) return { size, modified };
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await base.getDirectoryHandle(store);
  } catch {
    return { size, modified };
  }
  for await (const [, handle] of entriesOf(dir)) {
    if (handle.kind !== "file") continue;
    try {
      const file = await (handle as FileSystemFileHandle).getFile();
      size += file.size;
      modified = Math.max(modified, file.lastModified);
    } catch {
      /* a file another worker is replacing; it adds nothing */
    }
  }
  return { size, modified };
}

/**
 * Join the catalog's entries with the directories found, by store name. A directory with no entry is `unregistered`, an
 * entry with no directory `missing`. A catalog that cannot be read or was written by a newer format lists the
 * directories only, each `unregistered`: its entries are not interpreted.
 */
export function reconcile(read: ReadResult, directories: string[]): ListingItem[] {
  const entries = read.status === "ok" ? read.file.graphs : {};
  const present = new Set(directories);
  const stores = [...new Set([...Object.keys(entries), ...directories])].sort();
  return stores.map((store): ListingItem => {
    const here = present.has(store);
    const raw = entries[store];
    if (raw === undefined) {
      const parts = splitStoreName(store);
      return { store, ...(parts ?? {}), registered: false, present: true, status: "unregistered" };
    }
    const parts = splitStoreName(store);
    const checked = validateEntry(store, raw);
    const base: ListingItem = { store, ...(parts ?? {}), registered: true, present: here, status: here ? "ok" : "missing" };
    if (!checked.ok) return base;
    const e = checked.entry;
    return { ...base, kind: e.kind, name: e.name, state: e.state, ...(e.kind === "application" ? { version: e.version } : e.revision !== undefined ? { revision: e.revision } : {}) };
  });
}

/** Why a store directory could not be removed: another tab holds its files. */
export class StoreHeldError extends Error {
  constructor(store: string) {
    super(`the files of ${store} are held by another tab`);
    this.name = "StoreHeldError";
  }
}

/** What removal needs of the directories; the browser's is {@link opfsDirectories}, tests give their own. */
export interface StoreDirectories {
  /**
   * Run `job` while holding the right to remove or roll back this store, so two removals of one store never overlap, in
   * this tab or another. It is a lock of its own: the catalog lock is never held across a directory operation.
   */
  serialize<T>(store: string, job: () => Promise<T>): Promise<T>;
  exists(store: string): Promise<boolean>;
  /** Remove `relate/<store>` and everything in it. Resolves false when there was none; throws {@link StoreHeldError} when it is held. */
  remove(store: string): Promise<boolean>;
}

export const opfsDirectories: StoreDirectories = {
  serialize(store, job) {
    return navigator.locks.request(`relate-web:remove:${store}`, { mode: "exclusive" }, job) as Promise<never>;
  },
  async exists(store) {
    return (await listStoreDirectories()).includes(store);
  },
  async remove(store) {
    const base = await engineDirectory();
    if (!base) return false;
    try {
      await base.removeEntry(store, { recursive: true });
      return true;
    } catch (e) {
      const name = typeof e === "object" && e !== null ? (e as { name?: string }).name : undefined;
      if (name === "NotFoundError") return false;
      // The browser refuses to remove files another tab holds open (measured in Chromium, Firefox and WebKit).
      if (name === "NoModificationAllowedError" || name === "InvalidStateError") throw new StoreHeldError(store);
      throw e;
    }
  },
};
