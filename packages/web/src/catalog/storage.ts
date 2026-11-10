// The seam between the catalog and where its file lives (specs/007 research R1). The browser implementation keeps the
// file in the origin-private storage under a Web Lock; the in-memory one lets the lifecycle run in Node tests.

export type LockMode = "shared" | "exclusive";

export interface CatalogStorage {
  /** The file's text, or null when there is no file. Callers hold a lock. */
  read(): Promise<string | null>;
  /** Replace the file whole. Callers hold the exclusive lock. */
  replace(text: string): Promise<void>;
  /** Delete the file; absence is not an error. Callers hold the exclusive lock. */
  remove(): Promise<void>;
  /** Run `fn` holding the catalog lock: shared for reading, exclusive for writing. */
  withLock<T>(mode: LockMode, fn: () => Promise<T>): Promise<T>;
}
