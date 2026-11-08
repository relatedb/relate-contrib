// covers: FR-018, SC-007
import { beforeAll, describe, expect, it } from "vitest";
import { normalize } from "../../src/results/index.js";
import { createEngine, seedScript, type Engine } from "../helpers/engine.js";

let engine: Engine;
const run = (statement: string) => normalize(engine.execute(statement));

beforeAll(async () => {
  engine = await createEngine(seedScript);
});

describe("normalize, against the real engine", () => {
  it("keys rows in column order, whatever order the engine returns", () => {
    const result = run("MATCH (p:Person) RETURN p.name AS name, p.age AS age LIMIT 1");
    expect(result.columns).toEqual(["name", "age"]);
    expect(Object.keys(result.rows[0]!)).toEqual(["name", "age"]);
    expect(Object.keys(result.tableRows[0]!)).toEqual(["name", "age"]);
  });

  it("returns an engine error in `error` with empty rows and no column types", () => {
    const result = run("MATCH (p:Person RETURN p");
    expect(result.error).toMatch(/syntax error/i);
    expect(result.rows).toEqual([]);
    expect(result.columnTypes).toEqual([]);
  });

  it("keeps the engine's tagged entities and flattens them to readable cells", () => {
    const result = run("MATCH (p:Person)-[r:WORKS_AT]->(c:Company {name: 'Neo4j'}) RETURN p, r, c");
    expect(result.columnTypes).toEqual(["NODE", "RELATIONSHIP", "NODE"]);
    const row = result.rows[0] as { p: { kind: string }; r: { kind: string } };
    expect(row.p.kind).toBe("node");
    expect(row.r.kind).toBe("relationship");
    const flat = result.tableRows[0] as { p: Record<string, unknown>; r: Record<string, unknown>; c: Record<string, unknown> };
    expect(String(flat.p)).toMatch(/^\(Person \w+\)$/);
    expect(String(flat.r)).toBe("[:WORKS_AT]");
    expect(String(flat.c)).toBe("(Company Neo4j)");
    expect(typeof flat.p.age).toBe("number");
    expect(flat.p.labels).toEqual(["Person"]);
    expect(Object.keys(flat.p)).not.toContain("toString");
  });

  it("flattens a relationship to its type, start, end and properties", () => {
    const flat = run("MATCH (:Person {name: 'Alice'})-[r:KNOWS]->(:Person {name: 'Bob'}) RETURN r").tableRows[0] as { r: Record<string, unknown> };
    expect(flat.r.type).toBe("KNOWS");
    expect(flat.r.since).toBe(2015);
    expect(flat.r.start).toBeDefined();
    expect(flat.r.end).toBeDefined();
  });

  it("receives a path as alternating nodes and relationships and flattens it to a readable chain", () => {
    const result = run("MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*2..3]->(o:Person) WHERE o.name <> 'Alice' RETURN path LIMIT 1");
    expect(result.columnTypes).toEqual(["PATH"]);
    const path = result.rows[0]!.path as Array<{ kind: string }>;
    expect(Array.isArray(path)).toBe(true);
    expect(path.map((e) => e.kind)).toEqual(path.map((_, i) => (i % 2 === 0 ? "node" : "relationship")));
    expect(String(result.tableRows[0]!.path)).toMatch(/^Alice(-\[:KNOWS\]-\w+)+$/);
  });

  it("gives an empty result that still carries its columns", () => {
    const result = run("MATCH (p:Nope) RETURN p");
    expect(result.rows).toEqual([]);
    expect(result.columns).toEqual(["p"]);
  });

  it("carries statistics and the elapsed time, and null for no error", () => {
    const result = run("MATCH (p:Person) RETURN count(p) AS n");
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([{ n: 5 }]);
    expect(typeof result.elapsedMs).toBe("number");
    expect(result.stats).toBeTypeOf("object");
  });

  it("handles an envelope with missing fields", () => {
    expect(normalize({})).toEqual({ columns: [], columnTypes: [], rows: [], tableRows: [], stats: {}, error: null, elapsedMs: null });
  });
});
