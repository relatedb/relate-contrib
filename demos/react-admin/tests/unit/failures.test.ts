// covers-ra: FR-025, SC-006
import { describe, expect, it } from "vitest";
import { FAILURE_REASONS, failureInfo } from "../../src/failures.js";

describe("the failure table", () => {
  it("has an entry for each reason the client reports for an application graph, each with its own explanation", () => {
    expect([...FAILURE_REASONS].sort()).toEqual(["import-interrupted", "migration-failed", "store-lost", "store-newer", "store-unmarked", "store-unreadable"]);
    const explanations = FAILURE_REASONS.map((r) => failureInfo(r).explanation);
    expect(new Set(explanations).size).toBe(FAILURE_REASONS.length);
    for (const r of FAILURE_REASONS) {
      const info = failureInfo(r);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.explanation.length).toBeGreaterThan(20);
    }
  });

  it("offers a confirmed reset and no export, for every reason (the core cannot export from a failed client)", () => {
    for (const r of [...FAILURE_REASONS, "something-new"]) {
      const info = failureInfo(r);
      expect(info.choices).toEqual(["reset"]);
      expect(JSON.stringify(info).toLowerCase()).not.toMatch(/\bexport\b.*\bbutton\b|download/);
    }
  });

  it("says what a reset does to the stored data, for every reason", () => {
    for (const r of FAILURE_REASONS) expect(failureInfo(r).consequence).toMatch(/discard/i);
  });

  it("falls back to a generic entry with reset only for a reason it does not know, naming the reason", () => {
    const info = failureInfo("something-new");
    expect(info.choices).toEqual(["reset"]);
    expect(info.explanation).toContain("something-new");
    expect(FAILURE_REASONS).not.toContain("something-new" as never);
  });
});
