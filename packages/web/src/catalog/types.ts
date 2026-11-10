// The catalog's shapes (ADR-010 2.1, specs/007 data-model.md).

export type ApplicationState = "ready" | "seeding" | "migrating" | "importing" | "resetting" | "removing";
export type CacheState = "ready" | "loading" | "removing";
export type State = ApplicationState | CacheState;

export const APPLICATION_STATES: readonly ApplicationState[] = ["ready", "seeding", "migrating", "importing", "resetting", "removing"];
export const CACHE_STATES: readonly CacheState[] = ["ready", "loading", "removing"];

export interface ApplicationEntry {
  kind: "application";
  name: string;
  state: ApplicationState;
  /** The schema version as of the last completed seed or migration step. */
  version: number;
  /** The version being migrated to; present exactly when `state` is `migrating`. */
  target?: number;
  /** Whether the seed or import that last filled the store held at least one node. */
  seeded: boolean;
  /** ISO 8601 time of the last state change. */
  updatedAt: string;
}

export interface CacheEntry {
  kind: "cache";
  name: string;
  state: CacheState;
  /** The descriptor's revision as of the last complete load; required when `state` is `ready`. */
  revision?: string;
  updatedAt: string;
}

export type Entry = ApplicationEntry | CacheEntry;

/** An entry as a caller supplies it: `updatedAt` is set by the catalog on every write. */
export type EntryInput = Omit<ApplicationEntry, "updatedAt"> | Omit<CacheEntry, "updatedAt">;

/** The file's parsed shape. Entries stay raw until used, so one malformed entry does not block the others. */
export interface CatalogFile {
  format: number;
  graphs: Record<string, unknown>;
}

export type ReadResult =
  | { status: "missing" }
  | { status: "unreadable"; message: string }
  | { status: "newer"; format: number }
  | { status: "ok"; file: CatalogFile };

export type EntryCheck = { ok: true; entry: Entry } | { ok: false; reason: string };

/** One store, one entry, or both (data-model.md, listing item). */
export interface ListingItem {
  store: string;
  kind?: "application" | "cache";
  name?: string;
  state?: State;
  version?: number;
  revision?: string;
  registered: boolean;
  present: boolean;
  status: "ok" | "unregistered" | "missing";
  /** Only when sizes were requested. */
  size?: number;
  modified?: number;
}
