// `inRanges`: a migration step that runs one statement over successive bounded windows of a numeric property
// (ADR-009 2.3, specs/006 research D-2). The result is plain data, so it crosses postMessage with the rest of
// the options.
import type { RangeStep } from "./types.js";

export function inRanges(step: { label: string; property: string; step: number; statement: string }): RangeStep {
  const { label, property, statement } = step;
  if (typeof label !== "string" || label === "") throw new Error("inRanges: label must be a non-empty string");
  if (typeof property !== "string" || property === "") throw new Error("inRanges: property must be a non-empty string");
  if (!Number.isInteger(step.step) || step.step < 1) throw new Error("inRanges: step must be a positive integer");
  if (typeof statement !== "string" || !statement.includes("$from") || !statement.includes("$to")) {
    throw new Error("inRanges: the statement must use the parameters $from (inclusive) and $to (exclusive)");
  }
  return { kind: "ranges", label, property, step: step.step, statement };
}
