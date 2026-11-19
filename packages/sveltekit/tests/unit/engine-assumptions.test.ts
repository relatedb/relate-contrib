// covers-rel: FR-023
// This adapter reaches the engine only through the core (ADR-013 2.5), so it relies on the behaviours the core's own
// engine-assumptions file pins: the result envelope's shape and an engine error arriving in the result. This file checks that the
// core's file exists and still names them, so that an engine change that breaks them fails there, with a title that says which.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const core = join(import.meta.dirname, "../../../web/tests/unit/engine-assumptions.test.ts");

describe("the engine behaviours this adapter relies on, through the core", () => {
  it("relies on the core's engine-assumptions file, which exists", () => {
    expect(() => readFileSync(core, "utf8")).not.toThrow();
  });

  it("relies on the result envelope's shape, which the core's file pins", () => {
    expect(readFileSync(core, "utf8")).toContain("returns a result envelope with columns, rows as objects, stats and an error that is null on success");
  });

  it("relies on an engine error arriving in the result and not throwing, which the core's file pins", () => {
    expect(readFileSync(core, "utf8")).toContain("delivers an engine error in the envelope's error and does not throw");
  });
});
