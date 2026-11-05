// covers: FR-012
import { describe, expect, it } from "vitest";
import { STORE_RETRY } from "../../src/config.js";
import { openStore, retryWaits } from "../../src/worker/store.js";
import { Engine, StorageLockedError } from "../../src/worker/engine.js";

describe("the retry schedule for a locked store", () => {
  const waits = [...retryWaits()];

  it("starts at 100 ms and backs off to 500 ms", () => {
    expect(waits.slice(0, 4)).toEqual([100, 200, 400, 500]);
    expect(Math.max(...waits)).toBe(500);
  });

  it("gives up after 5000 ms in total, spending exactly that budget", () => {
    expect(waits.reduce((a, b) => a + b, 0)).toBe(STORE_RETRY.totalMs);
    expect(STORE_RETRY.totalMs).toBe(5000);
  });

  it("never waits less than the previous wait until the last one", () => {
    for (let i = 1; i < waits.length - 1; i++) expect(waits[i]!).toBeGreaterThanOrEqual(waits[i - 1]!);
  });
});

describe("opening a store", () => {
  const original = Engine.store;
  const stub = (impl: (id: string) => Promise<Engine>) => {
    (Engine as unknown as { store: typeof impl }).store = impl;
  };
  const restore = () => {
    (Engine as unknown as { store: typeof original }).store = original;
  };

  it("retries a locked store, reporting each wait, and succeeds once it is free", async () => {
    let calls = 0;
    const fake = {} as Engine;
    stub(async () => {
      if (++calls < 4) throw new StorageLockedError("storage locked: opfs://rel-x");
      return fake;
    });
    const reported: Array<[number, number]> = [];
    const slept: number[] = [];
    try {
      const opened = await openStore("x", (attempt, waitMs) => reported.push([attempt, waitMs]), async (ms) => void slept.push(ms));
      expect(opened).toBe(fake);
      expect(reported).toEqual([[1, 100], [2, 200], [3, 400]]);
      expect(slept).toEqual([100, 200, 400]);
    } finally {
      restore();
    }
  });

  it("returns null once the 5000 ms budget is spent, so the worker continues in memory", async () => {
    stub(async () => {
      throw new StorageLockedError("storage locked");
    });
    const slept: number[] = [];
    try {
      expect(await openStore("x", () => {}, async (ms) => void slept.push(ms))).toBeNull();
      expect(slept.reduce((a, b) => a + b, 0)).toBe(5000);
    } finally {
      restore();
    }
  });

  it("returns null at once for any other failure, without retrying", async () => {
    let calls = 0;
    stub(async () => {
      calls++;
      throw new Error("OPFS is not available");
    });
    try {
      expect(await openStore("x", () => {}, async () => {})).toBeNull();
      expect(calls).toBe(1);
    } finally {
      restore();
    }
  });
});
