// The stored copy of a descriptor (ADR-003 2.5): a small file at the origin-private root, outside the directory
// the engine manages for its store, that records which graph the store holds. It is removed before a store is
// reset and written last after a complete load, so a copy that is present describes a complete store.
import { STORED_COPY_DIR } from "../config.js";
import { validateDescriptor } from "../data/descriptor.js";
import type { Descriptor } from "../data/types.js";

async function directory(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(STORED_COPY_DIR, { create });
  } catch {
    return null;
  }
}

const fileName = (id: string): string => `${id}.json`;

// The synchronous access handle is part of the worker file API; the DOM typings do not include it.
interface SyncAccessHandle {
  truncate(size: number): void;
  write(buffer: BufferSource, options?: { at?: number }): number;
  flush(): void;
  close(): void;
}
type WorkerFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncAccessHandle> };

/** The stored copy, or null when there is none or it is not a valid descriptor. */
export async function readStoredCopy(id: string): Promise<Descriptor | null> {
  const dir = await directory(false);
  if (!dir) return null;
  try {
    const file = await (await dir.getFileHandle(fileName(id))).getFile();
    const checked = validateDescriptor(JSON.parse(await file.text()));
    return checked.ok ? checked.descriptor : null;
  } catch {
    return null;
  }
}

/** Write the copy with a synchronous access handle (available to dedicated workers in every supported browser). */
export async function writeStoredCopy(descriptor: Descriptor): Promise<boolean> {
  const dir = await directory(true);
  if (!dir) return false;
  try {
    const file = (await dir.getFileHandle(fileName(descriptor.id), { create: true })) as WorkerFileHandle;
    const handle = await file.createSyncAccessHandle();
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(descriptor));
      handle.truncate(0);
      handle.write(bytes, { at: 0 });
      handle.flush();
    } finally {
      handle.close();
    }
    return true;
  } catch {
    return false;
  }
}

export async function removeStoredCopy(id: string): Promise<void> {
  const dir = await directory(false);
  if (!dir) return;
  try {
    await dir.removeEntry(fileName(id));
  } catch {
    /* there was no copy */
  }
}
