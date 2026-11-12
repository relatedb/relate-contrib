// covers-ra: FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-027, SC-001, SC-002, SC-003
import { beforeEach, describe, expect, it } from "vitest";
import { createDataProvider, ProviderError } from "../../src/index.js";
import { companies, people, projects, schema } from "../helpers/fixture.js";
import { loadFixture, testClient, type TestClient } from "../helpers/in-process-client.js";

let client: TestClient;
let provider: ReturnType<typeof createDataProvider>;

beforeEach(async () => {
  client = await testClient();
  loadFixture(client);
  provider = createDataProvider(client, schema);
});

const page = (pageNo = 1, perPage = 100) => ({ page: pageNo, perPage });
const asc = (field: string) => ({ field, order: "ASC" as const });
const desc = (field: string) => ({ field, order: "DESC" as const });
const ids = (r: { data: Array<{ id: unknown }> }) => r.data.map((x) => x.id);
const rejection = async (p: Promise<unknown>): Promise<ProviderError> => {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error("expected a rejection");
};
/** Statements sent after the one-time constraint statements. */
const dataStatements = () => client.statements().filter((s) => !s.startsWith("CREATE CONSTRAINT"));

describe("getList", () => {
  it("orders by id when no sort is given and totals the label's nodes (scenario 1)", async () => {
    const r = await provider.getList("people", { pagination: page(), sort: undefined as never, filter: {} });
    expect(ids(r)).toEqual(people.map((p) => p.id).sort());
    expect(r.total).toBe(people.length);
  });

  it("pages through a sort with ties and returns every record once, ascending and descending (scenario 2, SC-003)", async () => {
    for (const sort of [asc("age"), desc("age")]) {
      const seen: unknown[] = [];
      for (let p = 1; p <= 6; p++) seen.push(...ids(await provider.getList("people", { pagination: page(p, 2), sort, filter: {} })));
      expect(seen).toHaveLength(people.length);
      expect(new Set(seen).size).toBe(people.length);
    }
    const first = await provider.getList("people", { pagination: page(1, 12), sort: asc("age"), filter: {} });
    const tie = ids(first).filter((i) => ["p03", "p04", "p05"].includes(String(i)));
    expect(tie).toEqual(["p03", "p04", "p05"]); // ties are broken by id
  });

  it("breaks ties on id even when the engine would return them in another order (scenario 2, FR-010)", async () => {
    // created in reverse id order, all with the same sort value, so insertion order and id order differ
    for (const id of ["z9", "z8", "z7"]) client.raw("CREATE (:Company {id: $id, name: $id, founded: 2020})", { id });
    for (const order of [asc("founded"), desc("founded")]) {
      const r = await provider.getList("companies", { pagination: page(1, 100), sort: order, filter: { founded: 2020 } });
      expect(ids(r)).toEqual(["z7", "z8", "z9"]);
    }
    const oneAtATime: unknown[] = [];
    for (let p = 1; p <= 3; p++) oneAtATime.push(...ids(await provider.getList("companies", { pagination: page(p, 1), sort: asc("founded"), filter: { founded: 2020 } })));
    expect(oneAtATime).toEqual(["z7", "z8", "z9"]);
  });

  it("filters with a comparison suffix, and the total counts only the matches (scenario 3)", async () => {
    const r = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { age_gte: 36 } });
    const expected = people.filter((p) => (p.age ?? -1) >= 36).map((p) => p.id);
    expect(ids(r)).toEqual(expected);
    expect(r.total).toBe(expected.length);
    const lt = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { age_lt: 28 } });
    expect(ids(lt)).toEqual(["p07", "p10"]);
    const neq = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { title_neq: "engineer" } });
    expect(neq.total).toBe(people.filter((p) => p.title !== "engineer").length);
  });

  it("searches q in any letter case across the searchable fields (scenario 4)", async () => {
    const byName = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { q: "ADA" } });
    expect(ids(byName)).toEqual(["p01", "p02"]);
    const byTitle = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { q: "Analyst" } });
    expect(ids(byTitle)).toEqual(["p02", "p09"]);
  });

  it("combines filter terms with AND and treats an array as membership", async () => {
    const r = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { title: ["engineer", "designer"], active: true } });
    expect(ids(r)).toEqual(people.filter((p) => ["engineer", "designer"].includes(p.title) && p.active).map((p) => p.id));
    expect((await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { title: [] } })).total).toBe(0);
  });

  it("rejects an undeclared sort or filter name with 400 and sends no statement (scenario 5)", async () => {
    for (const call of [
      () => provider.getList("people", { pagination: page(), sort: asc("salary"), filter: {} }),
      () => provider.getList("people", { pagination: page(), sort: asc("title"), filter: {} }), // declared, but not sortable
      () => provider.getList("people", { pagination: page(), sort: asc("id"), filter: { salary: 1 } }),
      () => provider.getList("people", { pagination: page(), sort: asc("id"), filter: { salary_gte: 1 } }),
      () => provider.getList("companies", { pagination: page(), sort: asc("id"), filter: { active: true } }),
      () => provider.getList("people", { pagination: page(), sort: asc("id"), filter: { company_gte: "c1" } }),
    ]) {
      const e = await rejection(call());
      expect(e).toBeInstanceOf(ProviderError);
      expect(e.status).toBe(400);
    }
    expect(client.calls).toHaveLength(0);
  });

  it("rejects a field that is declared but not filterable", async () => {
    const e = await rejection(provider.getList("people", { pagination: page(), sort: asc("id"), filter: { q: "x", nothing: 1 } }));
    expect(e.status).toBe(400);
    const s = structuredClone(schema);
    s.resources.people!.fields.find((f) => f.name === "age")!.filterable = false;
    const strict = createDataProvider(client, s);
    const e2 = await rejection(strict.getList("people", { pagination: page(), sort: asc("id"), filter: { age: 30 } }));
    expect(e2.status).toBe(400);
    expect(e2.message).toMatch(/age/);
  });

  it("matches statement text in a value as plain data and builds the same statement as for an ordinary value (scenario 6, SC-002)", async () => {
    const hostile = ['x" RETURN 1 //', "x`) DETACH DELETE n //", "'; MATCH (n) DETACH DELETE n //", "$q}) RETURN 1 //"];
    await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { name: "ordinary", q: "ordinary", title_neq: "ordinary" } });
    const ordinary = dataStatements();
    client.reset();
    for (const value of hostile) {
      const r = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { name: value, q: value, title_neq: value } });
      expect(r.total).toBe(0); // the name matches no one, so the combination matches no one
      expect(r.data).toEqual([]);
      expect(dataStatements().slice(-2)).toEqual(ordinary);
      expect(JSON.stringify(client.calls.map((c) => c.params))).toContain(JSON.stringify(value).slice(1, -1));
    }
    // the data is untouched
    expect(client.raw("MATCH (n:Person) RETURN count(n) AS c")[0]!.c).toBe(people.length);
  });

  it("rejects a hostile sort or filter name with 400 (scenario 6, SC-002)", async () => {
    for (const name of ['name" RETURN 1 //', "name`, n.secret", "n) DETACH DELETE n //"]) {
      expect((await rejection(provider.getList("people", { pagination: page(), sort: asc(name), filter: {} }))).status).toBe(400);
      expect((await rejection(provider.getList("people", { pagination: page(), sort: asc("id"), filter: { [name]: 1 } }))).status).toBe(400);
    }
    expect(client.calls).toHaveLength(0);
  });

  it("filters by a reference field with one id and with several (scenario 7)", async () => {
    const one = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { company: "c3" } });
    expect(ids(one)).toEqual(people.filter((p) => p.company === "c3").map((p) => p.id));
    const many = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { company: ["c3", "c2"] } });
    expect(ids(many)).toEqual(people.filter((p) => ["c3", "c2"].includes(p.company ?? "")).map((p) => p.id));
    expect(many.total).toBe(ids(many).length);
  });

  it("returns a record with the declared properties, each reference filled, nulls for what is absent and no engine id (scenario 9, SC-001)", async () => {
    const r = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: {} });
    const jo = r.data.find((x) => x.id === "p11")!;
    expect(jo).toEqual({ id: "p11", name: "Jo", title: "manager", age: null, active: true, company: "c3" });
    const gus = r.data.find((x) => x.id === "p08")!;
    expect(gus.company).toBeNull();
    for (const rec of r.data) expect(Object.keys(rec).sort()).toEqual(["active", "age", "company", "id", "name", "title"]);
    const proj = await provider.getList("projects", { pagination: page(), sort: asc("id"), filter: {} });
    expect(proj.data.find((x) => x.id === "j4")).toEqual({ id: "j4", name: "Delta", status: "planned", budget: 400, company: "c3", lead: null });
  });

  it("sends exactly two statements once the constraints exist, and the first call sends the constraints first and not again", async () => {
    await provider.getList("people", { pagination: page(), sort: asc("id"), filter: {} });
    const first = client.statements();
    expect(first.slice(0, 3).every((s) => s.startsWith("CREATE CONSTRAINT"))).toBe(true);
    expect(first).toHaveLength(3 + 2);
    client.reset();
    await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { age_gt: 20 } });
    expect(client.statements()).toHaveLength(2);
  });

  it("rejects values that do not convert to the declared type with 400", async () => {
    for (const filter of [{ age: "abc" }, { age_gte: "x" }, { active: "maybe" }, { name: 5 }, { age: [1, "z"] }]) {
      const e = await rejection(provider.getList("people", { pagination: page(), sort: asc("id"), filter }));
      expect(e.status).toBe(400);
    }
  });

  it("converts numeric and boolean strings to the declared type", async () => {
    const r = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: { age_gte: "45", active: "true" } });
    expect(ids(r)).toEqual(["p06", "p08"]);
  });

  it("never splits a declared field whose name ends in a suffix", async () => {
    const s = structuredClone(schema);
    s.resources.companies!.fields.push({ name: "rank_gt", type: "number", filterable: true, sortable: true });
    client.raw("MATCH (c:Company {id: 'c1'}) SET c.rank_gt = 5");
    client.raw("MATCH (c:Company {id: 'c2'}) SET c.rank_gt = 9");
    const p = createDataProvider(client, s);
    const exact = await p.getList("companies", { pagination: page(), sort: asc("id"), filter: { rank_gt: 5 } });
    expect(ids(exact)).toEqual(["c1"]); // equality on the declared field, not "rank > 5"
    const split = await p.getList("companies", { pagination: page(), sort: asc("id"), filter: { rank_gt_gt: 5 } });
    expect(ids(split)).toEqual(["c2"]); // the suffix is removed because "rank_gt" is a declared filterable field
  });

  it("returns a record once even when a node has two relationships of a reference's type (the fill takes one target)", async () => {
    client.raw("MATCH (p:Person {id: 'p01'}), (c:Company {id: 'c2'}) CREATE (p)-[:WORKS_AT]->(c)");
    const r = await provider.getList("people", { pagination: page(), sort: asc("id"), filter: {} });
    expect(r.data.filter((x) => x.id === "p01")).toHaveLength(1);
    expect(r.data).toHaveLength(people.length);
    expect(["c1", "c2"]).toContain(r.data.find((x) => x.id === "p01")!.company);
  });

  it("returns no records and the same total for a page past the end", async () => {
    const r = await provider.getList("people", { pagination: page(50, 10), sort: asc("id"), filter: {} });
    expect(r.data).toEqual([]);
    expect(r.total).toBe(people.length);
  });

  it("rejects an unknown resource and invalid paging", async () => {
    expect((await rejection(provider.getList("nothing", { pagination: page(), sort: asc("id"), filter: {} }))).status).toBe(404);
    expect((await rejection(provider.getList("people", { pagination: { page: 0, perPage: 10 }, sort: asc("id"), filter: {} }))).status).toBe(400);
    expect((await rejection(provider.getList("people", { pagination: { page: 1, perPage: 1.5 }, sort: asc("id"), filter: {} }))).status).toBe(400);
  });

  it("lists every resource in the schema", async () => {
    expect((await provider.getList("companies", { pagination: page(), sort: asc("name"), filter: {} })).total).toBe(companies.length);
    expect((await provider.getList("projects", { pagination: page(), sort: desc("budget"), filter: { status: "active" } })).data.map((x) => x.id)).toEqual(["j2", "j1"]);
    expect(projects).toHaveLength(4);
  });
});

