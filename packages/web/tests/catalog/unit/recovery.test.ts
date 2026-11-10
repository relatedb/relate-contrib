// covers-cat: FR-007, FR-008, FR-010, FR-014, SC-004, SC-005, SC-006
import { describe, expect, it } from "vitest";
import { query, recording, timeline, world, type World } from "../../application/unit/helpers.js";

const nodes = (w: World) => query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c;
const writes = (r: { statements: string[] }) => r.statements.filter((s) => /CREATE|SET|DELETE|MERGE|DROP/.test(s));

/** Make the nth catalog replace (1-based) fail, as a tab ended in the middle of its own write would. */
function failReplace(w: World, nth: number): () => void {
  const replace = w.storage.replace.bind(w.storage);
  let calls = 0;
  w.storage.replace = async (text: string) => {
    if (++calls === nth) throw new Error("terminated during the catalog write");
    await replace(text);
  };
  return () => {
    w.storage.replace = replace;
  };
}

describe("an interrupted first run", () => {
  it("leaves seeding when the data load stops, and the next open resets and seeds again", async () => {
    const w = await world();
    const execute = w.e.execute.bind(w.e);
    w.e.execute = (s, p = null) => {
      if (s.startsWith("UNWIND $rows AS row CREATE")) throw new Error("terminated");
      return execute(s, p);
    };
    await expect(w.open()).rejects.toThrow(/terminated/);
    w.e.execute = execute;
    expect(await w.entry()).toMatchObject({ state: "seeding", version: 1, seeded: true });
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect(await w.entry()).toMatchObject({ state: "ready" });
    expect(nodes(w)).toBe(2);
  });

  it("changes nothing when the intent write itself fails", async () => {
    const w = await world();
    const restore = failReplace(w, 1);
    await expect(w.open()).rejects.toThrow(/terminated/);
    restore();
    expect(await w.entry()).toBeUndefined();
    expect(nodes(w)).toBe(0);
  });

  it("leaves seeding when the outcome write fails, and the next open seeds again over the loaded data", async () => {
    const w = await world();
    const restore = failReplace(w, 2);
    await expect(w.open()).rejects.toThrow(/terminated/);
    restore();
    expect(await w.entry()).toMatchObject({ state: "seeding" });
    expect(nodes(w)).toBe(2);
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect(nodes(w)).toBe(2);
    expect(await w.entry()).toMatchObject({ state: "ready" });
  });
});

describe("resetApplication and a reset that stops", () => {
  it("writes resetting before it resets, then ready", async () => {
    const w = await world();
    await w.open();
    const events = timeline(w);
    expect(await w.open({ intent: "reset" })).toEqual({ ok: true, restored: false });
    const marks = events.filter((s) => /^catalog:|reset/.test(s)).map((s) => (s.startsWith("catalog:") ? s.replace("catalog: app-test ", "") : "reset"));
    expect(marks).toEqual(["resetting v1", "reset", "ready v1"]);
  });

  it("continues after a stop: the next ordinary open resets, seeds and ends ready, without the visitor's data", async () => {
    const w = await world();
    await w.open();
    query(w.e, "CREATE (:Mine {id: 'v'})");
    const execute = w.e.execute.bind(w.e);
    w.e.execute = (s, p = null) => {
      if (s.startsWith("UNWIND $rows AS row CREATE")) throw new Error("terminated");
      return execute(s, p);
    };
    await expect(w.open({ intent: "reset" })).rejects.toThrow(/terminated/);
    w.e.execute = execute;
    expect(await w.entry()).toMatchObject({ state: "resetting" });
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(0);
    expect(nodes(w)).toBe(2);
    expect(await w.entry()).toMatchObject({ state: "ready" });
  });
});

describe("a removal that stops", () => {
  it("is finished on the next open and ends as a first run", async () => {
    const w = await world();
    await w.open();
    query(w.e, "CREATE (:Mine {id: 'v'})");
    await w.put({ state: "removing" });
    expect(await w.open()).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(0);
    expect(nodes(w)).toBe(2);
    expect(await w.entry()).toMatchObject({ state: "ready", seeded: true });
  });
});

