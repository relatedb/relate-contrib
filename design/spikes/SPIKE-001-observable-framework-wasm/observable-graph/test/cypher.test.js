// The Observable-style `cypher` tag against the real engine, run in Node.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test, before} from "node:test";
import {fileURLToPath} from "node:url";
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import {makeCypher} from "../docs/components/cypherTag.js";
import {normalize, toGraph} from "../docs/components/normalize.js";
import {seedScript} from "../docs/components/seed.js";

let cypher;

before(async () => {
  const wasm = readFileSync(fileURLToPath(new URL("../docs/data/cypherlite_bg.wasm", import.meta.url)));
  await init({module_or_path: wasm});
  const db = new CypherliteDb();
  for (const envelope of db.executeScript(seedScript, null)) assert.equal(JSON.parse(envelope).error, null);
  cypher = makeCypher((text, params) => normalize(JSON.parse(db.execute(text, params == null ? null : JSON.stringify(params)))));
});

test("returns an array of row objects with column metadata, in column order", async () => {
  const rows = await cypher`MATCH (p:Person) RETURN p.name AS name, p.age AS age ORDER BY age DESC`;
  assert.ok(Array.isArray(rows));
  assert.deepEqual(rows.columns, ["name", "age"]);
  assert.deepEqual(rows.columnTypes, ["STRING", "INTEGER"]);
  assert.deepEqual(Object.keys(rows[0]), ["name", "age"]);
  assert.deepEqual(rows.map((d) => d.name), ["Dave", "Bob", "Erin", "Alice", "Carol"]);
});

test("template values bind as parameters", async () => {
  const minAge = 40;
  const rows = await cypher`MATCH (p:Person) WHERE p.age >= ${minAge} RETURN p.name AS name ORDER BY name`;
  assert.deepEqual(rows.map((d) => d.name), ["Bob", "Dave"]);

  const city = "London";
  const there = await cypher`MATCH (p:Person)-[:LIVES_IN]->(:City {name: ${city}}) RETURN p.name AS name ORDER BY name`;
  assert.deepEqual(there.map((d) => d.name), ["Bob", "Carol"]);
});

test("a value is never spliced into the query text", async () => {
  const hostile = "London'}) RETURN 1 AS injected //";
  const rows = await cypher`MATCH (p:Person)-[:LIVES_IN]->(:City {name: ${hostile}}) RETURN p.name AS name`;
  assert.equal(rows.length, 0);
  assert.deepEqual(rows.columns, ["name"]);
});

test("entity columns flatten so accessors reach properties", async () => {
  const rows = await cypher`MATCH (p:Person)-[:LIVES_IN]->(c:City) RETURN p, c`;
  assert.equal(rows.length, 5);
  assert.equal(typeof rows[0].p.age, "number");
  assert.equal(typeof rows[0].c.name, "string");
  assert.deepEqual(rows[0].p.labels, ["Person"]);
});

test("the original entities stay available for toGraph", async () => {
  const rows = await cypher`MATCH (a)-[r]->(b) RETURN a, r, b`;
  const graph = toGraph(rows.result);
  assert.equal(graph.nodes.length, 10);
  assert.equal(graph.links.length, 15);
  assert.equal(Object.keys(rows).includes("result"), false);
});

test("engine errors reject", async () => {
  await assert.rejects(() => cypher`MATCH (p:Person RETURN p`, /syntax error/);
});

test("an empty result is an empty array that still carries columns", async () => {
  const rows = await cypher`MATCH (p:Nope) RETURN p`;
  assert.equal(rows.length, 0);
  assert.deepEqual(rows.columns, ["p"]);
});
