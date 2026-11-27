// covers-obs: FR-001, FR-002, FR-004, FR-005, SC-001, SC-004
import { afterEach, describe, expect, it, vi } from "vitest";
import * as statements from "../../../src/client/statements.js";
import type { StatementEvent } from "../../../src/client/statements.js";
import type { Client } from "../../../src/client/types.js";
import { client, ready_, settle } from "./harness.js";

let c: Client | null = null;
afterEach(() => {
  c?.destroy();
  c = null;
  vi.restoreAllMocks();
});

async function ready(): Promise<{ c: Client; events: StatementEvent[] }> {
  c = await ready_(await client());
  const events: StatementEvent[] = [];
  c.on("statement", (e) => events.push(e));
  return { c, events };
}

describe("the statement event", () => {
  it("reports a read as one event with the engine's time and counters", async () => {
    const { c, events } = await ready();
    await c.query("MATCH (n:Person) RETURN count(n) AS n");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ statement: "MATCH (n:Person) RETURN count(n) AS n", origin: "query", write: false, error: null });
    expect(typeof events[0]!.ms).toBe("number");
    expect(events[0]!.stats).toMatchObject({ nodes_created: 0 });
  });

  it("reports a statement that changed something as a write, by its counters", async () => {
    const { c, events } = await ready();
    await c.query("CREATE (:T {x: 1})");
    expect(events[0]).toMatchObject({ write: true, origin: "query" });
    expect(events[0]!.stats).toMatchObject({ nodes_created: 1, properties_set: 1 });
  });

  it("reports an engine error with the error and no write", async () => {
    const { c, events } = await ready();
    const reply = await c.query("MATCH (n RETURN");
    expect(reply.error).not.toBeNull();
    expect(events[0]).toMatchObject({ error: reply.error, write: false, ms: null });
  });

  it("gives each way a statement can run its own origin", async () => {
    const { c, events } = await ready();
    await c.query("RETURN 1 AS a");
    await c.run("RETURN 2 AS b").result;
    const updates: unknown[] = [];
    const off = c.subscribe("RETURN 3 AS c", null, (u) => updates.push(u));
    await settle();
    await settle();
    off();
    expect(events.map((e) => [e.statement, e.origin])).toEqual([
      ["RETURN 1 AS a", "query"],
      ["RETURN 2 AS b", "run"],
      ["RETURN 3 AS c", "subscription"],
    ]);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("leaves parameters out unless a listener opts in, and gives them only to that listener", async () => {
    const { c, events } = await ready();
    const withParams: StatementEvent[] = [];
    c.on("statement", (e) => withParams.push(e), { params: true });
    await c.query("RETURN $x AS x", { x: 7 });
    await c.query("RETURN 1 AS one");
    expect("params" in events[0]!).toBe(false);
    expect(withParams[0]!.params).toBe('{"x":7}');
    expect(withParams[1]!.params).toBeNull();
  });

  it("cuts parameters larger than 4 KiB and marks the cut", async () => {
    const { c } = await ready();
    const got: StatementEvent[] = [];
    c.on("statement", (e) => got.push(e), { params: true });
    await c.query("RETURN $t AS t", { t: "x".repeat(10_000) });
    expect(got[0]!.params).toHaveLength(4096);
    expect(got[0]!.paramsTruncated).toBe(true);
  });

  it("builds nothing when no listener exists", async () => {
    c = await ready_(await client());
    const record = vi.spyOn(statements, "recordOf");
    const fields = vi.spyOn(statements, "paramFields");
    await c.query("CREATE (:T)");
    await c.query("RETURN $x AS x", { x: 1 });
    expect(record).not.toHaveBeenCalled();
    expect(fields).not.toHaveBeenCalled();
    // the same spies see the work once someone listens, so the absence above is not a blind spot
    c.on("statement", () => {}, { params: true });
    await c.query("RETURN $x AS x", { x: 1 });
    expect(record).toHaveBeenCalledTimes(1);
    expect(fields).toHaveBeenCalledTimes(1);
  });

  it("is not disturbed by a listener that throws", async () => {
    const { c, events } = await ready();
    c.on("statement", () => {
      throw new Error("a listener's bug");
    });
    const reply = await c.query("RETURN 1 AS a");
    expect(reply.rows).toEqual([{ a: 1 }]);
    expect(events).toHaveLength(1);
  });

  it("stops delivering after the listener is removed", async () => {
    c = await ready_(await client());
    const events: StatementEvent[] = [];
    const off = c.on("statement", (e) => events.push(e));
    await c.query("RETURN 1 AS a");
    off();
    await c.query("RETURN 2 AS b");
    expect(events).toHaveLength(1);
  });
});
