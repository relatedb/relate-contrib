// covers-app: FR-007, FR-008, FR-009
import { describe, expect, it } from "vitest";
import type { Lookup } from "../../../src/catalog/catalog.js";
import type { ApplicationEntry } from "../../../src/catalog/types.js";
import { classify, type StoreFacts } from "../../../src/worker/application/classify.js";

const facts = (over: Partial<StoreFacts> = {}): StoreFacts => ({ nodeCount: 0, indexCount: 0, legacyMarker: false, ...over });
const entry = (over: Partial<ApplicationEntry> = {}): Lookup => ({
  status: "entry",
  entry: { kind: "application", name: "test", state: "ready", version: 3, seeded: true, updatedAt: "2026-11-10T09:00:00.000Z", ...over },
});
const none: Lookup = { status: "none" };
const code = { version: 3 };

describe("classifying an opened store", () => {
  it("no entry and empty: first run", () => expect(classify(none, () => facts(), code)).toEqual({ action: "first-run" }));
  it("no entry and data: store-unmarked", () => expect(classify(none, () => facts({ nodeCount: 5 }), code)).toMatchObject({ action: "fail", reason: "store-unmarked" }));
  it("no entry, no nodes but an index: store-unmarked", () => expect(classify(none, () => facts({ indexCount: 1 }), code)).toMatchObject({ reason: "store-unmarked" }));
  it("seeding: reset and seed", () => expect(classify(entry({ state: "seeding" }), () => facts({ nodeCount: 9 }), code)).toEqual({ action: "reset-and-seed", intent: "seeding" }));
  it("importing: import-interrupted", () => expect(classify(entry({ state: "importing" }), () => facts({ nodeCount: 9 }), code)).toMatchObject({ reason: "import-interrupted" }));
  it("ready above the code's version: store-newer", () => expect(classify(entry({ version: 5 }), () => facts({ nodeCount: 2 }), code)).toMatchObject({ reason: "store-newer" }));
  it("ready below: migrate from the stored version", () => expect(classify(entry({ version: 1 }), () => facts({ nodeCount: 2 }), code)).toEqual({ action: "migrate", from: 1 }));
  it("ready and equal: open", () => expect(classify(entry(), () => facts({ nodeCount: 2 }), code)).toEqual({ action: "open" }));
  it("an entry that is not valid: store-unreadable", () => expect(classify({ status: "invalid", reason: "x" }, () => facts(), code)).toMatchObject({ reason: "store-unreadable" }));

  it("only reset-and-seed ever resets, and only for seeding or resetting", () => {
    for (const state of ["ready", "importing", "migrating", "removing"] as const) {
      for (const version of [1, 3, 5]) {
        const a = classify(entry({ state, version, ...(state === "migrating" ? { target: version + 1 } : {}) }), () => facts({ nodeCount: 4 }), code);
        expect(a.action).not.toBe("reset-and-seed");
        expect(a.action).not.toBe("first-run");
      }
    }
    expect(classify(none, () => facts({ nodeCount: 4 }), code).action).toBe("fail");
  });

  it("a newer release's store is refused whatever its state, so older code never resets it", () => {
    for (const state of ["seeding", "importing", "ready"] as const) {
      expect(classify(entry({ state, version: 9 }), () => facts({ nodeCount: 4 }), code)).toMatchObject({ reason: "store-newer" });
    }
  });
});