describe("an interrupted migration", () => {
  const migrations = {
    "2": ["MATCH (p:Person) WHERE p.full IS NULL SET p.full = p.name + '!'"],
    "3": ["MATCH (p:Person) WHERE p.tag IS NULL SET p.tag = 'x'"],
  };
  const snapshot = (w: World) => JSON.stringify(query(w.e, "MATCH (p:Person) RETURN p.id AS id, p.name AS name, p.full AS full, p.tag AS tag ORDER BY p.id").rows);

  it("resumes from the recorded version and ends identical to an uninterrupted run", async () => {
    const clean = await world();
    await clean.open({ version: 1 });
    query(clean.e, "CREATE (:Person {id: 'v', name: 'Visitor'})");
    await clean.open({ version: 3, migrations });

    const cut = await world();
    await cut.open({ version: 1 });
    query(cut.e, "CREATE (:Person {id: 'v', name: 'Visitor'})");
    const execute = cut.e.execute.bind(cut.e);
    let hits = 0;
    cut.e.execute = (s, p = null) => {
      if (s.includes("p.tag") && ++hits === 1) throw new Error("terminated");
      return execute(s, p);
    };
    expect(await cut.open({ version: 3, migrations })).toMatchObject({ ok: false, reason: "migration-failed" });
    cut.e.execute = execute;
    expect(await cut.entry()).toMatchObject({ state: "migrating", version: 2, target: 3 });
    expect(await cut.open({ version: 3, migrations })).toEqual({ ok: true, restored: true });
    expect(await cut.entry()).toMatchObject({ state: "ready", version: 3 });
    expect(snapshot(cut)).toBe(snapshot(clean));
  });

  it("resumes when the stop came before the first step of a version, with the entry at the version below", async () => {
    const w = await world();
    await w.open({ version: 1 });
    await w.put({ state: "migrating", version: 1, target: 2 });
    const rec = recording(w.e);
    expect(await w.open({ version: 2, migrations: { "2": ["MATCH (p:Person) SET p.done = true"] } })).toEqual({ ok: true, restored: true });
    expect(rec.statements.some((s) => s.includes("p.done"))).toBe(true);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 2 });
  });

  it("changes nothing for a version the application gives no migration for", async () => {
    const w = await world();
    await w.open({ version: 1 });
    const replaced = w.storage.replaced;
    expect(await w.open({ version: 2, migrations: {} })).toMatchObject({ ok: false, reason: "migration-failed" });
    expect(w.storage.replaced).toBe(replaced);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 1 });
  });
});

describe("a migration older code cannot finish", () => {
  it("does not report a half-migrated store ready: store-newer, untouched, however the older code's version compares with the entry's", async () => {
    const w = await world();
    await w.open({ version: 1 });
    await w.put({ state: "migrating", version: 1, target: 2 });
    const rec = recording(w.e);
    const replaced = w.storage.replaced;
    expect(await w.open({ version: 1 })).toMatchObject({ ok: false, reason: "store-newer" });
    expect(writes(rec)).toEqual([]);
    expect(w.storage.replaced).toBe(replaced);
    expect(await w.entry()).toMatchObject({ state: "migrating", version: 1, target: 2 });
  });
});

describe("failures write nothing (FR-014)", () => {
  it.each([
    ["importing", { state: "importing" }, "import-interrupted"],
    ["a newer version", { state: "ready", version: 5 }, "store-newer"],
  ] as const)("%s fails %s with no data write and no catalog write", async (_name, entry, reason) => {
    const w = await world();
    await w.open();
    await w.put(entry);
    const rec = recording(w.e);
    const replaced = w.storage.replaced;
    expect(await w.open()).toMatchObject({ ok: false, reason });
    expect(writes(rec)).toEqual([]);
    expect(w.storage.replaced).toBe(replaced);
  });

  it("a catalog that does not parse fails every application open and is not written over", async () => {
    const w = await world();
    await w.open();
    await w.storage.replace("{truncated");
    const replaced = w.storage.replaced;
    expect(await w.open()).toMatchObject({ ok: false, reason: "store-unreadable" });
    expect(await w.open({ intent: "reset" })).toMatchObject({ ok: false, reason: "store-unreadable" });
    expect(await w.storage.read()).toBe("{truncated");
    expect(w.storage.replaced).toBe(replaced);
    await w.catalog.reset();
    expect(await w.open()).toMatchObject({ ok: false, reason: "store-unmarked" });
  });

  it("a catalog of a newer format fails every application open as store-newer and is not written over", async () => {
    const w = await world();
    await w.open();
    const text = JSON.stringify({ format: 2, graphs: {} });
    await w.storage.replace(text);
    expect(await w.open()).toMatchObject({ ok: false, reason: "store-newer" });
    expect(await w.open({ intent: "reset" })).toMatchObject({ ok: false, reason: "store-newer" });
    expect(await w.storage.read()).toBe(text);
  });
});
