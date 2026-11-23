// covers-ra: FR-032, FR-010, FR-012, FR-014
// covers-rel: FR-023
// The engine behaviours ADR-008 assumes, run against the real engine (research R2 to R8, R3). These started as the
// probes in specs/008-react-admin-provider/probes/ and stay as tests so a change in the engine shows up here, not in a
// provider statement. A failing case here means a statement form in contracts/statements.md needs its fallback.
import { beforeEach, describe, expect, it } from "vitest";
import { loadFixture, testClient, type TestClient } from "../helpers/in-process-client.js";

let c: TestClient;
beforeEach(async () => {
  c = await testClient();
});

const err = (statement: string, params: Record<string, unknown> = {}): string => {
  try {
    c.raw(statement, params);
  } catch (e) {
    return (e as Error).message;
  }
  return "";
};

describe("reads (R2)", () => {
  beforeEach(() => loadFixture(c));

  it("SKIP and LIMIT accept parameters", () => {
    const rows = c.raw("MATCH (p:Person) RETURN p.id AS id ORDER BY p.id ASC SKIP $skip LIMIT $limit", { skip: 2, limit: 3 });
    expect(rows.map((r) => r.id)).toEqual(["p03", "p04", "p05"]);
  });

  it("case-insensitive contains works with toLower on both sides", () => {
    const rows = c.raw("MATCH (p:Person) WHERE toLower(p.name) CONTAINS toLower($q) RETURN p.id AS id ORDER BY id", { q: "ADA" });
    expect(rows.map((r) => r.id)).toEqual(["p01", "p02"]);
  });

  it("compares numbers and strings, and a comparison across types returns no rows and no error", () => {
    expect(c.raw("MATCH (p:Person) WHERE p.age >= $v RETURN count(p) AS n", { v: 45 })[0]!.n).toBe(2);
    expect(c.raw("MATCH (p:Person) WHERE p.name >= $v RETURN count(p) AS n", { v: "Hal" })[0]!.n).toBeGreaterThan(0);
    expect(c.raw("MATCH (p:Person) WHERE p.name >= $v RETURN p.id AS id", { v: 5 })).toEqual([]);
  });

  it("equality and membership take parameters, and an empty list matches nothing", () => {
    expect(c.raw("MATCH (p:Person) WHERE p.id IN $ids RETURN p.id AS id ORDER BY id", { ids: ["p03", "p01"] }).map((r) => r.id)).toEqual(["p01", "p03"]);
    expect(c.raw("MATCH (p:Person) WHERE p.id IN $ids RETURN p.id AS id", { ids: [] })).toEqual([]);
    expect(c.raw("MATCH (p:Person) WHERE p.id = $id RETURN p.name AS name", { id: "p04" })[0]!.name).toBe("Cy");
  });

  it("RETURN n gives a node value with its properties; its own id is the engine's number, not the application id", () => {
    const node = c.raw("MATCH (p:Person {id: $id}) RETURN p", { id: "p01" })[0]!.p;
    expect(node).toMatchObject({ kind: "node", labels: ["Person"], properties: { id: "p01", name: "Ada", age: 36 } });
    expect(typeof node.id).toBe("number");
  });

  it("a value that looks like statement text is only data", () => {
    expect(c.raw("MATCH (p:Person) WHERE p.name = $v RETURN p.id AS id", { v: 'x" RETURN 1 //' })).toEqual([]);
  });

  it("orders absent values last when ascending and breaks ties on a second key", () => {
    const ids = c.raw("MATCH (p:Person) RETURN p.id AS id ORDER BY p.age ASC, p.id ASC").map((r) => r.id);
    expect(ids.at(-1)).toBe("p11");
    expect(ids.slice(ids.indexOf("p03"), ids.indexOf("p03") + 3)).toEqual(["p03", "p04", "p05"]);
  });

  it("descending order with absent values loses and repeats nothing (R6: where they fall is not asserted)", () => {
    const ids = c.raw("MATCH (p:Person) RETURN p.id AS id ORDER BY p.age DESC, p.id ASC").map((r) => r.id);
    expect(new Set(ids).size).toBe(12);
    expect(ids).toHaveLength(12);
  });

  it("ORDER BY a property of n after the aggregating WITH is accepted (R7)", () => {
    const rows = c.raw(
      `MATCH (n:Person)
       WITH n ORDER BY n.age ASC, n.id ASC SKIP $skip LIMIT $limit
       OPTIONAL MATCH (n)-[:WORKS_AT]->(t0:Company)
       WITH n, head(collect(t0.id)) AS ref0
       RETURN n, ref0 ORDER BY n.age ASC, n.id ASC`,
      { skip: 0, limit: 5 },
    );
    const ages = rows.map((r) => r.n.properties.age as number);
    expect([...ages].sort((a, b) => a - b)).toEqual(ages);
    expect(rows.find((r) => r.n.properties.id === "p07")!.ref0).toBe("c3");
  });

  it("the reference fill with head(collect()) gives one row per node, a plain fill does not when the many-to-one rule is broken (R7)", () => {
    c.raw("MATCH (p:Person {id: 'p01'}), (b:Company {id: 'c2'}) CREATE (p)-[:WORKS_AT]->(b)");
    const plain = c.raw("MATCH (p:Person {id: 'p01'}) OPTIONAL MATCH (p)-[:WORKS_AT]->(t:Company) RETURN p.id AS id, t.id AS ref");
    expect(plain).toHaveLength(2);
    const filled = c.raw("MATCH (p:Person {id: 'p01'}) OPTIONAL MATCH (p)-[:WORKS_AT]->(t:Company) WITH p, head(collect(t.id)) AS ref RETURN p.id AS id, ref");
    expect(filled).toHaveLength(1);
  });

  it("filters by a reference with one id", () => {
    const rows = c.raw("MATCH (p:Person) WHERE EXISTS { (p)-[:WORKS_AT]->(:Company {id: $v}) } RETURN p.id AS id ORDER BY id", { v: "c3" });
    expect(rows.map((r) => r.id)).toEqual(["p05", "p07", "p11"]);
  });

  it("filters by a reference with several ids (R3 open item)", () => {
    const rows = c.raw("MATCH (p:Person) WHERE EXISTS { (p)-[:WORKS_AT]->(t:Company) WHERE t.id IN $v } RETURN p.id AS id ORDER BY id", { v: ["c3", "c2"] });
    expect(rows.map((r) => r.id)).toEqual(["p03", "p04", "p05", "p07", "p09", "p11", "p12"]);
  });
});

