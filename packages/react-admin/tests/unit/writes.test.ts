// covers-ra: FR-012, FR-013, FR-014, FR-015, FR-016, FR-027, SC-001
import { beforeEach, describe, expect, it } from "vitest";
import { createDataProvider, ProviderError } from "../../src/index.js";
import { people, schema } from "../helpers/fixture.js";
import { loadFixture, testClient, type TestClient } from "../helpers/in-process-client.js";

let client: TestClient;
let provider: ReturnType<typeof createDataProvider>;

beforeEach(async () => {
  client = await testClient();
  loadFixture(client);
  provider = createDataProvider(client, schema);
  await provider.getOne("people", { id: "p01" }); // makes the constraints, so statement counts below start clean
  client.reset();
});

const rejection = async (p: Promise<unknown>): Promise<ProviderError> => {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error("expected a rejection");
};

/** Every node and relationship, so a rejected write can be shown to have changed nothing. */
const snapshot = (): string => {
  const nodes = client.raw("MATCH (n) RETURN labels(n) AS l, n AS n ORDER BY n.id").map((r) => JSON.stringify([r.l, r.n.properties]));
  const rels = client.raw("MATCH (a)-[r]->(b) RETURN a.id AS a, type(r) AS t, b.id AS b ORDER BY a, t, b").map((r) => JSON.stringify(r));
  return JSON.stringify({ nodes, rels });
};
const companyOf = (id: string) => client.raw("MATCH (p:Person {id: $id}) OPTIONAL MATCH (p)-[:WORKS_AT]->(c) RETURN c.id AS c", { id }).map((r) => r.c);
const count = (cypher: string, params: Record<string, unknown> = {}) => client.raw(cypher, params)[0]!.n as number;

describe("create", () => {
  it("generates a unique string id, sets the declared fields and creates the relationship for each supplied reference (scenario 1)", async () => {
    const a = await provider.create("projects", { data: { name: "Echo", status: "planned", budget: 10, company: "c1", lead: "p02" } });
    const b = await provider.create("projects", { data: { name: "Foxtrot" } });
    expect(typeof a.data.id).toBe("string");
    expect(a.data.id).not.toBe(b.data.id);
    expect(a.data).toEqual({ id: a.data.id, name: "Echo", status: "planned", budget: 10, company: "c1", lead: "p02" });
    expect(b.data).toEqual({ id: b.data.id, name: "Foxtrot", status: null, budget: null, company: null, lead: null });
    expect(client.raw("MATCH (j:Project {id: $id})-[:OWNED_BY]->(c), (j)-[:LED_BY]->(p) RETURN c.id AS c, p.id AS p", { id: a.data.id })).toEqual([{ c: "c1", p: "p02" }]);
    expect((await provider.getOne("projects", { id: a.data.id })).data).toEqual(a.data);
  });

  it("uses a supplied id, and rejects 400 an id that already exists without creating a second node", async () => {
    const made = await provider.create("people", { data: { id: "custom-1", name: "Zed" } });
    expect(made.data.id).toBe("custom-1");
    const before = snapshot();
    const e = await rejection(provider.create("people", { data: { id: "custom-1", name: "Again" } }));
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/already exists/);
    expect(snapshot()).toBe(before);
    expect(count("MATCH (p:Person {id: 'custom-1'}) RETURN count(p) AS n")).toBe(1);
  });

  it("rejects 400 naming the field when a reference target does not exist, and creates nothing (scenario 6)", async () => {
    const before = snapshot();
    const e = await rejection(provider.create("people", { data: { name: "Nobody", company: "nope" } }));
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/company/);
    expect(snapshot()).toBe(before);
  });

  it("rejects 400 and names the fields when the data holds only undeclared fields, and ignores them beside declared ones (scenario 8)", async () => {
    const e = await rejection(provider.create("people", { data: { salary: 1, nickname: "x" } }));
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/salary/);
    expect(e.message).toMatch(/nickname/);
    const ok = await provider.create("people", { data: { name: "Quinn", salary: 5 } });
    expect(client.raw("MATCH (p:Person {id: $id}) RETURN p", { id: ok.data.id })[0]!.p.properties).not.toHaveProperty("salary");
  });

  it("converts values to the declared types and rejects one that does not convert", async () => {
    const r = await provider.create("people", { data: { name: "Rae", age: "42", active: "false" } });
    expect(r.data).toMatchObject({ age: 42, active: false });
    expect((await rejection(provider.create("people", { data: { name: "Bad", age: "abc" } }))).status).toBe(400);
  });
});

