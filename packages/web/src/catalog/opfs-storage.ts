// The catalog file in the browser's origin-private storage, ordered by a Web Lock (ADR-010 2.2). Reading and replacing
// work from a page and from a worker. The replace goes through a writable stream, which swaps the file on close, and
// falls back to a synchronous access handle where the stream is absent. Under the lock the choice does not affect readers.
import { CATALOG_DIR, CATALOG_FILE, CATALOG_LOCK } from "../config.js";
import type { CatalogStorage, LockMode } from "./storage.js";

// The synchronous access handle is part of the worker file API; the DOM typings do not include it.
interface SyncAccessHandle {
  truncate(size: number): void;
  write(buffer: BufferSource, options?: { at?: number }): number;
  flush(): void;
  close(): void;
}
type SyncFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncAccessHandle> };
type WritableFileHandle = FileSystemFileHandle & { createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> };

const isNotFound = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { name?: string }).name === "NotFoundError";

/** True when the browser offers both halves the catalog needs: the origin-private storage and Web Locks. */
export function catalogSupported(): boolean {
  const nav = (globalThis as { navigator?: { storage?: { getDirectory?: unknown }; locks?: { request?: unknown } } }).navigator;
  return typeof nav?.storage?.getDirectory === "function" && typeof nav?.locks?.request === "function";
}

export class OpfsCatalogStorage implements CatalogStorage {
  private async directory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
    try {
      const root = await navigator.storage.getDirectory();
      return await root.getDirectoryHandle(CATALOG_DIR, { create });
    } catch (e) {
      if (!create && isNotFound(e)) return null;
      throw e;
    }
  }

  async read(): Promise<string | null> {
    const dir = await this.directory(false);
    if (!dir) return null;
    try {
      return await (await (await dir.getFileHandle(CATALOG_FILE)).getFile()).text();
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async replace(text: string): Promise<void> {
    const dir = await this.directory(true);
    const handle = await dir!.getFileHandle(CATALOG_FILE, { create: true });
    if (typeof (handle as Partial<WritableFileHandle>).createWritable === "function") {
      const writable = await (handle as WritableFileHandle).createWritable();
      await writable.write(text);
      await writable.close();
      return;
    }
    const sync = await (handle as SyncFileHandle).createSyncAccessHandle();
    try {
      sync.truncate(0);
      sync.write(new TextEncoder().encode(text), { at: 0 });
      sync.flush();
    } finally {
      sync.close();
    }
  }

  async remove(): Promise<void> {
    const dir = await this.directory(false);
    if (!dir) return;
    try {
      await dir.removeEntry(CATALOG_FILE);
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }

  withLock<T>(mode: LockMode, fn: () => Promise<T>): Promise<T> {
    return navigator.locks.request(CATALOG_LOCK, { mode }, fn) as Promise<T>;
  }
}
