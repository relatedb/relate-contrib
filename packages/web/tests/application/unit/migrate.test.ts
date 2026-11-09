// covers-app: FR-011, FR-012, SC-004
import { describe, expect, it } from "vitest";
import { openApplication } from "../../../src/worker/application/lifecycle.js";
import { readMarkers } from "../../../src/worker/application/marker.js";
import { input, query, realEngine, recording } from "./helpers.js";

const people = (e: Awaited<ReturnType<typeof realEngine>>) =>
  query(e, "MATCH (p:Person) RETURN p.id AS id, p.name AS name, p.full AS full, p.tag AS tag ORDER BY p.id").rows;

describe("migrations", () => {
  it("run in order from the stored version, set the version last in each step, and keep the visitor's data", async () => {
    const e = await realEngine();
    openApplication(e, input({ version: 1 }));
    query(e, "CREATE (:Person {id: 'v', name: 'Visitor'})");
    const rec = recording(e);
    const migrations = {
      "2": ["MATCH (p:Person) WHERE p.full IS NULL SET p.full = p.name + '!'"],
      "3": ["MATCH (p:Person) SET p.tag = 'x'", "CREATE INDEX IF NOT EXISTS FOR (p:Person) ON (p.tag)"],
    };
    expect(openApplication(e, input({ version: 3, migrations }))).toEqual({ ok: true, restored: true });
    expect(readMarkers(e)).toEqual([{ format: 1, version: 3, state: "ready" }]);
    expect(people(e).find((r) => r.id === "v")).toMatchObject({ full: "Visitor!", tag: "x" });
    const writes = rec.statements.filter((s) => /SET|CREATE/.test(s));
    expect(writes.map((s) => (s.includes("m.version") ? "version" : s.startsWith("CREATE INDEX") ? "index" : s.includes("p.tag") ? "tag" : "full"))).toEqual([
      "full", "version", "tag", "index", "version",
    ]);
    expect(query(e, "SHOW INDEXES").rows.map((r) => r.name)).toContain("Person_tag");
  });

  it("a failing statement leaves the marker at the last completed version and names the version and statement", async () => {
    const e = await realEngine();
    openApplication(e, input({ version: 1 }));
    const bad = { "2": ["MATCH (p:Person) SET p.a = 1"], "3": ["THIS IS NOT CYPHER"] };
    const r = openApplication(e, input({ version: 3, migrations: bad }));
    expect(r).toMatchObject({ ok: false, reason: "migration-failed" });
    expect((r as { message: string }).message).toContain("version 3");
    expect((r as { message: string }).message).toContain("THIS IS NOT CYPHER");
    expect(readMarkers(e)[0]!.version).toBe(2);
    // fixed, the next open resumes at 3 only
    const rec = recording(e);
    expect(openApplication(e, input({ version: 3, migrations: { ...bad, "3": ["MATCH (p:Person) SET p.b = 2"] } })).ok).toBe(true);
    expect(rec.statements.some((s) => s.includes("p.a = 1"))).toBe(false);
    expect(readMarkers(e)[0]!.version).toBe(3);
  });

  it("runs nothing when the store is at the code's version", async () => {
    const e = await realEngine();
    openApplication(e, input({ version: 2, migrations: { "2": ["RETURN 1"] } }));
    const rec = recording(e);
    openApplication(e, input({ version: 2, migrations: { "2": ["MATCH (p:Person) SET p.never = 1"] } }));
    expect(rec.statements.some((s) => s.includes("never"))).toBe(false);
  });
});
