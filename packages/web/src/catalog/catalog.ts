// The catalog (ADR-010 2.2): reads and read-modify-write updates of one file, each under the catalog lock.
// A write applies one change to the current file and replaces it whole. The lock is held for the file access only.
import { CATALOG_FORMAT } from "../config.js";
import { emptyCatalog, parseCatalog, serializeCatalog, validateEntry } from "./file.js";
import type { CatalogStorage } from "./storage.js";
import type { CatalogFile, Entry, EntryInput, ReadResult } from "./types.js";

/** The file cannot be written over: it does not parse, or a newer format wrote it. Nothing was changed. */
export class CatalogUnavailable extends Error {
  readonly reason: "unreadable" | "newer";
  constructor(reason: "unreadable" | "newer", message: string) {
    super(message);
    this.name = "CatalogUnavailable";
    this.reason = reason;
  }
}

export type Lookup =
  | { status: "none" }
  | { status: "entry"; entry: Entry }
  | { status: "invalid"; reason: string }
  | { status: "catalog-unreadable"; message: string }
  | { status: "catalog-newer"; format: number };

/**
 * What to do with one entry: return the new entry (without `updatedAt`), `null` to delete it, or `undefined` to leave
 * the file alone. `raw` is the stored value, which is `undefined` when there is none and differs from `current` when
 * the stored entry is malformed.
 */
export type Change = (current: Entry | undefined, raw: unknown) => EntryInput | null | undefined;

export interface UpdateResult {
  changed: boolean;
  entry: Entry | null;
}

const KNOWN = new Set(["kind", "name", "state", "version", "target", "seeded", "revision", "updatedAt"]);

export class Catalog {
  constructor(
    private readonly storage: CatalogStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** The whole file, read under the shared lock. */
  read(): Promise<ReadResult> {
    return this.storage.withLock("shared", async () => parseCatalog(await this.storage.read()));
  }

  /** One graph's entry, read under the shared lock. */
  async lookup(store: string): Promise<Lookup> {
    const read = await this.read();
    if (read.status === "unreadable") return { status: "catalog-unreadable", message: read.message };
    if (read.status === "newer") return { status: "catalog-newer", format: read.format };
    if (read.status === "missing") return { status: "none" };
    const raw = read.file.graphs[store];
    if (raw === undefined) return { status: "none" };
    const check = validateEntry(store, raw);
    return check.ok ? { status: "entry", entry: check.entry } : { status: "invalid", reason: check.reason };
  }

  /** Apply one change to one entry inside the exclusive lock. Rejects with {@link CatalogUnavailable} for a file it must not overwrite. */
  update(store: string, change: Change): Promise<UpdateResult> {
    return this.storage.withLock("exclusive", async () => {
      const read = parseCatalog(await this.storage.read());
      if (read.status === "unreadable") throw new CatalogUnavailable("unreadable", read.message);
      if (read.status === "newer") throw new CatalogUnavailable("newer", `the catalog's format ${read.format} is newer than this code's ${CATALOG_FORMAT}`);
      const file: CatalogFile = read.status === "ok" ? read.file : emptyCatalog();

      const raw = file.graphs[store];
      const check = raw === undefined ? null : validateEntry(store, raw);
      const current = check && check.ok ? check.entry : undefined;
      const next = change(current, raw);

      if (next === undefined) return { changed: false, entry: current ?? null };
      if (next === null) {
        if (!(store in file.graphs)) return { changed: false, entry: null };
        delete file.graphs[store];
        await this.storage.replace(serializeCatalog(file));
        return { changed: true, entry: null };
      }
      const entry = this.stamp(next, raw);
      file.graphs[store] = entry;
      await this.storage.replace(serializeCatalog(file));
      return { changed: true, entry };
    });
  }

  /** Write one entry whatever it was, and return it with its new `updatedAt`. */
  async set(store: string, input: EntryInput): Promise<Entry> {
    const { entry } = await this.update(store, () => input);
    return entry!;
  }

  /** Delete one entry (a missing one is not an error). */
  async delete(store: string): Promise<void> {
    await this.update(store, () => null);
  }

  /** Delete the catalog file and nothing else (ADR-010 2.5). Works on an unreadable file. Resolves to whether there was a file. */
  reset(): Promise<boolean> {
    return this.storage.withLock("exclusive", async () => {
      const had = (await this.storage.read()) !== null;
      await this.storage.remove();
      return had;
    });
  }

  /** The entry with the time of this write, strictly later than the entry it replaces, and any field this code does not know kept. */
  private stamp(next: EntryInput, raw: unknown): Entry {
    const extras: Record<string, unknown> = {};
    let previous = Number.NaN;
    if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) if (!KNOWN.has(key)) extras[key] = value;
      const at = (raw as Record<string, unknown>).updatedAt;
      if (typeof at === "string") previous = Date.parse(at);
    }
    let now = this.clock().getTime();
    if (Number.isFinite(previous) && now <= previous) now = previous + 1;
    return { ...extras, ...next, updatedAt: new Date(now).toISOString() } as Entry;
  }
}
