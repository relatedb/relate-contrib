// The lifecycle of an application store (ADR-009 2.2): classify what was opened, then seed, recover, migrate or stop.
// Everything here runs against an `Engine`, so it is tested in Node with the real engine in memory.
import type { MigrationStep } from "../../application/types.js";
import { MARKER_LABEL, MARKER_FORMAT } from "../../config.js";
import type { Descriptor, IndexSpec } from "../../data/types.js";
import type { Engine } from "../engine.js";
import { LoadError, loadGraph, prepare, run } from "../loader.js";
import { classify, type FailureReason } from "./classify.js";
import { createMarker, readMarkers, setState } from "./marker.js";
import { migrate, MigrationError } from "./migrate.js";

export interface LifecycleInput {
  version: number;
  intent: "open" | "reset";
  /** The seed's data document, already fetched. */
  seed: unknown;
  descriptor: Descriptor | null;
  indexes: IndexSpec[];
  migrations: Record<string, MigrationStep[]>;
}

export type LifecycleResult =
  | { ok: true; restored: boolean }
  | { ok: false; reason: FailureReason | "migration-failed" | "invalid-document" | "mismatch"; message: string };

const count = (engine: Engine, statement: string): number => {
  const v = Object.values(run(engine, statement).rows[0] ?? {})[0];
  return typeof v === "number" ? v : 0;
};

/** A seed may not contain the marker's label (ADR-009 2.2). Checked before any statement runs. */
function rejectMarkerLabel(seed: unknown): void {
  const nodes = (seed as { nodes?: Array<{ labels?: unknown }> } | null)?.nodes;
  if (!Array.isArray(nodes)) return;
  for (const [i, node] of nodes.entries()) {
    if (Array.isArray(node?.labels) && node.labels.includes(MARKER_LABEL)) {
      throw new LoadError("invalid-document", `nodes[${i}].labels`, `the label ${MARKER_LABEL} is reserved for the application's marker`);
    }
  }
}

/** First run: marker `seeding`, the seed, the indexes, then `ready` as the last statement. */
function firstRun(engine: Engine, input: LifecycleInput): void {
  rejectMarkerLabel(input.seed);
  createMarker(engine, input.version, "seeding");
  const document = prepare(input.seed, { descriptor: input.descriptor });
  loadGraph(engine, document, { descriptor: input.descriptor, indexes: input.indexes });
  setState(engine, "ready");
}

export function openApplication(engine: Engine, input: LifecycleInput): LifecycleResult {
  try {
    if (input.intent === "reset") {
      engine.reset();
      firstRun(engine, input);
      return { ok: true, restored: false };
    }
    const action = classify(
      {
        markers: readMarkers(engine),
        nodeCount: count(engine, "MATCH (n) RETURN count(n) AS c"),
        indexCount: run(engine, "SHOW INDEXES").rows.length,
      },
      { version: input.version, format: MARKER_FORMAT },
    );
    switch (action.action) {
      case "fail":
        return { ok: false, reason: action.reason, message: action.message };
      case "open":
        return { ok: true, restored: true };
      case "migrate":
        migrate(engine, action.from, input.version, input.migrations);
        return { ok: true, restored: true };
      case "reset-and-seed":
        engine.reset();
        firstRun(engine, input);
        return { ok: true, restored: false };
      case "first-run":
        firstRun(engine, input);
        return { ok: true, restored: false };
    }
  } catch (e) {
    if (e instanceof MigrationError) return { ok: false, reason: "migration-failed", message: e.message };
    if (e instanceof LoadError) return { ok: false, reason: e.reason, message: e.message };
    throw e;
  }
}
