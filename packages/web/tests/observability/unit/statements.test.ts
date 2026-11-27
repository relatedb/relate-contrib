// covers-obs: FR-003, FR-004, SC-004
import { describe, expect, it } from "vitest";
import { isWrite, paramFields, PARAMS_CAP, recordOf } from "../../../src/client/statements.js";

describe("the write rule", () => {
  it("is a write exactly when some counter is a non-zero number", () => {
    expect(isWrite({ nodes_created: 1, properties_set: 0 })).toBe(true);
    expect(isWrite({ nodes_deleted: 2 })).toBe(true);
    expect(isWrite({ nodes_created: 0, labels_added: 0 })).toBe(false);
    expect(isWrite({})).toBe(false);
  });

  it("ignores what is not a counter and never reads the statement text", () => {
    expect(isWrite(undefined)).toBe(false);
    expect(isWrite(null)).toBe(false);
    expect(isWrite({ note: "x", flag: true })).toBe(false);
    expect(recordOf("CREATE (n)", { columns: [], rows: [], error: null, stats: { nodes_created: 0 } }).write).toBe(false);
    expect(recordOf("RETURN 1", { columns: [], rows: [], error: null, stats: { nodes_created: 1 } }).write).toBe(true);
  });

  it("takes the engine's time and error from the reply, and null where it has none", () => {
    const ok = recordOf("RETURN 1", { columns: [], rows: [], error: null, stats: {}, elapsed_ms: 1.5 });
    expect(ok).toMatchObject({ ms: 1.5, error: null, stats: {}, write: false });
    const bad = recordOf("x", { columns: [], rows: [], error: "boom" });
    expect(bad).toMatchObject({ ms: null, error: "boom", stats: {}, write: false });
  });
});

describe("the parameters of an event", () => {
  it("carries them as the JSON text sent to the engine, or null when there are none", () => {
    expect(paramFields('{"x":1}')).toEqual({ params: '{"x":1}' });
    expect(paramFields(null)).toEqual({ params: null });
  });

  it("cuts them at 4 KiB and says so", () => {
    const big = JSON.stringify({ text: "x".repeat(10_000) });
    const out = paramFields(big);
    expect(out.params).toHaveLength(PARAMS_CAP);
    expect(out.paramsTruncated).toBe(true);
    expect(paramFields("x".repeat(PARAMS_CAP)).paramsTruncated).toBeUndefined();
  });
});
