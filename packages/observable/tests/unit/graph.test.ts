// covers: FR-019
import { beforeAll, describe, expect, it } from "vitest";
import { normalize, toGraph } from "../../src/results/index.js";
import { createEngine, seedScript, type Engine } from "../helpers/engine.js";

let engine: Engine;
const run = (statement: string) => normalize(engine.execute(statement));

beforeAll(async () => {
  engine = await createEngine(seedScript);
});

describe("toGraph, against the real engine", () => {
  it("collects nodes and links from entity columns", () => {
    const graph = toGraph(run("MATCH (p:Person)-[r:WORKS_AT]->(c:Company {name: 'Neo4j'}) RETURN p, r, c"));
    expect(graph.nodes).toHaveLength(4);
    expect(graph.links).toHaveLength(3);
    expect(graph.nodes.find((n) => n.name === "Neo4j")?.label).toBe("Company");
    expect(graph.links[0]).toMatchObject({ type: "WORKS_AT" });
  });

  it("collects the entities inside paths", () => {
    const graph = toGraph(run("MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*2..3]->(o:Person) RETURN path LIMIT 1"));
    expect(graph.nodes.length).toBeGreaterThanOrEqual(3);
    expect(graph.links).toHaveLength(graph.nodes.length - 1);
  });

  it("accepts a path given as a {nodes, relationships} object", () => {
    const [{ path }] = run("MATCH path = (a:Person {name: 'Alice'})-[:KNOWS]->(o:Person) RETURN path LIMIT 1").rows as [{ path: Array<{ kind: string }> }];
    const asObject = { rows: [{ path: { nodes: path.filter((e) => e.kind === "node"), relationships: path.filter((e) => e.kind === "relationship") } }] };
    expect(toGraph(asObject).links).toHaveLength(1);
  });

  it("gives an empty graph for a result with no entities", () => {
    expect(toGraph(run("MATCH (p:Person) RETURN p.name AS name"))).toEqual({ nodes: [], links: [] });
    expect(toGraph(run("MATCH (p:Nope) RETURN p"))).toEqual({ nodes: [], links: [] });
  });

  it("drops a relationship whose endpoints are not in the result", () => {
    expect(toGraph(run("MATCH (:Person)-[r:KNOWS]->(:Person) RETURN r")).links).toEqual([]);
  });
});
