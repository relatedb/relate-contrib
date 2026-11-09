// covers-app: FR-007, FR-008, FR-009, SC-003
import { describe, expect, it } from "vitest";
import { createMarker, readMarkers, setState } from "../../../src/worker/application/marker.js";
import { openApplication } from "../../../src/worker/application/lifecycle.js";
import { input, query, realEngine, recording } from "./helpers.js";

const nodes = (e: Awaited<ReturnType<typeof realEngine>>) => query(e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c;
const writes = (r: { statements: string[] }) => r.statements.filter((s) => /CREATE|SET|DELETE|MERGE|DROP/.test(s));

describe("recovering and refusing", () => {
  it("resets and seeds again after a first run that stopped while seeding", async () => {
    const e = await realEngine();
    createMarker(e, 1, "seeding");
    query(e, "CREATE (:Half {id: 'x'})");
    expect(openApplication(e, input())).toEqual({ ok: true, restored: false });
    expect(query(e, "MATCH (h:Half) RETURN count(h) AS c").rows[0]!.c).toBe(0);
    expect(readMarkers(e)).toEqual([{ format: 1, version: 1, state: "ready" }]);
  });

  it("fails import-interrupted and leaves the store as it is", async () => {
    const e = await realEngine();
    openApplication(e, input());
    setState(e, "importing");
    const before = nodes(e);
    const rec = recording(e);
    expect(openApplication(e, input())).toMatchObject({ ok: false, reason: "import-interrupted" });
    expect(nodes(e)).toBe(before);
    expect(writes(rec)).toEqual([]);
  });

  it("fails store-unmarked for data with no marker, including after the marker was deleted", async () => {
    const e = await realEngine();
    openApplication(e, input());
    query(e, "MATCH (m:_RelateApplication) DELETE m");
    const before = nodes(e);
    const rec = recording(e);
    expect(openApplication(e, input())).toMatchObject({ ok: false, reason: "store-unmarked" });
    expect(nodes(e)).toBe(before);
    expect(writes(rec)).toEqual([]);
  });

  it("fails store-newer for a newer version or format and keeps the data", async () => {
    for (const set of ["m.version = 5", "m.format = 2"]) {
      const e = await realEngine();
      openApplication(e, input({ version: 3 }));
      query(e, `MATCH (m:_RelateApplication) SET ${set}`);
      const before = nodes(e);
      const rec = recording(e);
      expect(openApplication(e, input({ version: 3 }))).toMatchObject({ ok: false, reason: "store-newer" });
      expect(nodes(e)).toBe(before);
      expect(writes(rec)).toEqual([]);
    }
  });

  it("the reset intent discards the data and seeds again; nothing else does", async () => {
    const e = await realEngine();
    openApplication(e, input());
    query(e, "CREATE (:Mine {id: 'v'})");
    expect(openApplication(e, input())).toEqual({ ok: true, restored: true });
    expect(query(e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(1);
    expect(openApplication(e, input({ intent: "reset" }))).toEqual({ ok: true, restored: false });
    expect(query(e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(0);
    expect(readMarkers(e)[0]!.state).toBe("ready");
  });
});
