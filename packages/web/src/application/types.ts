// The public types of application mode (ADR-009; specs/006-application-graphs/data-model.md).
import type { Descriptor, GraphDocument, IndexSpec } from "../data/types.js";

/** A migration step that runs a statement over successive bounded windows of a numeric property (made by `inRanges`). */
export interface RangeStep {
  kind: "ranges";
  label: string;
  property: string;
  /** Width of one window; a positive integer. */
  step: number;
  /** Cypher using `$from` (inclusive) and `$to` (exclusive) and a filter that makes running it again harmless. */
  statement: string;
}

/** One statement of a migration: Cypher text, or a range step. */
export type MigrationStep = string | RangeStep;

export interface ApplicationOptions {
  /** `[A-Za-z0-9_-]{1,60}`; the store is `app-<name>`. */
  name: string;
  /** The schema version this code expects; a positive integer. */
  version: number;
  /** A graph data document or descriptor, as data or as a URL; loaded once, on first run. */
  seed: GraphDocument | Descriptor | string;
  /** Indexes to create on first run when the seed is a plain document. */
  indexes?: IndexSpec[];
  /** Target version to the ordered steps that take stored data to it. */
  migrations?: Record<number, MigrationStep[]>;
  onUnavailable?: "memory" | "fail";
  onError?: "fail" | "memory";
  whenLocked?: "wait" | "memory";
}

export interface StorageStatus {
  kind: "durable" | "memory" | "waiting";
  reason?: "unavailable" | "locked" | "error";
  /** The browser's answer to `navigator.storage.persisted()`, or null when it cannot be asked. */
  persisted: boolean | null;
}

export type LossKind =
  | "integer-beyond-2^53"
  | "whole-number-float"
  | "date"
  | "duration"
  | "point"
  | "empty-list"
  | "node-without-string-id";

export type LossReport = Array<{ kind: LossKind; count: number; droppedLinks?: number }>;

export interface ExportEnvelope {
  format: "relate-application-export";
  version: 1;
  application: { name: string; version: number };
  document: GraphDocument;
}