describe("update", () => {
  it("replaces a reference so exactly one relationship of the type exists afterwards (scenario 2)", async () => {
    const r = await provider.update("people", { id: "p01", data: { name: "Ada Two", company: "c3" }, previousData: {} as never });
    expect(r.data).toMatchObject({ id: "p01", name: "Ada Two", company: "c3" });
    expect(client.raw("MATCH (p:Person {id: 'p01'})-[r:WORKS_AT]->(c) RETURN c.id AS c, count(r) AS n")).toEqual([{ c: "c3", n: 1 }]);
  });

  it("clears a reference with null or an empty value, keeping the node, and reads back null (scenario 3)", async () => {
    for (const value of [null, ""]) {
      await provider.update("people", { id: "p01", data: { company: "c2" }, previousData: {} as never });
      const r = await provider.update("people", { id: "p01", data: { company: value }, previousData: {} as never });
      expect(r.data.company).toBeNull();
      expect(companyOf("p01")).toEqual([null]);
      expect(count("MATCH (p:Person {id: 'p01'}) RETURN count(p) AS n")).toBe(1);
    }
  });

  it("clears a declared field with null", async () => {
    const r = await provider.update("people", { id: "p01", data: { age: null }, previousData: {} as never });
    expect(r.data.age).toBeNull();
    expect(client.raw("MATCH (p:Person {id: 'p01'}) RETURN p")[0]!.p.properties).not.toHaveProperty("age");
  });

  it("leaves a reference alone when the data does not supply it", async () => {
    const r = await provider.update("people", { id: "p01", data: { name: "Only a name" }, previousData: {} as never });
    expect(r.data.company).toBe("c1");
    expect(companyOf("p01")).toEqual(["c1"]);
  });

  it("replaces two references of a project together", async () => {
    const r = await provider.update("projects", { id: "j1", data: { company: "c3", lead: "p05" }, previousData: {} as never });
    expect(r.data).toMatchObject({ company: "c3", lead: "p05" });
    expect(client.raw("MATCH (j:Project {id: 'j1'})-[a:OWNED_BY]->(c), (j)-[b:LED_BY]->(p) RETURN c.id AS c, p.id AS p, count(a) AS na, count(b) AS nb")).toEqual([{ c: "c3", p: "p05", na: 1, nb: 1 }]);
    const mixed = await provider.update("projects", { id: "j2", data: { company: "c1", lead: null }, previousData: {} as never });
    expect(mixed.data).toMatchObject({ company: "c1", lead: null });
  });

  it("changes nothing and rejects 400 naming the field when a reference target does not exist (scenario 6)", async () => {
    const before = snapshot();
    const e = await rejection(provider.update("people", { id: "p01", data: { name: "ZZZ", company: "nope" }, previousData: {} as never }));
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/company/);
    expect(snapshot()).toBe(before); // the name is unchanged and the old relationship is still there
  });

  it("rejects 404 for an id with no node, with and without references (scenario 7)", async () => {
    expect((await rejection(provider.update("people", { id: "nope", data: { name: "x" }, previousData: {} as never }))).status).toBe(404);
    expect((await rejection(provider.update("people", { id: "nope", data: { company: "c1" }, previousData: {} as never }))).status).toBe(404);
  });

  it("ignores an id in the data: the record's id does not change", async () => {
    const r = await provider.update("people", { id: "p01", data: { id: "hijack", name: "Same" }, previousData: {} as never });
    expect(r.data.id).toBe("p01");
    expect(count("MATCH (p:Person {id: 'hijack'}) RETURN count(p) AS n")).toBe(0);
  });

  it("rejects 400 when the data holds only undeclared fields, and ignores them beside declared ones (scenario 8)", async () => {
    expect((await rejection(provider.update("people", { id: "p01", data: { id: "p01", salary: 1 }, previousData: {} as never }))).status).toBe(400);
    const r = await provider.update("people", { id: "p01", data: { name: "Kept", salary: 1 }, previousData: {} as never });
    expect(r.data.name).toBe("Kept");
    expect(client.raw("MATCH (p:Person {id: 'p01'}) RETURN p")[0]!.p.properties).not.toHaveProperty("salary");
  });
});

