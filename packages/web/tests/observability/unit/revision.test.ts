// covers-obs: FR-006, FR-007, FR-008, SC-002
import { afterEach, describe, expect, it } from "vitest";
import type { Client } from "../../../src/client/types.js";
import { client, crash, ready_, settle } from "./harness.js";

let c: Client | null = null;
afterEach(() => {
  c?.destroy();
  c = null;
});

/** The revision of a freshly loaded client: the document's node batch and link batch both wrote. */
const AFTER_LOAD = 2;

describe("the revision", () => {
  it("counts what the client wrote while loading, so a new instance starts above 0 only by that", async () => {
    c = await ready_(await client());
    expect(c.revision).toBe(AFTER_LOAD);
  });

  it("rises by one for each statement that wrote, and not for a read or a failed statement", async () => {
    c = await ready_(await client());
    const events: Array<{ revision: number; generation: number }> = [];
    c.on("revision", (e) => events.push(e));
    await c.query("CREATE (:T {x: 1})");
    expect(c.revision).toBe(AFTER_LOAD + 1);
    await c.query("MATCH (n) RETURN count(n) AS n");
    await c.query("MATCH (n RETURN");
    expect(c.revision).toBe(AFTER_LOAD + 1);
    await c.run("CREATE (:T {x: 2})").result;
    expect(c.revision).toBe(AFTER_LOAD + 2);
    expect(events).toEqual([
      { revision: AFTER_LOAD + 1, generation: 1 },
      { revision: AFTER_LOAD + 2, generation: 1 },
    ]);
  });

  it("is one step for a statement that makes many changes", async () => {
    c = await ready_(await client());
    await c.query("UNWIND range(1, 50) AS i CREATE (:Many {i: i})");
    expect(c.revision).toBe(AFTER_LOAD + 1);
  });

  it("counts the worker's own writes after loading, one event for each job", async () => {
    c = await ready_(await client());
    const events: number[] = [];
    c.on("revision", (e) => events.push(e.revision));
    await c.addScoped({ version: 1, nodes: [{ id: "s1", properties: {} }, { id: "s2", properties: {} }], links: [] }, "p");
    expect(events).toEqual([AFTER_LOAD + 1]);
    await c.dropScope("p");
    expect(events).toEqual([AFTER_LOAD + 1, AFTER_LOAD + 2]);
  });

  it("delivers one event after ready for what loading wrote, with the new generation", async () => {
    const events: Array<{ revision: number; generation: number }> = [];
    c = await ready_(await client({}, (made) => made.on("revision", (e) => events.push(e))));
    expect(events).toEqual([{ revision: AFTER_LOAD, generation: 1 }]);
  });

  it("restarts with each new instance", async () => {
    c = await ready_(await client());
    await c.query("CREATE (:T)");
    expect(c.revision).toBe(AFTER_LOAD + 1);
    crash(); // the worker fails and the client replaces the instance
    for (let i = 0; i < 200 && (c.generation < 2 || c.status !== "ready"); i++) await settle();
    expect(c.generation).toBe(2);
    expect(c.revision).toBe(AFTER_LOAD);
  });

  it("does not make a subscription run again", async () => {
    c = await ready_(await client());
    const updates: unknown[] = [];
    const off = c.subscribe("MATCH (n) RETURN count(n) AS n", null, (u) => updates.push(u));
    await settle();
    const seen = updates.length;
    await c.query("CREATE (:T)");
    await settle();
    expect(updates).toHaveLength(seen);
    off();
  });

  it("still rises with no listener for the event", async () => {
    c = await ready_(await client());
    await c.query("CREATE (:T)");
    expect(c.revision).toBe(AFTER_LOAD + 1);
  });
});
