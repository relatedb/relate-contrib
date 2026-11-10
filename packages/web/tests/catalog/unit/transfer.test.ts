// covers-cat: FR-004, FR-007, SC-005
import { describe, expect, it } from "vitest";
import { exportApplication, importApplication, type ImportContext } from "../../../src/worker/application/transfer.js";
import { NAME, STORE, query, timeline, world, type World } from "../../application/unit/helpers.js";

const ctx = (w: World, over: Partial<ImportContext> = {}): ImportContext => ({ catalog: w.catalog, store: STORE, name: NAME, version: 1, indexes: [{ label: "Person", property: "name" }], migrations: {}, ...over });
const app = { name: NAME, version: 1 };

async function ready(over: Parameters<World["open"]>[0] = {}): Promise<World> {
  const w = await world();
  await w.open(over);
  return w;
}

describe("import", () => {
  it("writes importing before the reset, ready with the envelope's version and seeded, and migrates when below the code's", async () => {
    const source = await ready();
    const envelope = exportApplication(source.e, app, false).envelope!;
    const w = await ready({ version: 2, migrations: { "2": ["RETURN 1"] } });
    const events = timeline(w);
    await importApplication(w.e, ctx(w, { version: 2, migrations: { "2": ["MATCH (p:Person) SET p.migrated = true"] } }), envelope);
    const marks = events.filter((s) => /^catalog:|reset|UNWIND \$rows AS row CREATE \(n/.test(s)).map((s) => (s.startsWith("catalog:") ? s.replace("catalog: app-test ", "") : s.startsWith("engine: reset") ? "reset" : "load"));
    expect(marks).toEqual(["importing v1", "reset", "load", "ready v1", "migrating v1", "ready v2"]);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 2, seeded: true });
  });

  it("records seeded false for a document with no nodes", async () => {
    const w = await ready();
    const envelope = { format: "relate-application-export", version: 1, application: app, document: { version: 1, nodes: [], links: [] } };
    await importApplication(w.e, ctx(w), envelope);
    expect(await w.entry()).toMatchObject({ state: "ready", seeded: false });
    expect(await w.open()).toEqual({ ok: true, restored: true });
  });

  it("loads a document that uses the old record's label as any other label", async () => {
    const w = await ready();
    const envelope = { format: "relate-application-export", version: 1, application: app, document: { version: 1, nodes: [{ id: "m", labels: ["_RelateApplication"], properties: { x: 1 } }], links: [] } };
    await importApplication(w.e, ctx(w), envelope);
    expect(query(w.e, "MATCH (n:_RelateApplication) RETURN n.x AS x").rows).toEqual([{ x: 1 }]);
  });

  it("a stop between the reset and the load leaves importing, so the next open fails import-interrupted and does not seed over an empty store", async () => {
    const source = await ready();
    const envelope = exportApplication(source.e, app, false).envelope!;
    const w = await ready();
    query(w.e, "CREATE (:Mine {id: 'keep'})");
    const reset = w.e.reset.bind(w.e);
    w.e.reset = () => {
      reset();
      throw new Error("terminated after the reset");
    };
    await expect(importApplication(w.e, ctx(w), envelope)).rejects.toThrow(/terminated/);
    w.e.reset = reset;
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(0);
    expect(await w.entry()).toMatchObject({ state: "importing" });
    expect(await w.open()).toMatchObject({ ok: false, reason: "import-interrupted" });
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(0);
    expect(await w.open({ intent: "reset" })).toEqual({ ok: true, restored: false });
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(2);
  });
});

describe("export", () => {
  it("contains every node and link with nothing filtered out", async () => {
    const w = await ready();
    query(w.e, "UNWIND range(1, 1500) AS i CREATE (:Big {id: 'b' + toString(i)})");
    const { envelope, losses } = exportApplication(w.e, app, false);
    expect(losses).toEqual([]);
    expect(envelope!.document.nodes).toHaveLength(1502);
  });
});
