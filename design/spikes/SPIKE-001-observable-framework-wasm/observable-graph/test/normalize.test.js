// Runs the real WASM engine in Node and checks the normalization layer against
// the envelopes it actually produces (SPIKE-001, 4.3). Needs the package built
// and installed: `npm run build:wasm && npm install`.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test, before} from "node:test";
import {fileURLToPath} from "node:url";
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import {normalize, toGraph} from "../docs/components/normalize.js";
import {seedScript} from "../docs/components/seed.js";

let db;
const run = (cypher) => normalize(JSON.parse(db.execute(cypher, null)));

before(async () => {
  const wasm = readFileSync(fileURLToPath(new URL("../docs/data/cypherlite_bg.wasm", import.meta.url)));
  await init({module_or_path: wasm});
  db = new CypherliteDb();
  for (const envelope of db.executeScript(seedScript, null)) assert.equal(JSON.parse(envelope).error, null);
});

test("raw rows come back alphabetical; normalize restores column order", () => {
  const raw = JSON.parse(db.execute("MATCH (p:Person) RETURN p.name AS name, p.age AS age LIMIT 1", null));
  assert.deepEqual(Object.keys(raw.rows[0]), ["age", "name"]);
  const result = run("MATCH (p:Person) RETURN p.name AS name, p.age AS age LIMIT 1");
  assert.deepEqual(result.columns, ["name", "age"]);
  assert.deepEqual(Object.keys(result.rows[0]), ["name", "age"]);
});

test("engine errors arrive in-band with a reduced envelope", () => {
  const result = run("MATCH (p:Person RETURN p");
  assert.match(result.error, /syntax error/);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.columnTypes, []);
});

test("entities carry kind tags and flatten to readable cells", () => {
  const result = run("MATCH (p:Person)-[r:WORKS_AT]->(c:Company {name: 'Neo4j'}) RETURN p, r, c");
  assert.deepEqual(result.columnTypes, ["NODE", "RELATIONSHIP", "NODE"]);
  const [row] = result.rows;
  assert.equal(row.p.kind, "node");
  assert.equal(row.r.kind, "relationship");
  const [flat] = result.tableRows;
  assert.match(String(flat.p), /^\(Person \w+\)$/);
  assert.equal(String(flat.r), "[:WORKS_AT]");
  assert.equal(Object.keys(flat.p).includes("toString"), false);
});

test("paths arrive as alternating arrays and flatten to a readable chain", () => {
  const result = run(
    "MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*2..3]->(o:Person) WHERE o.name <> 'Alice' RETURN path LIMIT 1"
  );
  assert.deepEqual(result.columnTypes, ["PATH"]);
  const path = result.rows[0].path;
  assert.ok(Array.isArray(path));
  assert.deepEqual(
    path.map((e) => e.kind),
    path.map((_, i) => (i % 2 === 0 ? "node" : "relationship"))
  );
  assert.match(String(result.tableRows[0].path), /^Alice(-\[:KNOWS\]-\w+)+$/);
});

test("toGraph collects nodes and links from entity columns, paths, and a {nodes, relationships} object", () => {
  const entities = toGraph(run("MATCH (p:Person)-[r:WORKS_AT]->(c:Company {name: 'Neo4j'}) RETURN p, r, c"));
  assert.equal(entities.nodes.length, 4);
  assert.equal(entities.links.length, 3);

  const path = toGraph(run("MATCH path = (a:Person {name: 'Alice'})-[:KNOWS*2..3]->(o:Person) RETURN path LIMIT 1"));
  assert.ok(path.nodes.length >= 3);
  assert.equal(path.links.length, path.nodes.length - 1);

  const [{path: p}] = run("MATCH path = (a:Person {name: 'Alice'})-[:KNOWS]->(o:Person) RETURN path LIMIT 1").rows;
  const asObject = {rows: [{path: {nodes: p.filter((e) => e.kind === "node"), relationships: p.filter((e) => e.kind === "relationship")}}]};
  assert.equal(toGraph(asObject).links.length, 1);
});

test("a result with no entities yields an empty graph", () => {
  assert.deepEqual(toGraph(run("MATCH (p:Person) RETURN p.name AS name")), {nodes: [], links: []});
  assert.deepEqual(toGraph(run("MATCH (p:Nope) RETURN p")), {nodes: [], links: []});
});

test("links whose endpoints are missing from the result are dropped", () => {
  const graph = toGraph(run("MATCH (:Person)-[r:KNOWS]->(:Person) RETURN r"));
  assert.equal(graph.links.length, 0);
});
