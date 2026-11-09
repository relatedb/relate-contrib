// What to do with a store that has just been opened (ADR-009 2.2; specs/006 data-model.md). Pure: it reads nothing.
import { MARKER_FORMAT } from "../../config.js";
import type { Marker } from "./marker.js";

export interface StoreFacts {
  markers: Marker[];
  /** Nodes of any kind, the marker included. */
  nodeCount: number;
  indexCount: number;
}

export type FailureReason = "store-unmarked" | "store-newer" | "import-interrupted" | "store-unreadable";

export type Action =
  | { action: "first-run" }
  | { action: "reset-and-seed" }
  | { action: "open" }
  | { action: "migrate"; from: number }
  | { action: "fail"; reason: FailureReason; message: string };

export function classify(facts: StoreFacts, code: { version: number; format?: number }): Action {
  const format = code.format ?? MARKER_FORMAT;
  if (facts.markers.length > 1) {
    return { action: "fail", reason: "store-unreadable", message: `the store holds ${facts.markers.length} markers; more than one marker` };
  }
  const marker = facts.markers[0];
  if (!marker) {
    if (facts.nodeCount === 0 && facts.indexCount === 0) return { action: "first-run" };
    return {
      action: "fail",
      reason: "store-unmarked",
      message: `the store holds ${facts.nodeCount} nodes and no marker; it was not created by this application or its marker was deleted`,
    };
  }
  // A marker whose fields are missing or not positive integers cannot be compared with this code's, so the store is
  // refused as unreadable before anything is recovered, reset or migrated.
  const positive = (n: unknown): boolean => typeof n === "number" && Number.isInteger(n) && n >= 1;
  if (!positive(marker.format) || !positive(marker.version) || typeof marker.state !== "string") {
    return { action: "fail", reason: "store-unreadable", message: "the marker's format, version or state is missing or not valid" };
  }
  // A newer release's store is refused whatever state it is in, so older code never resets it.
  if (marker.format > format) {
    return { action: "fail", reason: "store-newer", message: `the store's format ${marker.format} is newer than this code's ${format}` };
  }
  if (marker.version > code.version) {
    return { action: "fail", reason: "store-newer", message: `the store is at version ${marker.version}, newer than this code's ${code.version}` };
  }
  if (marker.state === "seeding") return { action: "reset-and-seed" };
  if (marker.state === "importing") {
    return { action: "fail", reason: "import-interrupted", message: "an import into this store did not finish" };
  }
  if (marker.state !== "ready") {
    return { action: "fail", reason: "store-unreadable", message: `the marker's state "${String(marker.state)}" is not one this code knows` };
  }
  if (marker.version < code.version) return { action: "migrate", from: marker.version };
  return { action: "open" };
}
