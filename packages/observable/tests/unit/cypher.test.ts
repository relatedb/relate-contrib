// covers: FR-020, FR-021, FR-025, SC-007
import { beforeAll, describe, expect, it } from "vitest";
import { makeCypher, normalize, toGraph, type Cypher } from "../../src/results/index.js";
import { createEngine, seedScript } from "../helpers/engine.js";

let cypher: Cypher;
let statements: Array<{ text: string; params: Record<string, unknown> | null }> = [];

beforeAll(async () => {
  const engine = await createEngine(seedScript);
  cypher = makeCypher(async (text, params) => {
    statements.push({ text, params });
    return normalize(engine.execute(text, params));
  });
});

describe("the cypher tagged template, against the real engine", () => {
  it("returns an array of row objects with column metadata, in column order", async () => {
    const rows = await cypher`MATCH (p:Person) RETURN p.name AS name, p.age AS age ORDER BY age DESC`;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.columns).toEqual(["name", "age"]);
    expect(rows.columnTypes).toEqual(["STRING", "INTEGER"]);
    expect(Object.keys(rows[0]!)).toEqual(["name", "age"]);
    expect(rows.map((d) => d.name)).toEqual(["Dave", "Bob", "Erin", "Alice", "Carol"]);
    expect(typeof rows.elapsedMs).toBe("number");
    expect(rows.stats).toBeTypeOf("object");
  });

  it("binds each interpolated value as a parameter and never splices it into the text", async () => {
    statements = [];
    const minAge = 40;
    const rows = await cypher`MATCH (p:Person) WHERE p.age >= ${minAge} RETURN p.name AS name ORDER BY name`;
    expect(rows.map((d) => d.name)).toEqual(["Bob", "Dave"]);
    expect(statements[0]!.text).toBe("MATCH (p:Person) WHERE p.age >= $p0 RETURN p.name AS name ORDER BY name");
    expect(statements[0]!.params).toEqual({ p0: 40 });
  });

  it("matches nothing and changes no statement for a hostile string", async () => {
    statements = [];
    const hostile = "London'}) RETURN 1 AS injected //";
    const rows = await cypher`MATCH (p:Person)-[:LIVES_IN]->(:City {name: ${hostile}}) RETURN p.name AS name`;
    expect(rows).toHaveLength(0);
    expect(rows.columns).toEqual(["name"]);
    expect(statements[0]!.text).not.toContain("injected");
    expect(statements[0]!.params).toEqual({ p0: hostile });
  });

  it("passes an array or object value as given", async () => {
    statements = [];
    const names = ["Alice", "Bob"];
    const rows = await cypher`MATCH (p:Person) WHERE p.name IN ${names} RETURN p.name AS name ORDER BY name`;
    expect(rows.map((d) => d.name)).toEqual(["Alice", "Bob"]);
    expect(statements[0]!.params).toEqual({ p0: names });
  });

  it("flattens entity columns so accessors reach properties", async () => {
    const rows = await cypher`MATCH (p:Person)-[:LIVES_IN]->(c:City) RETURN p, c`;
    expect(rows).toHaveLength(5);
    expect(typeof (rows[0]!.p as { age: unknown }).age).toBe("number");
    expect(typeof (rows[0]!.c as { name: unknown }).name).toBe("string");
    expect((rows[0]!.p as { labels: string[] }).labels).toEqual(["Person"]);
  });

  it("keeps the original entities on a non-enumerable result for toGraph", async () => {
    const rows = await cypher`MATCH (a)-[r]->(b) RETURN a, r, b`;
    const graph = toGraph(rows.result);
    expect(graph.nodes).toHaveLength(10);
    expect(graph.links).toHaveLength(15);
    expect(Object.keys(rows)).not.toContain("result");
  });

  it("rejects with the engine's message when the engine returns an error", async () => {
    await expect(cypher`MATCH (p:Person RETURN p`).rejects.toThrow(/syntax error/i);
  });

  it("resolves an empty result to an empty array that still carries its columns", async () => {
    const rows = await cypher`MATCH (p:Nope) RETURN p`;
    expect(rows).toHaveLength(0);
    expect(rows.columns).toEqual(["p"]);
  });
});
