// What a page can observe about the statements a client runs (ADR-001 amendment 2026-11-27; specs/011-client-observability).
// One definition of a write, one shape for the event, shared by the page and the worker.
import type { Envelope } from "../data/types.js";

/** Why a statement ran. `internal` is the client's own load, seed, migration, import and scoped add or drop. */
export type Origin = "query" | "run" | "subscription" | "internal";

export interface StatementRecord {
  statement: string;
  /** The time the engine reports for it, or null when its reply has none. */
  ms: number | null;
  error: string | null;
  stats: Record<string, number>;
  write: boolean;
}

export interface StatementEvent extends StatementRecord {
  origin: Origin;
  /** Only for a listener that opted in with `{ params: true }`: the parameters as the JSON text sent to the engine. */
  params?: string | null;
  /** True when `params` was cut at {@link PARAMS_CAP}. */
  paramsTruncated?: boolean;
}

/** The parameters in an event are cut at this many UTF-16 units. */
export const PARAMS_CAP = 4096;

/** A statement wrote exactly when any counter in the engine's stats is a non-zero number (never read from the Cypher text). */
export function isWrite(stats: unknown): boolean {
  if (stats === null || typeof stats !== "object") return false;
  for (const value of Object.values(stats as Record<string, unknown>)) {
    if (typeof value === "number" && value !== 0) return true;
  }
  return false;
}

/** The record of a statement from the engine's reply. */
export function recordOf(statement: string, envelope: Envelope): StatementRecord {
  const stats = envelope.stats !== null && typeof envelope.stats === "object" ? (envelope.stats as Record<string, number>) : {};
  const ms = typeof envelope.elapsed_ms === "number" ? envelope.elapsed_ms : null;
  return { statement, ms, error: envelope.error ?? null, stats, write: isWrite(stats) };
}

/** The parameter fields for a listener that asked for them. */
export function paramFields(paramsJson: string | null): Pick<StatementEvent, "params" | "paramsTruncated"> {
  if (paramsJson === null) return { params: null };
  if (paramsJson.length <= PARAMS_CAP) return { params: paramsJson };
  return { params: paramsJson.slice(0, PARAMS_CAP), paramsTruncated: true };
}
