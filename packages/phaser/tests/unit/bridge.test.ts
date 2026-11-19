// covers-ph: FR-003, FR-004, FR-005, FR-006, SC-001
import { GraphError } from "@relate/contrib-web";
import { describe, expect, it } from "vitest";
import { Bridge, StatementError, type Envelope } from "../../src/index.js";
import { openEngine } from "../helpers/engine.js";
import { FakeClient } from "../helpers/fake-client.js";

const ok = (rows: Record<string, unknown>[] = []): Envelope => ({ error: null, rows });

describe("the statement queue", () => {
  it("applies statements in the order enqueued, one at a time", async () => {
    const order: string[] = [];
    let running = 0;
    let overlap = 0;
    const bridge = new Bridge(async (s) => {
      running++;
      overlap = Math.max(overlap, running);
      await new Promise((r) => setTimeout(r, 2));
      order.push(s);
      running--;
      return ok([{ s }]);
    });
    const results = await Promise.all(["a", "b", "c"].map((s) => bridge.enqueue(s)));
    expect(order).toEqual(["a", "b", "c"]);
    expect(overlap).toBe(1);
    expect(results.map((r) => r[0]!["s"])).toEqual(["a", "b", "c"]);
  });

  it("leaves the engine's state in the order pushed for 1,000 statements pushed without awaiting (SC-001)", async () => {
    const engine = await openEngine();
    const bridge = Bridge.forClient({ query: engine.query as never });
    await bridge.enqueue("CREATE (:Counter {n: 0})");
    const pushes: Promise<unknown>[] = [];
    for (let i = 1; i <= 1000; i++) pushes.push(bridge.enqueue("MATCH (c:Counter) SET c.n = $n", { n: i }));
    await Promise.all(pushes);
    const rows = await bridge.enqueue("MATCH (c:Counter) RETURN c.n AS n");
    expect(rows).toEqual([{ n: 1000 }]);
  });

  it("rejects with StatementError carrying the engine's message, and the next statement still runs", async () => {
    const engine = await openEngine();
    const bridge = new Bridge(engine.query);
    const [a, b, c] = [bridge.enqueue("RETURN 1 AS x"), bridge.enqueue("THIS IS NOT CYPHER"), bridge.enqueue("RETURN 3 AS x")];
    expect(await a).toEqual([{ x: 1 }]);
    const err = await b.then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(StatementError);
    expect((err as Error).message.length).toBeGreaterThan(0);
    expect(await c).toEqual([{ x: 3 }]);
  });

  it.each(["lost", "timeout", "failed"] as const)("passes the client's GraphError (%s) through unchanged", async (reason) => {
    const client = new FakeClient(() => ok());
    client.rejectNext = new GraphError(reason, "x");
    const bridge = Bridge.forClient(client as never);
    const err = await bridge.enqueue("RETURN 1").then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(GraphError);
    expect((err as GraphError).reason).toBe(reason);
  });

  it("builds from a client as it does from the equivalent query function, and does not retry", async () => {
    const client = new FakeClient(() => ok([{ v: 1 }]));
    expect(await Bridge.forClient(client as never).enqueue("RETURN 1")).toEqual([{ v: 1 }]);
    client.rejectNext = new Error("boom");
    await expect(Bridge.forClient(client as never).enqueue("RETURN 2")).rejects.toThrow("boom");
    expect(client.calls).toEqual(["RETURN 1", "RETURN 2"]); // one attempt each, no retry
  });

  it("counts statements queued or in flight, resolves idle() when empty, and calls onSettle once when the queue empties", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => (release = r));
    const bridge = new Bridge(async () => {
      await gate;
      return ok();
    });
    let settled = 0;
    const off = bridge.onSettle(() => settled++);
    void bridge.enqueue("a");
    void bridge.enqueue("b");
    expect(bridge.pending).toBe(2);
    const idle = bridge.idle();
    release!();
    await idle;
    expect(bridge.pending).toBe(0);
    expect(settled).toBe(1);
    off();
    await bridge.enqueue("c");
    expect(settled).toBe(1); // an unsubscribed listener is not called
  });

  it("does not let a throwing settle listener stop the queue or the other listeners", async () => {
    const bridge = new Bridge(async () => ok());
    let other = 0;
    bridge.onSettle(() => {
      throw new Error("listener");
    });
    bridge.onSettle(() => other++);
    await bridge.enqueue("a");
    await bridge.idle();
    await bridge.enqueue("b");
    expect(other).toBeGreaterThanOrEqual(2);
  });

  it("starts a statement queued while another is in flight only after the first resolves", async () => {
    const log: string[] = [];
    const bridge = new Bridge(async (s) => {
      log.push(`start ${s}`);
      await new Promise((r) => setTimeout(r, 5));
      log.push(`end ${s}`);
      return ok();
    });
    const first = bridge.enqueue("a");
    const second = bridge.enqueue("b");
    await Promise.all([first, second]);
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });
});
