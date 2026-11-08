// covers: FR-004, FR-005
import { describe, expect, it } from "vitest";
import { Registry, type Update } from "../../src/client/subscriptions.js";
import type { Envelope } from "../../src/data/types.js";

const envelope = (rows: Array<Record<string, unknown>>): Envelope => ({ columns: [], rows, error: null });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("subscriptions", () => {
  it("shows the current status at once when the instance is not ready, then the rows when it is", async () => {
    const r = new Registry();
    const updates: Update[] = [];
    r.subscribe("Q", null, (u) => updates.push(u), { status: "loading", generation: 0 }, async () => envelope([]));
    expect(updates).toEqual([{ status: "loading", generation: 0, rows: null, error: null }]);
    await r.ready(1, async () => envelope([{ n: 1 }]));
    expect(updates[1]).toEqual({ status: "ready", generation: 1, rows: [{ n: 1 }], error: null });
  });

  it("runs a new subscription straight away when the instance is ready", async () => {
    const r = new Registry();
    const updates: Update[] = [];
    r.subscribe("Q", { a: 1 }, (u) => updates.push(u), { status: "ready", generation: 3 }, async (s, p) => envelope([{ s, p }]));
    await tick();
    expect(updates).toEqual([{ status: "ready", generation: 3, rows: [{ s: "Q", p: { a: 1 } }], error: null }]);
  });

  it("re-runs every subscription after a replacement", async () => {
    const r = new Registry();
    const a: Update[] = [];
    const b: Update[] = [];
    r.subscribe("A", null, (u) => a.push(u), { status: "loading", generation: 0 }, async () => envelope([]));
    r.subscribe("B", null, (u) => b.push(u), { status: "loading", generation: 0 }, async () => envelope([]));
    await r.ready(1, async (s) => envelope([{ s }]));
    await r.ready(2, async (s) => envelope([{ s }]));
    expect(a.map((u) => u.generation)).toEqual([0, 1, 2]);
    expect(b.at(-1)).toEqual({ status: "ready", generation: 2, rows: [{ s: "B" }], error: null });
  });

  it("drops a result that arrives after unsubscribe", async () => {
    const r = new Registry();
    const updates: Update[] = [];
    let release!: (e: Envelope) => void;
    const slow = new Promise<Envelope>((res) => (release = res));
    const off = r.subscribe("Q", null, (u) => updates.push(u), { status: "ready", generation: 1 }, () => slow);
    off();
    release(envelope([{ late: true }]));
    await tick();
    expect(updates).toEqual([]);
  });

  it("drops a result that arrives after a newer generation has begun", async () => {
    const r = new Registry();
    const updates: Update[] = [];
    let release!: (e: Envelope) => void;
    const slow = new Promise<Envelope>((res) => (release = res));
    r.subscribe("Q", null, (u) => updates.push(u), { status: "ready", generation: 1 }, () => slow);
    const second = r.ready(2, async () => envelope([{ g: 2 }]));
    release(envelope([{ g: 1 }]));
    await second;
    expect(updates.map((u) => u.rows)).toEqual([[{ g: 2 }]]);
  });

  it("reports an engine error in the envelope as the update's error, with no rows", async () => {
    const r = new Registry();
    const updates: Update[] = [];
    r.subscribe("Q", null, (u) => updates.push(u), { status: "ready", generation: 1 }, async () => ({ columns: [], rows: [], error: "syntax error" }));
    await tick();
    expect(updates).toEqual([{ status: "ready", generation: 1, rows: null, error: "syntax error" }]);
  });

  it("tells subscribers about a status that is not ready, with the rows cleared", () => {
    const r = new Registry();
    const updates: Update[] = [];
    r.subscribe("Q", null, (u) => updates.push(u), { status: "ready", generation: 1 }, async () => envelope([{ n: 1 }]));
    r.notify("recovering", 1);
    expect(updates.at(-1)).toEqual({ status: "recovering", generation: 1, rows: null, error: null });
  });
});

describe("generation listeners", () => {
  it("run in order, and finish before subscriptions re-run", async () => {
    const r = new Registry();
    const order: string[] = [];
    r.subscribe("Q", null, () => order.push("subscription"), { status: "loading", generation: 0 }, async () => envelope([]));
    order.length = 0; // ignore the placeholder update
    r.onGeneration(async (g) => {
      await tick();
      order.push(`first:${g}`);
    });
    r.onGeneration((g) => {
      order.push(`second:${g}`);
    });
    await r.ready(1, async () => envelope([]));
    expect(order).toEqual(["first:1", "second:1", "subscription"]);
  });

  it("can be removed", async () => {
    const r = new Registry();
    const seen: number[] = [];
    const off = r.onGeneration((g) => void seen.push(g));
    await r.ready(1, async () => envelope([]));
    off();
    await r.ready(2, async () => envelope([]));
    expect(seen).toEqual([1]);
  });

  it("does not stop the others when one listener throws", async () => {
    const r = new Registry();
    const seen: string[] = [];
    r.onGeneration(() => {
      throw new Error("boom");
    });
    r.onGeneration(() => void seen.push("second"));
    await r.ready(1, async () => envelope([]));
    expect(seen).toEqual(["second"]);
  });
});
