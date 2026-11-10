// covers-app: FR-007, FR-008, FR-009, SC-003
import { describe, expect, it } from "vitest";
import { query, recording, world } from "./helpers.js";

const nodes = (e: Awaited<ReturnType<typeof world>>["e"]) => query(e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c;
const writes = (r: { statements: string[] }) => r.statements.filter((s) => /CREATE|SET|DELETE|MERGE|DROP/.test(s));

describe("recovering and refusing", () => {
  it("resets and seeds again after a first run that stopped while seeding", async () => {
    const w = await world();
    await w.put({ state: "seeding" });
    query(w.e, "CREATE (:Half {id: 'x'})");
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (h:Half) RETURN count(h) AS c").rows[0]!.c).toBe(0);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 1 });
  });

  it("fails import-interrupted and leaves the store as it is", async () => {
    const w = await world();
    await w.open();
    await w.put({ state: "importing" });
    const before = nodes(w.e);
    const rec = recording(w.e);
    const replaced = w.storage.replaced;
    expect(await w.open()).toMatchObject({ ok: false, reason: "import-interrupted" });
    expect(nodes(w.e)).toBe(before);
    expect(writes(rec)).toEqual([]);
    expect(w.storage.replaced).toBe(replaced);
  });

  it("fails store-unmarked for data with no entry, including after the entry was removed", async () => {
    const w = await world();
    await w.open();
    await w.catalog.delete("app-test");
    const before = nodes(w.e);
    const rec = recording(w.e);
    expect(await w.open()).toMatchObject({ ok: false, reason: "store-unmarked" });
    expect(nodes(w.e)).toBe(before);
    expect(writes(rec)).toEqual([]);
  });

  it("fails store-newer for a newer version and keeps the data", async () => {
    const w = await world();
    await w.open({ version: 3, migrations: { "2": ["RETURN 1"], "3": ["RETURN 2"] } });
    await w.put({ state: "ready", version: 5 });
    const before = nodes(w.e);
    const rec = recording(w.e);
    expect(await w.open({ version: 3 })).toMatchObject({ ok: false, reason: "store-newer" });
    expect(nodes(w.e)).toBe(before);
    expect(writes(rec)).toEqual([]);
  });

  it("the reset intent discards the data and seeds again; nothing else does", async () => {
    const w = await world();
    await w.open();
    query(w.e, "CREATE (:Mine {id: 'v'})");
    expect(await w.open()).toEqual({ ok: true, restored: true });
    expect(query(w.e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(1);
    expect(await w.open({ intent: "reset" })).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(0);
    expect((await w.entry())!.state).toBe("ready");
  });
});
