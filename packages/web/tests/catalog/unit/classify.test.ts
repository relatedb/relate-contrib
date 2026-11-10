// covers-cat: FR-010, FR-011, FR-012, FR-013
import { describe, expect, it } from "vitest";
import type { Lookup } from "../../../src/catalog/catalog.js";
import type { ApplicationEntry } from "../../../src/catalog/types.js";
import { classify, type StoreFacts } from "../../../src/worker/application/classify.js";

const code = { version: 3 };
const at = "2026-11-10T09:00:00.000Z";
const entry = (over: Partial<ApplicationEntry> = {}): Lookup => ({ status: "entry", entry: { kind: "application", name: "test", state: "ready", version: 3, seeded: true, updatedAt: at, ...over } });
const none: Lookup = { status: "none" };

/** A fact reader that counts how often it is asked. */
function reader(facts: Partial<StoreFacts> = {}) {
  const state = { calls: 0 };
  const read = (): StoreFacts => {
    state.calls++;
    return { nodeCount: 0, indexCount: 0, legacyMarker: false, ...facts };
  };
  return { read, state };
}

describe("every row of the application classification (FR-010)", () => {
  it.each([
    ["no entry, empty store", none, {}, { action: "first-run" }],
    ["seeding, any store", entry({ state: "seeding" }), { nodeCount: 9 }, { action: "reset-and-seed", intent: "seeding" }],
    ["resetting, any store", entry({ state: "resetting" }), { nodeCount: 9 }, { action: "reset-and-seed", intent: "resetting" }],
    ["removing, any store", entry({ state: "removing" }), { nodeCount: 9 }, { action: "finish-removal" }],
    ["migrating, resumes from the recorded version", entry({ state: "migrating", version: 2, target: 3 }), { nodeCount: 9 }, { action: "migrate", from: 2 }],
    ["ready, version equal, with nodes", entry(), { nodeCount: 2 }, { action: "open" }],
    ["ready, version equal, with only an index", entry(), { indexCount: 1 }, { action: "open" }],
    ["ready, version below, with nodes", entry({ version: 1 }), { nodeCount: 2 }, { action: "migrate", from: 1 }],
    ["ready, seeded false, empty store, equal", entry({ seeded: false }), {}, { action: "open" }],
    ["ready, seeded false, empty store, below", entry({ seeded: false, version: 2 }), {}, { action: "migrate", from: 2 }],
  ])("%s", (_name, lookup, facts, expected) => {
    expect(classify(lookup, reader(facts).read, code)).toEqual(expected);
  });

  it.each([
    ["no entry, nodes", none, { nodeCount: 5 }, "store-unmarked"],
    ["no entry, only an index", none, { indexCount: 1 }, "store-unmarked"],
    ["importing, any store", entry({ state: "importing" }), { nodeCount: 9 }, "import-interrupted"],
    ["ready, version above", entry({ version: 5 }), { nodeCount: 2 }, "store-newer"],
    ["seeding, version above", entry({ state: "seeding", version: 5 }), { nodeCount: 2 }, "store-newer"],
    ["importing, version above", entry({ state: "importing", version: 5 }), { nodeCount: 2 }, "store-newer"],
    ["ready, seeded true, empty store", entry(), {}, "store-lost"],
    ["ready, seeded true, below, empty store", entry({ version: 1 }), {}, "store-lost"],
  ])("%s fails %s without a decision to touch the store", (_name, lookup, facts, reason) => {
    expect(classify(lookup, reader(facts).read, code)).toMatchObject({ action: "fail", reason });
  });
});

describe("a migration the code cannot finish", () => {
  it("fails store-newer when a migrating entry's target is above the code's version, whatever its version", () => {
    for (const version of [1, 2, 3]) {
      const a = classify(entry({ state: "migrating", version, target: 4 }), reader({ nodeCount: 4 }).read, code);
      expect(a, `version ${version}`).toMatchObject({ action: "fail", reason: "store-newer", message: expect.stringContaining("version 4") });
    }
  });

  it("resumes a migration whose target is the code's version", () => {
    expect(classify(entry({ state: "migrating", version: 2, target: 3 }), reader().read, code)).toEqual({ action: "migrate", from: 2 });
  });
});

describe("the catalog's own states (FR-011, FR-012)", () => {
  it("an unreadable catalog fails the open as store-unreadable and names the catalog", () => {
    expect(classify({ status: "catalog-unreadable", message: "not valid JSON" }, reader().read, code)).toMatchObject({
      action: "fail",
      reason: "store-unreadable",
      message: expect.stringContaining("catalog"),
    });
  });

  it("a catalog of a newer format fails the open as store-newer", () => {
    expect(classify({ status: "catalog-newer", format: 2 }, reader().read, code)).toMatchObject({ action: "fail", reason: "store-newer" });
  });

  it("an entry that is not valid fails as store-unreadable and says why", () => {
    expect(classify({ status: "invalid", reason: "app-test: version is not a positive integer" }, reader().read, code)).toMatchObject({
      reason: "store-unreadable",
      message: expect.stringContaining("version is not a positive integer"),
    });
  });

  it("an entry that is a cache's fails as store-unreadable", () => {
    const cache: Lookup = { status: "entry", entry: { kind: "cache", name: "test", state: "ready", revision: "r", updatedAt: at } };
    expect(classify(cache, reader().read, code)).toMatchObject({ reason: "store-unreadable" });
  });
});

describe("what the classifier reads", () => {
  it("reads nothing when the entry decides on its own", () => {
    for (const lookup of [entry({ state: "seeding" }), entry({ state: "resetting" }), entry({ state: "importing" }), entry({ state: "removing" }), entry({ state: "migrating", version: 2, target: 3 }), entry({ version: 5 }), entry({ seeded: false })]) {
      const r = reader({ nodeCount: 4 });
      classify(lookup, r.read, code);
      expect(r.state.calls, JSON.stringify(lookup)).toBe(0);
    }
  });

  it("reads once for a ready seeded store and once for no entry", () => {
    const a = reader({ nodeCount: 4 });
    classify(entry(), a.read, code);
    expect(a.state.calls).toBe(1);
    const b = reader();
    classify(none, b.read, code);
    expect(b.state.calls).toBe(1);
  });
});

describe("a store with the old record node and no entry (FR-013)", () => {
  it("fails store-unmarked and names the label", () => {
    const a = classify(none, reader({ nodeCount: 3, legacyMarker: true }).read, code);
    expect(a).toMatchObject({ action: "fail", reason: "store-unmarked", message: expect.stringContaining("_RelateApplication") });
  });

  it("does not mention the label when no node carries it", () => {
    const a = classify(none, reader({ nodeCount: 3 }).read, code);
    expect(a.action === "fail" && a.message).not.toContain("_RelateApplication");
  });
});
