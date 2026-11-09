// covers-app: FR-021, FR-022, FR-023, SC-006
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ImportRejected, exportApplication, importApplication, type ImportContext } from "../../../src/worker/application/transfer.js";
import { openApplication } from "../../../src/worker/application/lifecycle.js";
import { readMarkers } from "../../../src/worker/application/marker.js";
import { input, query, realEngine, recording, seed } from "./helpers.js";

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({ name: "app", version: 1, indexes: [{ label: "Person", property: "name" }], migrations: {}, ...over });
const app = { name: "app", version: 1 };

async function ready(version = 1) {
  const e = await realEngine();
  openApplication(e, input({ version }));
  return e;
}

describe("the export envelope", () => {
  it("matches the schema, skips the marker, and carries every node and link across batches", async () => {
    const e = await ready();
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
    expect(envelope!.document.nodes.some((n) => n.labels?.includes("_RelateApplication"))).toBe(false);
    expect(envelope!.document.links.find((l) => l.type === "NEXT")).toMatchObject({ source: "b1", target: "b2", properties: { w: 1.5 } });
  });
});

describe("a round trip", () => {
  it("export, import into a reset store, export again gives identical documents", async () => {
    const e = await ready();
    query(e, "CREATE (:Person {id: 'v', name: 'Visitor', tags: ['a', 'b'], ok: true, f: 1.5})");
    query(e, "MATCH (a:Person {id: 'v'}), (b:Person {id: 'a'}) CREATE (a)-[:KNOWS {since: 2020}]->(b)");
    const first = exportApplication(e, app, false).envelope!;
    const other = await ready();
    query(other, "CREATE (:Mine {id: 'will-go'})");
    importApplication(other, ctx(), first);
    const second = exportApplication(other, app, false).envelope!;
    expect(second).toEqual(first);
    expect(query(other, "MATCH (m:Mine) RETURN count(m) AS c").rows[0]!.c).toBe(0);
    expect(readMarkers(other)).toEqual([{ format: 1, version: 1, state: "ready" }]);
    expect(query(other, "SHOW INDEXES").rows.map((r) => r.name)).toContain("Person_name");
  });
});

describe("import", () => {
  const good = async () => exportApplication(await ready(), app, false).envelope!;
  const unchanged = async (envelope: unknown, message: RegExp) => {
    const e = await ready();
    query(e, "CREATE (:Mine {id: 'keep'})");
    const before = query(e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c;
    const rec = recording(e);
    expect(() => importApplication(e, ctx(), envelope)).toThrow(message);
    expect(query(e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c).toBe(before);
    expect(readMarkers(e)[0]!.state).toBe("ready");
    expect(rec.statements.filter((s) => /CREATE|SET|DELETE|reset/i.test(s))).toEqual([]);
  };

  it("rejects another application, a newer version, a wrong format or version, and an invalid document, leaving the store as it is", async () => {
    const g = await good();
    await unchanged({ ...g, application: { name: "other", version: 1 } }, /not "app"/);
    await unchanged({ ...g, application: { name: "app", version: 5 } }, /newer than this code's 1/);
    await unchanged({ ...g, format: "something" }, /relate-application-export/);
    await unchanged({ ...g, version: 2 }, /format version/);
    await unchanged({ ...g, document: { version: 1, nodes: [{ labels: ["X"] }], links: [] } }, /id/);
    await unchanged({ ...g, document: { version: 1, nodes: [{ id: "m", labels: ["_RelateApplication"] }], links: [] } }, /reserved/);
    expect(ImportRejected.name).toBe("ImportRejected");
  });

  it("validates before it writes, then marks importing, resets, loads, marks ready and migrates", async () => {
    const g = await good();
    const e = await ready(2);
    const rec = recording(e);
    importApplication(e, ctx({ version: 2, migrations: { "2": ["MATCH (p:Person) SET p.migrated = true"] } }), g);
    const writes = rec.statements.filter((s) => /CREATE|SET|DELETE/.test(s));
    expect(writes[0]).toMatch(/SET m\.state/);
    expect(rec.statements.indexOf(writes[0]!)).toBeGreaterThan(-1);
    expect(readMarkers(e)).toEqual([{ format: 1, version: 2, state: "ready" }]);
    expect(query(e, "MATCH (p:Person) WHERE p.migrated RETURN count(p) AS c").rows[0]!.c).toBe(2);
  });

  it("does not export first", async () => {
    const g = await good();
    const e = await ready();
    const rec = recording(e);
    importApplication(e, ctx(), g);
    expect(rec.statements.some((s) => s.includes("valueType"))).toBe(false);
  });

  it("an interruption after the importing marker leaves it, and the next open fails import-interrupted", async () => {
    const g = await good();
    const e = await ready();
    const execute = e.execute.bind(e);
    let creates = 0;
    e.execute = (s, p = null) => {
      if (s.startsWith("UNWIND $rows AS row CREATE") && ++creates === 1) throw new Error("terminated");
      return execute(s, p);
    };
    expect(() => importApplication(e, ctx(), g)).toThrow(/terminated/);
    e.execute = execute;
    expect(readMarkers(e)[0]!.state).toBe("importing");
    expect(openApplication(e, input())).toMatchObject({ ok: false, reason: "import-interrupted" });
    void seed;
  });
});
