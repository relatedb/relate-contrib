import { describe, expect, it } from "vitest";
import { Bridge, type Envelope, type QueryFn } from "../src/game/bridge.js";

const ok = (rows: Record<string, unknown>[] = []): Envelope => ({ error: null, rows });

describe("bridge", () => {
  it("answers statements in the order they were queued, one at a time", async () => {
    const log: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const query: QueryFn = async (s) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // the first statement is the slowest; order must still hold
      await new Promise((r) => setTimeout(r, s === "a" ? 20 : 1));
      log.push(s);
      inFlight--;
      return ok([{ s }]);
    };
    const bridge = new Bridge(query);
    const results = await Promise.all(["a", "b", "c"].map((s) => bridge.enqueue(s)));
    expect(log).toEqual(["a", "b", "c"]);
    expect(results.map((r) => r[0]!["s"])).toEqual(["a", "b", "c"]);
    expect(maxInFlight).toBe(1);
  });

  it("returns at once to the caller, which only awaits if it chooses to", () => {
    const bridge = new Bridge(() => new Promise<Envelope>(() => {})); // never answers
    const t0 = performance.now();
    void bridge.enqueue("x");
    expect(performance.now() - t0).toBeLessThan(5);
    expect(bridge.pending).toBe(1);
  });

  it("rejects the one statement that failed and carries on with the rest", async () => {
    const query: QueryFn = async (s) => (s === "bad" ? { error: "syntax error", rows: [] } : ok([{ s }]));
    const bridge = new Bridge(query);
    const [a, b, c] = [bridge.enqueue("one"), bridge.enqueue("bad"), bridge.enqueue("three")];
    await expect(b).rejects.toThrow("syntax error");
    expect((await a)[0]!["s"]).toBe("one");
    expect((await c)[0]!["s"]).toBe("three");
    await bridge.idle();
    expect(bridge.pending).toBe(0);
  });

  it("rejects when the client itself throws, and keeps pumping", async () => {
    let calls = 0;
    const query: QueryFn = async () => {
      calls++;
      if (calls === 1) throw new Error("worker gone");
      return ok([{ calls }]);
    };
    const bridge = new Bridge(query);
    const first = bridge.enqueue("a");
    const second = bridge.enqueue("b");
    await expect(first).rejects.toThrow("worker gone");
    expect((await second)[0]!["calls"]).toBe(2);
  });
});
