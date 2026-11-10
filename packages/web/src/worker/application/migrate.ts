// Runs the migrations that take stored data from one schema version to the code's (ADR-010 2.2, ADR-009 2.3). Statements
// run with no visitor timeout: they are the application's own, written to be bounded and safe to run again. Each
// version writes `migrating` before its steps and `ready` at that version after them, so an interrupted run resumes.
import type { Catalog } from "../../catalog/catalog.js";
import type { MigrationStep, RangeStep } from "../../application/types.js";
import type { Engine } from "../engine.js";
import { run } from "../loader.js";

/** A migration statement failed; the entry is at the last completed version. */
export class MigrationError extends Error {
  readonly version: number;
  readonly statement: string;
  constructor(version: number, statement: string, cause: string) {
    super(`migration to version ${version} failed: ${cause} (statement: ${statement})`);
    this.name = "MigrationError";
    this.version = version;
    this.statement = statement;
  }
}

const quote = (name: string): string => `\`${name.replace(/`/g, "``")}\``;

function runRange(engine: Engine, step: RangeStep): void {
  const bounds = run(engine, `MATCH (n:${quote(step.label)}) RETURN min(n.${quote(step.property)}) AS lo, max(n.${quote(step.property)}) AS hi`).rows[0];
  const lo = bounds?.lo;
  const hi = bounds?.hi;
  if (typeof lo !== "number" || typeof hi !== "number") return; // no node has the property: nothing to do
  for (let from = Math.floor(lo); from <= hi; from += step.step) run(engine, step.statement, { from, to: from + step.step });
}

function runStep(engine: Engine, version: number, step: MigrationStep): void {
  const text = typeof step === "string" ? step : step.statement;
  try {
    if (typeof step === "string") run(engine, step);
    else runRange(engine, step);
  } catch (e) {
    throw new MigrationError(version, text, e instanceof Error ? e.message : String(e));
  }
}

export interface MigrationTarget {
  catalog: Catalog;
  store: string;
  name: string;
}

/** For each version from `from + 1` to `to`: `migrating`, its steps in order, then `ready` at that version. */
export async function migrate(engine: Engine, target: MigrationTarget, from: number, to: number, migrations: Record<string, MigrationStep[]>): Promise<void> {
  for (let version = from + 1; version <= to; version++) {
    const steps = migrations[String(version)];
    // Advancing the version without running anything would record data as migrated that never was.
    if (!steps) throw new MigrationError(version, "", "the application gives no migration for this version, so the store cannot be carried forward");
    const base = (current: { seeded: boolean } | undefined) => ({ kind: "application" as const, name: target.name, seeded: current?.seeded ?? true });
    await target.catalog.update(target.store, (current) => ({
      ...base(current as { seeded: boolean } | undefined),
      state: "migrating",
      version: version - 1,
      target: version,
    }));
    for (const step of steps) runStep(engine, version, step);
    await target.catalog.update(target.store, (current) => ({ ...base(current as { seeded: boolean } | undefined), state: "ready", version }));
  }
}
