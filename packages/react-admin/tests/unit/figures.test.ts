// covers-ra: SC-004, SC-009
// The recorded measurements (constitution V): each figure carries its method, its environment and a "single run" label, and
// the statement counts that SC-009 states are the ones recorded. Regenerate SC-009 with `pnpm --filter @relate/contrib-react-admin measure`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const figures = JSON.parse(readFileSync(new URL("../../figures.json", import.meta.url), "utf8")) as Record<string, any>;

describe("the recorded figures", () => {
  for (const id of ["SC-004", "SC-009"]) {
    it(`${id} has its method, environment and a "single run" label`, () => {
      const f = figures[id];
      expect(f, id).toBeDefined();
      expect(f.label).toBe("single run");
      expect(String(f.method).length).toBeGreaterThan(40);
      expect(f.environment).toBeDefined();
      expect(f.environment.node ?? f.environment.os).toBeDefined();
      expect(f.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  }

  it("SC-004 records the time from a clean checkout to the lists on screen, with the steps", () => {
    const r = figures["SC-004"].results;
    for (const k of ["installS", "buildS", "runCommandToRowsS", "totalS"]) expect(typeof r[k], k).toBe("number");
    expect(r.rowsShown).toBeGreaterThan(0);
    expect(figures["SC-004"].environment.packageStore).toMatch(/warm/);
  });

  it("SC-009 records that a list costs two statements and a lookup one, and three constraints on the first call", () => {
    const results = figures["SC-009"].results as Array<{ people: number; statements: { firstCall: number; perList: number; perLookup: number }; timings: Array<{ label: string; medianMs: number; p95Ms: number }> }>;
    expect(results.map((r) => r.people)).toEqual([50, 5000]);
    for (const r of results) {
      expect(r.statements).toEqual({ firstCall: 5, perList: 2, perLookup: 1 });
      for (const t of r.timings) {
        expect(t.medianMs).toBeGreaterThan(0);
        expect(t.p95Ms).toBeGreaterThanOrEqual(t.medianMs);
      }
    }
  });

  it("SC-009 records a lookup by id with and without the constraint's index", () => {
    const big = figures["SC-009"].results.find((r: any) => r.people === 5000);
    const indexed = big.timings.find((t: any) => /with the constraint/.test(t.label));
    const bare = big.timings.find((t: any) => /no constraint/.test(t.label));
    expect(indexed).toBeDefined();
    expect(bare).toBeDefined();
    // consistent with the index being used; it is not a proof, since the engine offers no query plan to read
    expect(bare.medianMs).toBeGreaterThan(indexed.medianMs);
  });
});
