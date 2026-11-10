// What to do with an application store that has just been opened (ADR-010 2.3; specs/007 data-model.md).
// It reads nothing itself: the catalog's answer comes in, and the facts about the store are read through a function it
// calls only when the classification depends on them, so opening a ready store does not scan it.
import type { Lookup } from "../../catalog/catalog.js";

/** The label the earlier form of an application store carried on its record node. Named only in a message. */
export const LEGACY_MARKER_LABEL = "_RelateApplication";

export interface StoreFacts {
  nodeCount: number;
  indexCount: number;
  /** Whether a node carries {@link LEGACY_MARKER_LABEL}; read only for a store with data and no entry. */
  legacyMarker: boolean;
}

export type FailureReason = "store-unmarked" | "store-newer" | "import-interrupted" | "store-unreadable" | "store-lost";

export type Action =
  | { action: "first-run" }
  | { action: "reset-and-seed"; intent: "seeding" | "resetting" }
  | { action: "finish-removal" }
  | { action: "open" }
  | { action: "migrate"; from: number }
  | { action: "fail"; reason: FailureReason; message: string };

const isEmpty = (facts: StoreFacts): boolean => facts.nodeCount === 0 && facts.indexCount === 0;

export function classify(lookup: Lookup, readFacts: () => StoreFacts, code: { version: number }): Action {
  switch (lookup.status) {
    case "catalog-unreadable":
      return { action: "fail", reason: "store-unreadable", message: `the catalog could not be read: ${lookup.message}` };
    case "catalog-newer":
      return { action: "fail", reason: "store-newer", message: `the catalog's format ${lookup.format} is newer than this code's` };
    case "invalid":
      return { action: "fail", reason: "store-unreadable", message: `the catalog's entry for this application is not valid: ${lookup.reason}` };
    case "none": {
      const facts = readFacts();
      if (isEmpty(facts)) return { action: "first-run" };
      const legacy = facts.legacyMarker ? ` It holds a node labelled ${LEGACY_MARKER_LABEL}, the record an earlier form of this package kept inside the graph; that form is not read any more.` : "";
      return {
        action: "fail",
        reason: "store-unmarked",
        message: `the store holds ${facts.nodeCount} nodes and the catalog has no entry for it; it was not created by this application, or its entry was removed.${legacy}`,
      };
    }
    case "entry":
      break;
  }

  const entry = lookup.entry;
  if (entry.kind !== "application") return { action: "fail", reason: "store-unreadable", message: "the catalog's entry for this store is not an application's" };
  // A newer release's store is refused whatever state it is in, so older code never resets it.
  if (entry.version > code.version) {
    return { action: "fail", reason: "store-newer", message: `the store is at version ${entry.version}, newer than this code's ${code.version}` };
  }
  // A migration to a version above this code's has started, and some of its changes may already be applied: this code
  // cannot finish it, and must not report the data ready.
  if (entry.state === "migrating" && entry.target !== undefined && entry.target > code.version) {
    return { action: "fail", reason: "store-newer", message: `a migration of this store to version ${entry.target} started and did not finish; this code is at version ${code.version}` };
  }
  switch (entry.state) {
    case "seeding":
      return { action: "reset-and-seed", intent: "seeding" };
    case "resetting":
      return { action: "reset-and-seed", intent: "resetting" };
    case "importing":
      return { action: "fail", reason: "import-interrupted", message: "an import into this store did not finish" };
    case "removing":
      return { action: "finish-removal" };
    case "migrating":
      return { action: "migrate", from: entry.version };
    case "ready":
      break;
  }
  if (entry.seeded && isEmpty(readFacts())) {
    return { action: "fail", reason: "store-lost", message: "the catalog says this store was filled, and it is empty: its data is gone" };
  }
  return entry.version < code.version ? { action: "migrate", from: entry.version } : { action: "open" };
}
