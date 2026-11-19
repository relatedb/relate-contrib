// covers-rel: FR-023, FR-024
// The engine behaviour the statement queue depends on (ADR-013 2.5), against the real engine in Node: the result envelope's shape. The
// queue turns an envelope's `error` into a StatementError and resolves with its `rows`, so these are the two things it reads. Anything
// beyond that is the core's (see packages/web/tests/unit/engine-assumptions.test.ts).
import { describe, expect, it } from "vitest";
import { Bridge, StatementError } from "../../src/index.js";
import { openEngine } from "../helpers/engine.js";

describe("the engine behaviours the statement queue relies on", () => {
  it("returns rows as objects keyed by column, which the queue resolves with", async () => {
    const bridge = new Bridge((await openEngine()).query);
    expect(await bridge.enqueue("RETURN 1 AS x, 'a' AS y")).toEqual([{ x: 1, y: "a" }]);
  });

  it("delivers an engine error in the envelope's error, which the queue turns into a StatementError", async () => {
    const engine = await openEngine();
    const envelope = await engine.query("THIS IS NOT CYPHER");
    expect(envelope.error).toMatch(/syntax error/i);
    await expect(new Bridge(engine.query).enqueue("THIS IS NOT CYPHER")).rejects.toBeInstanceOf(StatementError);
  });

  it("binds parameters passed as an object, which the queue's callers rely on", async () => {
    const bridge = new Bridge((await openEngine()).query);
    expect(await bridge.enqueue("RETURN $n AS n", { n: 5 })).toEqual([{ n: 5 }]);
  });
});
