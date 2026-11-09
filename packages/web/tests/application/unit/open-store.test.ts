// covers-app: FR-015, FR-016, FR-018
import { describe, expect, it } from "vitest";
import { Engine, StorageLockedError } from "../../../src/worker/engine.js";
import { openApplicationStore, type StorageReport } from "../../../src/worker/application/open-store.js";
import { realEngine } from "./helpers.js";

const base = { name: "n", onUnavailable: "memory", onError: "fail", whenLocked: "wait" } as const;

function setup(opens: Array<"locked" | Error | Engine>, over: Partial<typeof base> = {}) {
  const slept: number[] = [];
  const reports: StorageReport[] = [];
  let calls = 0;
  const hooks = {
    report: (r: StorageReport) => reports.push(r),
    hasStorage: async () => true,
    sleep: async (ms: number) => void slept.push(ms),
    open: async () => {
      const next = opens[Math.min(calls++, opens.length - 1)]!;
      if (next === "locked") throw new StorageLockedError("storage locked: opfs://app-n");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { slept, reports, calls: () => calls, run: () => openApplicationStore({ ...base, ...over }, hooks), hooks };
}

describe("a locked store", () => {
  it("is retried on the bounded schedule, then every second, reporting waiting once, then opens", async () => {
    const e = await realEngine();
    const s = setup([...Array(30).fill("locked"), e]);
    const out = await s.run();
    expect(out).toMatchObject({ storage: { kind: "durable" } });
    expect(s.slept.slice(0, 4)).toEqual([100, 200, 400, 500]);
    expect(s.slept.reduce((a, b) => a + b, 0)).toBeGreaterThan(5000);
    expect(s.slept.slice(-5).every((ms) => ms === 1000)).toBe(true);
    expect(s.reports).toEqual([{ kind: "waiting", reason: "locked" }]);
  });

  it("with whenLocked memory runs in memory with reason locked and never opens the store again", async () => {
    const s = setup(["locked"], { whenLocked: "memory" });
    const out = await s.run();
    expect(out).toMatchObject({ storage: { kind: "memory", reason: "locked" } });
    const callsAtEnd = s.calls();
    expect(callsAtEnd).toBe(s.slept.length + 1);
    expect(s.reports).toEqual([]);
  });
});

describe("a browser with no store", () => {
  it("runs in memory with reason unavailable, or fails with onUnavailable fail", async () => {
    const s = setup(["locked"]);
    s.hooks.hasStorage = async () => false;
    expect(await openApplicationStore(base, s.hooks)).toMatchObject({ storage: { kind: "memory", reason: "unavailable" } });
    expect(s.calls()).toBe(0);
    expect(await openApplicationStore({ ...base, onUnavailable: "fail" }, s.hooks)).toMatchObject({ fail: "unavailable" });
  });
});

describe("an open error", () => {
  it("fails store-unreadable with the engine's message by default", async () => {
    const out = await setup([new Error("corrupt checkpoint")]).run();
    expect(out).toEqual({ fail: "store-unreadable", message: "corrupt checkpoint" });
  });
  it("runs in memory with reason error with onError memory", async () => {
    const out = await setup([new Error("corrupt checkpoint")], { onError: "memory" }).run();
    expect(out).toMatchObject({ storage: { kind: "memory", reason: "error" } });
  });
});