describe("updateMany and deleteMany", () => {
  it("apply the same data to every id as one statement, and answer the ids changed (scenario 4, FR-012)", async () => {
    const r = await provider.updateMany("people", { ids: ["p01", "p02", "nope"], data: { active: false, company: "c3" } });
    expect(r.data).toEqual(["p01", "p02"]);
    expect(client.statements()).toHaveLength(1);
    expect(companyOf("p01")).toEqual(["c3"]);
    expect(companyOf("p02")).toEqual(["c3"]);
    expect(client.raw("MATCH (p:Person) WHERE p.id IN ['p01', 'p02'] RETURN p.active AS a").map((x) => x.a)).toEqual([false, false]);
  });

  it("answer an empty list when no id matches, and reject 400 for a missing reference target", async () => {
    expect((await provider.updateMany("people", { ids: ["nope"], data: { active: false } })).data).toEqual([]);
    const before = snapshot();
    const e = await rejection(provider.updateMany("people", { ids: ["p01", "p02"], data: { company: "nope" } }));
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/company/);
    expect(snapshot()).toBe(before);
  });

  it("deleteMany removes every id that exists as one statement and answers the ids removed (scenario 4, FR-012)", async () => {
    client.reset();
    const r = await provider.deleteMany("people", { ids: ["p01", "nope", "p03"] });
    expect(r.data).toEqual(["p01", "p03"]);
    expect(client.statements()).toHaveLength(1);
    expect(count("MATCH (p:Person) WHERE p.id IN ['p01', 'p03'] RETURN count(p) AS n")).toBe(0);
    expect(count("MATCH (p:Person) RETURN count(p) AS n")).toBe(people.length - 2);
  });
});

describe("delete", () => {
  it("removes a company that people refer to and its relationships, leaving them with an empty company (scenario 5, FR-015)", async () => {
    const r = await provider.delete("companies", { id: "c1" });
    expect(r.data).toEqual({ id: "c1" });
    expect(count("MATCH (c:Company {id: 'c1'}) RETURN count(c) AS n")).toBe(0);
    expect(count("MATCH ()-[r:WORKS_AT]->(:Company {id: 'c1'}) RETURN count(r) AS n")).toBe(0);
    expect(companyOf("p01")).toEqual([null]);
    expect((await provider.getOne("people", { id: "p01" })).data.company).toBeNull();
    expect(count("MATCH (p:Person) RETURN count(p) AS n")).toBe(people.length);
  });

  it("rejects 404 for an id with no node (scenario 7)", async () => {
    expect((await rejection(provider.delete("companies", { id: "nope" }))).status).toBe(404);
  });
});

describe("statements and atomicity", () => {
  it("a write is one statement, then one read of the record; a write that matches nothing adds at most one cause read per check (FR-012)", async () => {
    await provider.update("people", { id: "p01", data: { name: "N", company: "c2" }, previousData: {} as never });
    expect(client.statements()).toHaveLength(2); // the write, then the record read back
    client.reset();
    await rejection(provider.update("people", { id: "nope", data: { name: "x", company: "c1" }, previousData: {} as never }));
    expect(client.statements()).toHaveLength(2); // the write (no rows), then the check that the node exists
    client.reset();
    await provider.delete("people", { id: "p02" });
    expect(client.statements()).toHaveLength(1);
  });

  it("a rejected write leaves the graph as it was", async () => {
    const before = snapshot();
    for (const call of [
      () => provider.create("people", { data: { name: "x", company: "nope" } }),
      () => provider.update("people", { id: "p01", data: { name: "x", company: "nope" }, previousData: {} as never }),
      () => provider.update("people", { id: "nope", data: { name: "x" }, previousData: {} as never }),
      () => provider.create("people", { data: { id: "p01", name: "dup" } }),
      () => provider.create("people", { data: { age: "not a number" } }),
    ]) {
      await rejection(call());
    }
    expect(snapshot()).toBe(before);
  });
});
