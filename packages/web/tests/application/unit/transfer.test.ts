// covers-app: FR-021, FR-022, FR-023, SC-006
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ImportRejected, exportApplication, importApplication, type ImportContext } from "../../../src/worker/application/transfer.js";
import { NAME, STORE, query, recording, timeline, world, type World } from "./helpers.js";

const ctx = (w: World, over: Partial<ImportContext> = {}): ImportContext => ({
  catalog: w.catalog,
  store: STORE,
  name: NAME,
  version: 1,
  indexes: [{ label: "Person", property: "name" }],
  migrations: {},
  ...over,
});
const app = { name: NAME, version: 1 };

async function ready(version = 1): Promise<World> {
  const w = await world();
  await w.open({ version, migrations: version > 1 ? Object.fromEntries(Array.from({ length: version - 1 }, (_, i) => [String(i + 2), ["RETURN 1"]])) : {} });
  return w;
}

describe("the export envelope", () => {
  it("matches the schema and carries every node and link across batches", async () => {
    const { e } = await ready();
    query(e, "UNWIND range(1, 2500) AS i CREATE (:Big {id: 'b' + toString(i), n: i})");
    query(e, "MATCH (a:Big {id: 'b1'}), (b:Big {id: 'b2'}) CREATE (a)-[:NEXT {w: 1.5}]->(b)");
    const { envelope, losses } = exportApplication(e, app, false);
    expect(losses).toEqual([]);
    const schema = JSON.parse(readFileSync(join(import.meta.dirname, "../../../../../specs/006-application-graphs/contracts/export-envelope.schema.json"), "utf8"));
    delete schema.$schema;
    const Ajv = (await import("ajv/dist/2020.js")).default as unknown as new (o: object) => { compile(s: object): (v: unknown) => boolean };
    expect(new Ajv({ strict: false }).compile(schema)(envelope)).toBe(true);
    expect(envelope!.format).toBe("relate-application-export");
    expect(envelope!.document.nodes).toHaveLength(2502);
    expect(envelope!.document.links.find((l) => l.type === "NEXT")).toMatchObject({ source: "b1", target: "b2", properties: { w: 1.5 } });
  });
});

describe("a round trip", () => {
  it("export, import into a reset store, export again gives identical documents", async () => {
    const { e } = await ready();
    query(e, "CREATE (:Person {id: 'v', name: 'Visitor', tags: ['a', 'b'], ok: true, f: 1.5})");
    query(e, "MATCH (a:Person {id: 'v'}), (b:Person {id: 'a'}) CREATE (a)-[:KNOWS {since: 2020}]->(b)");
    const first = exportApplication(e, app, false).envelope!;
    const other = await ready();
    query(other.e, "CREATE (:Mine {id: 'will-go'})");
    await importApplication(other.e, ctx(other), first);
    const second = exportApplication(other.e, app, false).envelope!;
    expect(second).toEqual(first);
    expect(query(other.e, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(0);
    expect(await other.entry()).toMatchObject({ state: "ready", version: 1, seeded: true });
    expect(query(other.e, "SHOW INDEXES").rows.map((r) => r.name)).toContain("Person_name");
  });
});

describe("import", () => {
  const good = async () => exportApplication((await ready()).e, app, false).envelope!;
  const unchanged = async (envelope: unknown, message: RegExp) => {
    const w = await ready();
    query(w.e, "CREATE (:Mine {id: 'keep'})");
    const before = query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c;
    const rec = recording(w.e);
    const replaced = w.storage.replaced;
    await expect(importApplication(w.e, ctx(w), envelope)).rejects.toThrow(message);
    expect(query(w.e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(before);
    expect((await w.entry())!.state).toBe("ready");
    expect(w.storage.replaced).toBe(replaced);
    expect(rec.statements.filter((s) => /CREATE|SET|DELETE|reset/i.test(s))).toEqual([]);
  };

  it("rejects another application, a newer version, a wrong format or version, and an invalid document, leaving the store as it is", async () => {
    const g = await good();
    await unchanged({ ...g, application: { name: "other", version: 1 } }, /not "test"/);
    await unchanged({ ...g, application: { name: "test", version: 5 } }, /newer than this code's 1/);
    await unchanged({ ...g, format: "something" }, /relate-application-export/);
    await unchanged({ ...g, version: 2 }, /format version/);
    await unchanged({ ...g, document: { version: 1, nodes: [{ labels: ["X"] }], links: [] } }, /id/);
    expect(ImportRejected.name).toBe("ImportRejected");
  });

  it("validates before it writes, then writes importing, resets, loads, writes ready and migrates", async () => {
    const g = await good();
    const w = await ready(2);
    const events = timeline(w);
    await importApplication(w.e, ctx(w, { version: 2, migrations: { "2": ["MATCH (p:Person) SET p.migrated = true"] } }), g);
    const marks = events.filter((s) => /^catalog:|reset|UNWIND \$rows AS row CREATE \(n/.test(s)).map((s) => (s.startsWith("catalog:") ? s.replace("catalog: app-test ", "") : s.startsWith("engine: reset") ? "reset" : "load"));
    expect(marks).toEqual(["importing v1", "reset", "load", "ready v1", "migrating v1", "ready v2"]);
    expect(await w.entry()).toMatchObject({ state: "ready", version: 2 });
    expect(query(w.e, "MATCH (p:Person) WHERE p.migrated RETURN count(p) AS c").rows[0]!.c).toBe(2);
  });

  it("does not export first", async () => {
    const g = await good();
    const w = await ready();
    const rec = recording(w.e);
    await importApplication(w.e, ctx(w), g);
    expect(rec.statements.some((s) => s.includes("valueType"))).toBe(false);
  });

  it("an interruption after the importing entry leaves it, and the next open fails import-interrupted", async () => {
    const g = await good();
    const w = await ready();
    const execute = w.e.execute.bind(w.e);
    let creates = 0;
    w.e.execute = (s, p = null) => {
      if (s.startsWith("UNWIND $rows AS row CREATE") && ++creates === 1) throw new Error("terminated");
      return execute(s, p);
    };
    await expect(importApplication(w.e, ctx(w), g)).rejects.toThrow(/terminated/);
    w.e.execute = execute;
    expect((await w.entry())!.state).toBe("importing");
    expect(await w.open()).toMatchObject({ ok: false, reason: "import-interrupted" });
  });
});
