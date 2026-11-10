// covers-app: FR-005, FR-006, FR-007, FR-003
import { describe, expect, it } from "vitest";
import { query, recording, timeline, world } from "./helpers.js";

describe("the application's record", () => {
  it("is one catalog entry with kind, name, state, version and seeded, written by fixed calls", async () => {
    const w = await world();
    await w.put({ state: "seeding", version: 4, seeded: false });
    expect(await w.entry()).toMatchObject({ kind: "application", name: "test", state: "seeding", version: 4, seeded: false });
    await w.put({ state: "ready", version: 5 });
    expect(await w.entry()).toMatchObject({ state: "ready", version: 5 });
  });
});

describe("the first run", () => {
  it("writes seeding before any data, loads the seed and its indexes, and writes ready last", async () => {
    const w = await world();
    const events = timeline(w);
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect(await w.entry()).toMatchObject({ state: "ready", version: 1, seeded: true });
    expect(query(w.e, "MATCH (p:Person) RETURN count(p) AS c").rows[0]!.c).toBe(2);
    expect(query(w.e, "SHOW INDEXES").rows.map((r) => r.name)).toContain("Person_name");
    const writes = events.filter((s) => /^catalog:|CREATE|SET/.test(s));
    expect(writes[0]).toBe("catalog: app-test seeding v1");
    expect(writes.at(-1)).toBe("catalog: app-test ready v1");
    expect(writes.indexOf("catalog: app-test seeding v1")).toBeLessThan(writes.findIndex((s) => s.startsWith("engine:")));
  });

  it("does not load the seed again on a later open, and writes nothing", async () => {
    const w = await world();
    await w.open();
    query(w.e, "CREATE (:Person {id: 'c', name: 'Cy'})");
    const rec = recording(w.e);
    const replaced = w.storage.replaced;
    const again = await w.open({ seed: { version: 1, nodes: [{ id: "z", labels: ["Z"] }], links: [] } });
    expect(again).toEqual({ ok: true, restored: true });
    expect(rec.statements.filter((s) => /CREATE|SET|DELETE|MERGE/.test(s))).toEqual([]);
    expect(w.storage.replaced).toBe(replaced);
    expect(query(w.e, "MATCH (p:Person) RETURN count(p) AS c").rows[0]!.c).toBe(3);
    expect(query(w.e, "MATCH (z:Z) RETURN count(z) AS c").rows[0]!.c).toBe(0);
  });

  it("holds no bookkeeping node: a count of all nodes is the seed's", async () => {
    const w = await world();
    await w.open();
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(2);
    expect(query(w.e, "MATCH (n:_RelateApplication) RETURN count(n) AS c").rows[0]!.c).toBe(0);
  });

  it("leaves nothing behind when the seed is invalid, so the next run is a first run", async () => {
    const w = await world();
    const bad = await w.open({ seed: { version: 1, nodes: [{ labels: ["X"] }], links: [] } });
    expect(bad).toMatchObject({ ok: false, reason: "invalid-document" });
    expect(await w.entry()).toBeUndefined();
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect((await w.entry())!.state).toBe("ready");
  });
});
