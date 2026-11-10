// Reading the catalog file (ADR-010 2.1, specs/007 research R6): the file is checked as a whole, and each entry only
// when it is used.
import { APP_NAME_PATTERN, CATALOG_FORMAT, ID_PATTERN } from "../config.js";
import {
  APPLICATION_STATES,
  CACHE_STATES,
  type ApplicationEntry,
  type CacheEntry,
  type CatalogFile,
  type EntryCheck,
  type ReadResult,
} from "./types.js";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Parse the file's text. An absent file is `missing` (the caller passes `null`). */
export function parseCatalog(text: string | null): ReadResult {
  if (text === null) return { status: "missing" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { status: "unreadable", message: `the catalog is not valid JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!isObject(value)) return { status: "unreadable", message: "the catalog is not a JSON object" };
  const { format, graphs } = value;
  if (typeof format !== "number" || !Number.isInteger(format) || format < 1) return { status: "unreadable", message: "the catalog has no valid format" };
  if (!isObject(graphs)) return { status: "unreadable", message: "the catalog has no graphs object" };
  if (format > CATALOG_FORMAT) return { status: "newer", format };
  // The parsed object itself is kept, so a field this code does not know survives a rewrite.
  return { status: "ok", file: value as unknown as CatalogFile };
}

export function serializeCatalog(file: CatalogFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

export const emptyCatalog = (): CatalogFile => ({ format: CATALOG_FORMAT, graphs: {} });

/** The store name's kind and the name inside it, or null when the key is not a store name. */
export function splitStoreName(key: string): { kind: "application" | "cache"; name: string } | null {
  if (key.startsWith("app-")) {
    const name = key.slice(4);
    return APP_NAME_PATTERN.test(name) ? { kind: "application", name } : null;
  }
  if (key.startsWith("rel-")) {
    const name = key.slice(4);
    return ID_PATTERN.test(name) ? { kind: "cache", name } : null;
  }
  return null;
}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;

/** Check one entry as it is used. The same object is returned, so fields this code does not know survive a rewrite. */
export function validateEntry(key: string, raw: unknown): EntryCheck {
  const fail = (reason: string): EntryCheck => ({ ok: false, reason: `${key}: ${reason}` });
  const parts = splitStoreName(key);
  if (!parts) return fail("not a store name");
  if (!isObject(raw)) return fail("not an object");
  if (raw.kind !== parts.kind) return fail(`kind ${String(raw.kind)} does not match the store name`);
  if (raw.name !== parts.name) return fail("name does not match the store name");
  if (typeof raw.updatedAt !== "string" || raw.updatedAt === "" || Number.isNaN(Date.parse(raw.updatedAt))) return fail("updatedAt is not a time");

  if (parts.kind === "application") {
    if (!(APPLICATION_STATES as readonly unknown[]).includes(raw.state)) return fail(`unknown state ${String(raw.state)}`);
    if (!positive(raw.version)) return fail("version is not a positive integer");
    if (typeof raw.seeded !== "boolean") return fail("seeded is not a boolean");
    if (raw.state === "migrating") {
      if (!positive(raw.target) || raw.target <= raw.version) return fail("a migrating entry needs a target above its version");
    } else if (raw.target !== undefined) {
      return fail("only a migrating entry has a target");
    }
    return { ok: true, entry: raw as unknown as ApplicationEntry };
  }

  if (!(CACHE_STATES as readonly unknown[]).includes(raw.state)) return fail(`unknown state ${String(raw.state)}`);
  if (raw.revision !== undefined && typeof raw.revision !== "string") return fail("revision is not a string");
  if (raw.state === "ready" && (typeof raw.revision !== "string" || raw.revision === "")) return fail("a ready cache needs a revision");
  return { ok: true, entry: raw as unknown as CacheEntry };
}
