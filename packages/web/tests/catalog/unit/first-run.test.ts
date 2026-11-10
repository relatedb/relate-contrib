// covers-cat: FR-004, FR-007
import { describe, expect, it } from "vitest";
import { query, recording, timeline, world } from "../../application/unit/helpers.js";

describe("an application's bookkeeping lives outside its data (SC-001)", () => {
  it("writes seeding before any data and ready last, with the code's version and seeded", async () => {
    const w = await world();
    const events = timeline(w);
    expect(await w.open({ version: 1 })).toEqual({ ok: true, restored: false });
    const marks = events.filter((s) => /^catalog:|^engine: (CREATE|UNWIND)/.test(s)).map((s) => (s.startsWith("catalog:") ? s.replace("catalog: app-test ", "") : "data"));
    expect(marks[0]).toBe("seeding v1");
    expect(marks.at(-1)).toBe("ready v1");
    expect(marks.indexOf("seeding v1")).toBeLessThan(marks.indexOf("data"));
    expect(await w.entry()).toMatchObject({ kind: "application", name: "test", state: "ready", version: 1, seeded: true });
  });

  it("holds no node but the seed's and the visitor's", async () => {
    const w = await world();
    await w.open();
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(2);
    query(w.e, "CREATE (:Person {id: 'c', name: 'Cy'})");
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(3);
  });

  it("does not rewrite the entry or the data on a later open", async () => {
    const w = await world();
    await w.open();
    const replaced = w.storage.replaced;
    const rec = recording(w.e);
    expect(await w.open()).toEqual({ ok: true, restored: true });
    expect(w.storage.replaced).toBe(replaced);
    expect(rec.statements.filter((s) => /CREATE|SET|DELETE|MERGE/.test(s))).toEqual([]);
  });

  it("loads a seed with no nodes and records seeded false; the empty store then opens", async () => {
    const w = await world();
    expect(await w.open({ seed: { version: 1, nodes: [], links: [] }, indexes: [] })).toEqual({ ok: true, restored: false });
    expect(await w.entry()).toMatchObject({ state: "ready", seeded: false });
    expect(await w.open({ seed: { version: 1, nodes: [], links: [] }, indexes: [] })).toEqual({ ok: true, restored: true });
  });
});

describe("the old record's label is an ordinary label (FR-004)", () => {
  const seedWithLabel = { version: 1, nodes: [{ id: "m", labels: ["_RelateApplication"], properties: { x: 1 } }], links: [] };

  it("loads in a seed and is returned by queries like any node", async () => {
    const w = await world();
    expect(await w.open({ seed: seedWithLabel, indexes: [] })).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (n:_RelateApplication) RETURN n.x AS x").rows).toEqual([{ x: 1 }]);
    expect(await w.open({ seed: seedWithLabel, indexes: [] })).toEqual({ ok: true, restored: true });
  });

  it("a store with such a node and no entry fails store-unmarked with a message naming the label", async () => {
    const w = await world();
    query(w.e, "CREATE (:_RelateApplication {format: 1, version: 1, state: 'ready'})");
    const r = await w.open();
    expect(r).toMatchObject({ ok: false, reason: "store-unmarked" });
    expect((r as { message: string }).message).toContain("_RelateApplication");
    expect(await w.entry()).toBeUndefined();
  });
});

describe("store-lost (FR-010, FR-011)", () => {
  it("a ready seeded store emptied by a statement fails store-lost, untouched, and a reset recovers it", async () => {
    const w = await world();
    await w.open();
    query(w.e, "MATCH (n) DETACH DELETE n");
    query(w.e, "DROP INDEX Person_name IF EXISTS");
    const rec = recording(w.e);
    const replaced = w.storage.replaced;
    expect(await w.open()).toMatchObject({ ok: false, reason: "store-lost" });
    expect(rec.statements.filter((s) => /CREATE|SET|DELETE|MERGE|DROP/.test(s))).toEqual([]);
    expect(w.storage.replaced).toBe(replaced);
    expect(await w.open({ intent: "reset" })).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(2);
  });

  it("an application that seeded nothing opens an empty store as valid", async () => {
    const w = await world();
    await w.open({ seed: { version: 1, nodes: [], links: [] }, indexes: [] });
    expect(await w.open({ seed: { version: 1, nodes: [], links: [] }, indexes: [] })).toEqual({ ok: true, restored: true });
  });
});
