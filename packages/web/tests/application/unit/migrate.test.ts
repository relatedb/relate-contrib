// covers-app: FR-011, FR-012, SC-004
import { describe, expect, it } from "vitest";
import { query, recording, timeline, world } from "./helpers.js";

const people = (e: Awaited<ReturnType<typeof world>>["e"]) =>
  query(e, "MATCH (p:Person) RETURN p.id AS id, p.name AS name, p.full AS full, p.tag AS tag ORDER BY p.id").rows;

describe("migrations", () => {
  it("run in order from the stored version, write the version last in each step, and keep the visitor's data", async () => {
    const w = await world();
    await w.open({ version: 1 });
    query(w.e, "CREATE (:Person {id: 'v', name: 'Visitor'})");
    const events = timeline(w);
    const migrations = {
      "2": ["MATCH (p:Person) WHERE p.full IS NULL SET p.full = p.name + '!'"],
      "3": ["MATCH (p:Person) SET p.tag = 'x'", "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.tag)"],
    };
    expect(await w.open({ version: 3, migrations })).toEqual({ ok: true, restored: true });
    expect(await w.entry()).toMatchObject({ state: "ready", version: 3, seeded: true });
    expect(people(w.e).find((r) => r.id === "v")).toMatchObject({ full: "Visitor!", tag: "x" });
    const trace = events
      .filter((s) => /^catalog:|SET|CREATE/.test(s))
      .map((s) => (s.startsWith("catalog:") ? s.replace("catalog: app-test ", "") : s.startsWith("engine: CREATE INDEX") ? "index" : s.includes("p.tag") ? "tag" : "full"));
    expect(trace).toEqual(["migrating v1", "full", "ready v2", "migrating v2", "tag", "index", "ready v3"]);
    expect(query(w.e, "SHOW INDEXES").rows.map((r) => r.name)).toContain("Person_tag");
  });

  it("a failing statement leaves the entry at the last completed version and names the version and statement", async () => {
    const w = await world();
    await w.open({ version: 1 });
    const bad = { "2": ["MATCH (p:Person) SET p.a = 1"], "3": ["THIS IS NOT CYPHER"] };
    const r = await w.open({ version: 3, migrations: bad });
    expect(r).toMatchObject({ ok: false, reason: "migration-failed" });
    expect((r as { message: string }).message).toContain("version 3");
    expect((r as { message: string }).message).toContain("THIS IS NOT CYPHER");
    expect(await w.entry()).toMatchObject({ state: "migrating", version: 2, target: 3 });
    // fixed, the next open resumes at 3 only
    const rec = recording(w.e);
    expect((await w.open({ version: 3, migrations: { ...bad, "3": ["MATCH (p:Person) SET p.b = 2"] } })).ok).toBe(true);
    expect(rec.statements.some((s) => s.includes("p.a = 1"))).toBe(false);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 3 });
  });

  it("runs nothing when the store is at the code's version", async () => {
    const w = await world();
    await w.open({ version: 2, migrations: { "2": ["RETURN 1"] } });
    const rec = recording(w.e);
    await w.open({ version: 2, migrations: { "2": ["MATCH (p:Person) SET p.never = 1"] } });
    expect(rec.statements.some((s) => s.includes("never"))).toBe(false);
  });

  it("fails, naming the version, when the application gives no migration for a version the store needs, and does not advance the entry", async () => {
    const w = await world();
    await w.open({ version: 1 });
    const r = await w.open({ version: 3, migrations: { "3": ["MATCH (p:Person) SET p.x = 1"] } });
    expect(r).toMatchObject({ ok: false, reason: "migration-failed" });
    expect((r as { message: string }).message).toContain("version 2");
    expect(await w.entry()).toMatchObject({ state: "ready", version: 1 });
    expect(await w.open({ version: 3, migrations: {} })).toMatchObject({ ok: false, reason: "migration-failed" });
    expect(await w.entry()).toMatchObject({ state: "ready", version: 1 });
  });

  it("a step that touches every node needs no guard: nothing of the core's is in the graph", async () => {
    const w = await world();
    await w.open({ version: 1 });
    expect((await w.open({ version: 2, migrations: { "2": ["MATCH (n) SET n.touched = 1"] } })).ok).toBe(true);
    expect(query(w.e, "MATCH (n) WHERE n.touched = 1 RETURN count(n) AS c").rows[0]!.c).toBe(2);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 2 });
  });
});
