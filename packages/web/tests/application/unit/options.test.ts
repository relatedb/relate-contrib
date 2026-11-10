// covers-app: FR-001, FR-002, FR-003
import { describe, expect, it } from "vitest";
import { validateApplication } from "../../../src/application/options.js";
import { inRanges } from "../../../src/application/ranges.js";
import { createClient } from "../../../src/client/client.js";

const seed = { version: 1 as const, nodes: [], links: [] };
const ok = { name: "notes", version: 1, seed };

describe("the name", () => {
  it("accepts 1 to 60 letters, digits, dash and underscore", () => {
    expect(validateApplication({ ...ok, name: "a" }).name).toBe("a");
    expect(validateApplication({ ...ok, name: "A_b-9".padEnd(60, "x") }).name).toHaveLength(60);
  });
  it.each(["", "a".repeat(61), "a/b", "a b", "é", "a.b"])("rejects %j and names the rule", (name) => {
    expect(() => validateApplication({ ...ok, name })).toThrow(/application\.name must match/);
  });
});

describe("the version", () => {
  it.each([0, -1, 1.5, "2", NaN])("rejects %j", (version) => {
    expect(() => validateApplication({ ...ok, version: version as never })).toThrow(/positive integer/);
  });
});

describe("the seed", () => {
  it("is required and names itself when missing", () => {
    expect(() => validateApplication({ name: "a", version: 1 } as never)).toThrow(/application\.seed is required/);
  });
});

describe("the migrations", () => {
  it("must be consecutive from 2 up to the version", () => {
    expect(validateApplication({ ...ok, version: 3, migrations: { 2: ["RETURN 1"], 3: ["RETURN 2"] } }).migrations["3"]).toEqual(["RETURN 2"]);
    expect(() => validateApplication({ ...ok, version: 4, migrations: { 2: ["RETURN 1"], 4: ["RETURN 2"] } })).toThrow(/version 3 is missing/);
    expect(() => validateApplication({ ...ok, version: 2, migrations: { 3: ["RETURN 1"] } })).toThrow(/version 3, above/);
    expect(() => validateApplication({ ...ok, version: 2, migrations: { 1: ["RETURN 1"] } })).toThrow(/version 1/);
    expect(() => validateApplication({ ...ok, version: 3, migrations: { 3: ["RETURN 1"] } })).toThrow(/version 2 is missing/);
  });
  it("rejects a range step without $from or $to, or a bad step", () => {
    expect(() => inRanges({ label: "N", property: "n", step: 10, statement: "MATCH (n) SET n.x = 1" })).toThrow(/\$from/);
    expect(() => inRanges({ label: "N", property: "n", step: 0, statement: "$from $to" })).toThrow(/positive integer/);
    expect(() => validateApplication({ ...ok, version: 2, migrations: { 2: [{ kind: "ranges", label: "N", property: "n", step: 1, statement: "x" }] } })).toThrow(/\$from/);
  });
});

describe("the other options", () => {
  it("default to memory, fail and wait, and reject other values", () => {
    const n = validateApplication(ok);
    expect([n.onUnavailable, n.onError, n.whenLocked]).toEqual(["memory", "fail", "wait"]);
    expect(() => validateApplication({ ...ok, whenLocked: "now" as never })).toThrow(/whenLocked/);
  });
});

describe("creating a client", () => {
  const make = vi_neverCalled();
  it("throws for a bad option and never creates a worker", () => {
    expect(() => createClient({ engineUrl: "x", navigation: "client-routing", application: { ...ok, name: "a b" }, workerFactory: make.factory })).toThrow(/name/);
    expect(make.calls).toBe(0);
  });
  it("throws when both graph and application, or neither, are given", () => {
    const graph = { document: seed };
    expect(() => createClient({ engineUrl: "x", navigation: "client-routing", graph, application: ok, workerFactory: make.factory })).toThrow(/exactly one/);
    expect(() => createClient({ engineUrl: "x", navigation: "client-routing", workerFactory: make.factory })).toThrow(/exactly one/);
    expect(make.calls).toBe(0);
  });
});

function vi_neverCalled() {
  const state = { calls: 0, factory: (): Worker => { state.calls++; throw new Error("no worker may be created"); } };
  return state;
}
