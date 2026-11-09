// covers-app: FR-014, FR-017, FR-018
import { describe, expect, it, vi } from "vitest";
import { readPersisted, requestPersistence, StorageHolder, storageEstimate } from "../../../src/application/storage.js";
import type { StorageStatus } from "../../../src/application/types.js";

const holder = () => {
  const seen: StorageStatus[] = [];
  return { seen, h: new StorageHolder((s) => seen.push(s)) };
};

describe("the storage holder", () => {
  it("starts waiting with nothing reported", () => {
    expect(holder().h.value).toEqual({ kind: "waiting", persisted: null });
  });

  it("emits only when kind, reason or persisted changes", () => {
    const { h, seen } = holder();
    h.apply({ kind: "durable" });
    h.apply({ kind: "durable" });
    h.setPersisted(true);
    h.setPersisted(true);
    h.apply({ kind: "waiting", reason: "locked" });
    expect(seen.map((s) => [s.kind, s.reason, s.persisted])).toEqual([
      ["durable", undefined, null],
      ["durable", undefined, true],
      ["waiting", "locked", true],
    ]);
  });

  it("a client in memory never becomes durable", () => {
    const { h, seen } = holder();
    h.apply({ kind: "memory", reason: "unavailable" });
    expect(h.apply({ kind: "durable" })).toBe(false);
    expect(h.value).toMatchObject({ kind: "memory", reason: "unavailable" });
    expect(seen).toHaveLength(1);
  });
});

describe("persistence and estimate", () => {
  it("requestPersistence calls persist only when invoked, and is false when absent or throwing", async () => {
    const persist = vi.fn().mockResolvedValue(true);
    expect(persist).not.toHaveBeenCalled();
    expect(await requestPersistence({ persist })).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(await requestPersistence({})).toBe(false);
    expect(await requestPersistence(undefined)).toBe(false);
    expect(await requestPersistence({ persist: () => Promise.reject(new Error("no")) })).toBe(false);
  });

  it("readPersisted is null when the page cannot ask", async () => {
    expect(await readPersisted({})).toBeNull();
    expect(await readPersisted({ persisted: () => Promise.resolve(false) })).toBe(false);
  });

  it("storageEstimate returns usage and quota with null for what is missing", async () => {
    expect(await storageEstimate({ estimate: () => Promise.resolve({ usage: 5, quota: 100 }) })).toEqual({ usage: 5, quota: 100 });
    expect(await storageEstimate({ estimate: () => Promise.resolve({}) })).toEqual({ usage: null, quota: null });
    expect(await storageEstimate({})).toEqual({ usage: null, quota: null });
  });
});
