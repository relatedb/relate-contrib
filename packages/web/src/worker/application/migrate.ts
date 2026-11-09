// Runs the migrations that take stored data from one schema version to the code's (ADR-009 2.3). Statements run with
// no visitor timeout: they are the application's own, written to be bounded and safe to run again.
import type { MigrationStep, RangeStep } from "../../application/types.js";
import type { Engine } from "../engine.js";
import { run } from "../loader.js";
import { setVersion } from "./marker.js";

/** A migration statement failed; the store is at the last completed version. */
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

/** For each version from `from + 1` to `to`: its steps in order, then the marker's version as the last statement. */
export function migrate(engine: Engine, from: number, to: number, migrations: Record<string, MigrationStep[]>): void {
  for (let version = from + 1; version <= to; version++) {
    for (const step of migrations[String(version)] ?? []) runStep(engine, version, step);
    setVersion(engine, version);
  }
}