describe("getOne and getMany", () => {
  it("getOne returns the record for an id and 404 for none", async () => {
    const r = await provider.getOne("people", { id: "p01" });
    expect(r.data).toEqual({ id: "p01", name: "Ada", title: "engineer", age: 36, active: true, company: "c1" });
    const e = await rejection(provider.getOne("people", { id: "nope" }));
    expect(e.status).toBe(404);
  });

  it("getMany returns the records found and leaves missing ids out", async () => {
    const r = await provider.getMany("people", { ids: ["p03", "nope", "p01"] });
    expect(ids(r)).toEqual(["p01", "p03"]);
    expect((await provider.getMany("people", { ids: [] })).data).toEqual([]);
  });
});

describe("getManyReference", () => {
  it("returns the same records as getList with the reference filter fixed (scenario 8)", async () => {
    const viaTarget = await provider.getManyReference("people", { target: "company", id: "c2", pagination: page(), sort: asc("name"), filter: {} });
    const viaFilter = await provider.getList("people", { pagination: page(), sort: asc("name"), filter: { company: "c2" } });
    expect(viaTarget).toEqual(viaFilter);
    expect(viaTarget.total).toBe(people.filter((p) => p.company === "c2").length);
  });

  it("combines the fixed reference with the caller's filter", async () => {
    const r = await provider.getManyReference("people", { target: "company", id: "c2", pagination: page(), sort: asc("id"), filter: { title: "engineer" } });
    expect(ids(r)).toEqual(["p03"]);
  });

  it("rejects a target that is not a declared reference", async () => {
    expect((await rejection(provider.getManyReference("people", { target: "name", id: "x", pagination: page(), sort: asc("id"), filter: {} }))).status).toBe(400);
    expect((await rejection(provider.getManyReference("people", { target: "nothing", id: "x", pagination: page(), sort: asc("id"), filter: {} }))).status).toBe(400);
  });
});