describe("writes (R2, R4, R5)", () => {
  beforeEach(() => loadFixture(c));

  it("SET += with a null removes the property", () => {
    c.raw("MATCH (p:Person {id: $id}) SET p += $props", { id: "p01", props: { age: null, name: "Ada2" } });
    const node = c.raw("MATCH (p:Person {id: 'p01'}) RETURN p")[0]!.p;
    expect(node.properties.name).toBe("Ada2");
    expect("age" in node.properties).toBe(false);
  });

  it("one statement removes the old relationship and creates the new one", () => {
    const rows = c.raw(
      `MATCH (n:Person {id: $id}), (t0:Company {id: $r0})
       SET n += $props
       WITH n, t0 OPTIONAL MATCH (n)-[o0:WORKS_AT]->(:Company) DELETE o0
       WITH DISTINCT n, t0 CREATE (n)-[:WORKS_AT]->(t0)
       RETURN n.id AS id`,
      { id: "p01", r0: "c3", props: { name: "Ada2" } },
    );
    expect(rows).toEqual([{ id: "p01" }]);
    const now = c.raw("MATCH (p:Person {id: 'p01'})-[r:WORKS_AT]->(t) RETURN t.id AS t, count(r) AS n");
    expect(now).toEqual([{ t: "c3", n: 1 }]);
  });

  it("matching the node and every target first changes nothing when a target is missing", () => {
    const rows = c.raw(
      `MATCH (n:Person {id: $id}), (t0:Company {id: $r0})
       SET n += $props
       WITH n, t0 OPTIONAL MATCH (n)-[o0:WORKS_AT]->(:Company) DELETE o0
       WITH DISTINCT n, t0 CREATE (n)-[:WORKS_AT]->(t0)
       RETURN n.id AS id`,
      { id: "p01", r0: "nope", props: { name: "ZZZ" } },
    );
    expect(rows).toEqual([]);
    const now = c.raw("MATCH (p:Person {id: 'p01'})-[:WORKS_AT]->(t) RETURN p.name AS n, t.id AS t");
    expect(now).toEqual([{ n: "Ada", t: "c1" }]);
  });

  it("the naive replacement (delete first, match the target after) loses the old relationship when the target is missing", () => {
    const rows = c.raw(
      `MATCH (p:Person {id: $id}) OPTIONAL MATCH (p)-[r:WORKS_AT]->(:Company) DELETE r
       WITH DISTINCT p MATCH (t:Company {id: $cid}) CREATE (p)-[:WORKS_AT]->(t) RETURN p.id AS id`,
      { id: "p01", cid: "nope" },
    );
    expect(rows).toEqual([]);
    expect(c.raw("MATCH (p:Person {id: 'p01'})-[:WORKS_AT]->(t) RETURN t.id AS t")).toEqual([]);
  });

  it("two references are replaced together, each ending with one relationship", () => {
    const update = `MATCH (j:Project {id: $id}), (t0:Company {id: $r0}), (t1:Person {id: $r1}) SET j += $props
       WITH j, t0, t1 OPTIONAL MATCH (j)-[o0:OWNED_BY]->(:Company) DELETE o0
       WITH DISTINCT j, t0, t1 OPTIONAL MATCH (j)-[o1:LED_BY]->(:Person) DELETE o1
       WITH DISTINCT j, t0, t1 CREATE (j)-[:OWNED_BY]->(t0) CREATE (j)-[:LED_BY]->(t1) RETURN j.id AS id`;
    expect(c.raw(update, { id: "j1", r0: "c3", r1: "p05", props: {} })).toEqual([{ id: "j1" }]);
    const now = c.raw("MATCH (j:Project {id: 'j1'})-[a:OWNED_BY]->(c), (j)-[b:LED_BY]->(p) RETURN c.id AS c, p.id AS p, count(a) AS na, count(b) AS nb");
    expect(now).toEqual([{ c: "c3", p: "p05", na: 1, nb: 1 }]);
  });

  it("clearing a reference removes the relationship and keeps the node", () => {
    c.raw("MATCH (n:Person {id: $id}) SET n += $props WITH n OPTIONAL MATCH (n)-[o:WORKS_AT]->(:Company) DELETE o", { id: "p01", props: {} });
    expect(c.raw("MATCH (p:Person {id: 'p01'}) OPTIONAL MATCH (p)-[:WORKS_AT]->(t) RETURN p.id AS id, t.id AS t")).toEqual([{ id: "p01", t: null }]);
  });

  it("detach delete counts the nodes removed, 0 for a missing id", () => {
    expect(c.raw("MATCH (n:Company) WHERE n.id IN $ids DETACH DELETE n RETURN count(n) AS n", { ids: ["zzz"] })).toEqual([{ n: 0 }]);
    expect(c.raw("MATCH (n:Company) WHERE n.id IN $ids DETACH DELETE n RETURN count(n) AS n", { ids: ["c1"] })).toEqual([{ n: 1 }]);
    expect(c.raw("MATCH (p:Person {id: 'p01'}) OPTIONAL MATCH (p)-[:WORKS_AT]->(t) RETURN t.id AS t")).toEqual([{ t: null }]);
  });
});

