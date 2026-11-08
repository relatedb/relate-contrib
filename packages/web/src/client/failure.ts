// Counts the consecutive attempts that fail to reach `ready` (data-model.md). An attempt is one start of an
// instance, the initial load included. A fault from `ready` is not itself an attempt: the replacements that
// follow it are. Reaching `ready` resets the count.
import { FAILURE_LIMIT } from "../config.js";

export type Decision = "retry" | "give-up";

export class FailureCounter {
  private count = 0;

  constructor(private readonly limit: number = FAILURE_LIMIT) {}

  get failures(): number {
    return this.count;
  }

  /** An attempt ended without reaching `ready`. No worker support gives up at once, counting nothing. */
  attemptFailed(reason: string): Decision {
    if (reason === "unsupported") return "give-up";
    this.count++;
    return this.count >= this.limit ? "give-up" : "retry";
  }

  ready(): void {
    this.count = 0;
  }

  reset(): void {
    this.count = 0;
  }
}
