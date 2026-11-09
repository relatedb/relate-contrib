// covers-app: FR-007, FR-008, FR-009
import { describe, expect, it } from "vitest";
import { classify, type StoreFacts } from "../../../src/worker/application/classify.js";

const facts = (over: Partial<StoreFacts> = {}): StoreFacts => ({ markers: [], nodeCount: 0, indexCount: 0, ...over });
const marker = (m: Partial<{ format: number; version: number; state: string }> = {}) => ({ format: 1, version: 3, state: "ready", ...m });

describe("classifying an opened store", () => {
  it("no marker and empty: first run", () => expect(classify(facts(), { version: 3 })).toEqual({ action: "first-run" }));
  it("no marker and data: store-unmarked", () => expect(classify(facts({ nodeCount: 5 }), { version: 3 })).toMatchObject({ action: "fail", reason: "store-unmarked" }));
  it("no marker, no nodes but an index: store-unmarked", () => expect(classify(facts({ indexCount: 1 }), { version: 3 })).toMatchObject({ reason: "store-unmarked" }));
  it("seeding: reset and seed", () => expect(classify(facts({ markers: [marker({ state: "seeding" })], nodeCount: 9 }), { version: 3 })).toEqual({ action: "reset-and-seed" }));
  it("importing: import-interrupted", () => expect(classify(facts({ markers: [marker({ state: "importing" })], nodeCount: 9 }), { version: 3 })).toMatchObject({ reason: "import-interrupted" }));
  it("ready above the code's format: store-newer", () => expect(classify(facts({ markers: [marker({ format: 2 })], nodeCount: 2 }), { version: 3 })).toMatchObject({ reason: "store-newer" }));
  it("ready above the code's version: store-newer", () => expect(classify(facts({ markers: [marker({ version: 5 })], nodeCount: 2 }), { version: 3 })).toMatchObject({ reason: "store-newer" }));
  it("ready below: migrate from the stored version", () => expect(classify(facts({ markers: [marker({ version: 1 })], nodeCount: 2 }), { version: 3 })).toEqual({ action: "migrate", from: 1 }));
  it("ready and equal: open", () => expect(classify(facts({ markers: [marker()], nodeCount: 2 }), { version: 3 })).toEqual({ action: "open" }));
  it("two markers: store-unreadable", () => expect(classify(facts({ markers: [marker(), marker()], nodeCount: 2 }), { version: 3 })).toMatchObject({ reason: "store-unreadable", message: expect.stringContaining("more than one marker") }));
  it("an unknown state: store-unreadable", () => expect(classify(facts({ markers: [marker({ state: "odd" })], nodeCount: 2 }), { version: 3 })).toMatchObject({ reason: "store-unreadable" }));

  it("only reset-and-seed ever resets, and only for a seeding marker", () => {
    for (const state of ["ready", "importing", "odd"]) {
      for (const version of [1, 3, 5]) {
        const a = classify(facts({ markers: [marker({ state, version })], nodeCount: 4 }), { version: 3 });
        expect(a.action).not.toBe("reset-and-seed");
        expect(a.action).not.toBe("first-run");
      }
    }
    expect(classify(facts({ nodeCount: 4 }), { version: 3 }).action).toBe("fail");
  });
});