describe("a uniqueness constraint on id (R3)", () => {
  const constraint = "CREATE CONSTRAINT rel_Person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.id IS UNIQUE";

  it("without one, nothing prevents two nodes with the same id", () => {
    c.raw("CREATE (:Person {id: 'p1'})");
    c.raw("CREATE (:Person {id: 'p1'})");
    expect(c.raw("MATCH (p:Person {id: 'p1'}) RETURN count(p) AS n")[0]!.n).toBe(2);
  });

  it("rejects a duplicate CREATE and a SET to a taken id, allows the same id on another label, and does not constrain a missing id", () => {
    c.raw(constraint);
    c.raw("CREATE (:Person {id: 'p1'})");
    expect(err("CREATE (:Person {id: 'p1'})")).toMatch(/ConstraintValidationFailed/);
    c.raw("CREATE (:Person {id: 'p2'})");
    expect(err("MATCH (p:Person {id: 'p2'}) SET p.id = 'p1'")).toMatch(/ConstraintValidationFailed/);
    c.raw("CREATE (:Company {id: 'p1'})");
    c.raw("CREATE (:Person {name: 'a'})");
    c.raw("CREATE (:Person {name: 'b'})");
    expect(c.raw("MATCH (p:Person) RETURN count(p) AS n")[0]!.n).toBe(4);
  });

  it("owns an index on the property", () => {
    c.raw(constraint);
    // since engine 1.2 every store also lists its two built-in token lookup indexes (type LOOKUP)
    expect(c.raw("SHOW INDEXES").filter((i) => i.type === "LOOKUP")).toHaveLength(2);
    const indexes = c.raw("SHOW INDEXES").filter((i) => i.type !== "LOOKUP");
    expect(indexes).toHaveLength(1);
    expect(indexes[0]).toMatchObject({ labelsOrTypes: ["Person"], properties: ["id"], owningConstraint: "rel_Person_id" });
    expect(c.raw("SHOW CONSTRAINTS")[0]).toMatchObject({ name: "rel_Person_id", type: "NODE_PROPERTY_UNIQUENESS" });
  });

  it("IF NOT EXISTS is idempotent", () => {
    c.raw(constraint);
    expect(err(constraint)).toBe("");
    expect(c.raw("SHOW CONSTRAINTS")).toHaveLength(1);
  });

  it("cannot be created over data that already holds duplicates", () => {
    c.raw("CREATE (:Person {id: 'x'}), (:Person {id: 'x'})");
    expect(err(constraint)).toMatch(/ConstraintValidationFailed/);
  });

  it("cannot be created while a plain index exists on the same property, and a plain index is refused after it", () => {
    c.raw("CREATE INDEX FOR (p:Person) ON (p.id)");
    expect(err(constraint)).toMatch(/AlreadyExists/);
    c.raw("DROP INDEX Person_id");
    c.raw(constraint);
    expect(err("CREATE INDEX person_id_idx FOR (p:Person) ON (p.id)")).toMatch(/EquivalentSchemaRuleAlreadyExists/);
  });

  it("is created over a loaded seed of unique ids (the demo's first-run order)", () => {
    c.raw("UNWIND range(1, 50) AS i CREATE (:Person {id: 'p' + toString(i)})");
    expect(err(constraint)).toBe("");
    expect(err("CREATE (:Person {id: 'p7'})")).toMatch(/ConstraintValidationFailed/);
    expect(c.raw("MATCH (p:Person) RETURN count(p) AS n")[0]!.n).toBe(50);
  });
});
