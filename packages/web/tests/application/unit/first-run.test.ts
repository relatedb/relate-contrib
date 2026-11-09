// covers-app: FR-005, FR-006, FR-007, FR-003
import { describe, expect, it } from "vitest";
import { createMarker, readMarkers, setState, setVersion } from "../../../src/worker/application/marker.js";
import { openApplication } from "../../../src/worker/application/lifecycle.js";
import { input, query, realEngine, recording } from "./helpers.js";


describe("the marker", () => {
  it("is one node with format, version and state, changed by fixed statements", async () => {
    const e = await realEngine();
    createMarker(e, 4, "seeding");
    expect(readMarkers(e)).toEqual([{ format: 1, version: 4, state: "seeding" }]);
    setState(e, "ready");
    setVersion(e, 5);
    expect(readMarkers(e)).toEqual([{ format: 1, version: 5, state: "ready" }]);
  });
});

describe("the first run", () => {
  it("writes seeding, loads the seed and its indexes, and sets ready as the last statement", async () => {
    const e = await realEngine();
    const rec = recording(e);
    expect(openApplication(e, input())).toEqual({ ok: true, restored: false });
    expect(readMarkers(e)).toEqual([{ format: 1, version: 1, state: "ready" }]);
    expect(query(e, "MATCH (p:Person) RETURN count(p) AS c").rows[0]!.c).toBe(2);
    expect(query(e, "SHOW INDEXES").rows.map((r) => r.name)).toContain("Person_name");
    const writes = rec.statements.filter((s) => /CREATE|SET/.test(s));
    expect(writes[0]).toContain("_RelateApplication");
    expect(writes[0]).toContain("CREATE");
    expect(writes.at(-1)).toMatch(/SET m\.state/);
  });

  it("does not load the seed again on a later open", async () => {
    const e = await realEngine();
    openApplication(e, input());
    query(e, "CREATE (:Person {id: 'c', name: 'Cy'})");
    const rec = recording(e);
    const again = openApplication(e, input({ seed: { version: 1, nodes: [{ id: "z", labels: ["Z"] }], links: [] } }));
    expect(again).toEqual({ ok: true, restored: true });
    expect(rec.statements.filter((s) => /CREATE|SET|DELETE|MERGE/.test(s))).toEqual([]);
    expect(query(e, "MATCH (p:Person) RETURN count(p) AS c").rows[0]!.c).toBe(3);
    expect(query(e, "MATCH (z:Z) RETURN count(z) AS c").rows[0]!.c).toBe(0);
  });

  it("rejects a seed that contains the marker's label before any statement runs", async () => {
    const e = await realEngine();
    const rec = recording(e);
    const r = openApplication(e, input({ seed: { version: 1, nodes: [{ id: "m", labels: ["_RelateApplication"] }], links: [] } }));
    expect(r).toMatchObject({ ok: false, reason: "invalid-document" });
    expect((r as { message: string }).message).toContain("_RelateApplication");
    expect(rec.statements.filter((s) => /CREATE|SET/.test(s))).toEqual([]);
  });

  it("returns the marker as an ordinary node in the engine's envelope", async () => {
    const e = await realEngine();
    openApplication(e, input());
    const env = JSON.parse(e.execute("MATCH (m:_RelateApplication) RETURN m"));
    expect(env.rows).toHaveLength(1);
    expect(env.rows[0].m.labels).toEqual(["_RelateApplication"]);
    expect(env.rows[0].m.properties).toEqual({ format: 1, version: 1, state: "ready" });
  });

  it("leaves the marker seeding when the seed is invalid, so the next run recovers", async () => {
    const e = await realEngine();
    const bad = openApplication(e, input({ seed: { version: 1, nodes: [{ labels: ["X"] }], links: [] } }));
    expect(bad).toMatchObject({ ok: false, reason: "invalid-document" });
    expect(readMarkers(e)[0]!.state).toBe("seeding");
    expect(openApplication(e, input())).toEqual({ ok: true, restored: false });
    expect(readMarkers(e)[0]!.state).toBe("ready");
  });
});
