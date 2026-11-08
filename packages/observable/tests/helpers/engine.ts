// The real engine in Node, for tests of the results layer: the browser build initialized from the binary's bytes.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import init, { RelateDb } from "@relate/relate-wasm";
import type { Envelope } from "../../src/results/types.js";

const require = createRequire(import.meta.url);
let ready: Promise<unknown> | undefined;

export interface Engine {
  /** Run one statement and return the parsed envelope, unaltered. */
  execute(statement: string, params?: Record<string, unknown> | null): Envelope;
}

/** A new in-memory database loaded with `script` (statements separated as the engine's script runner expects). */
export async function createEngine(script?: string): Promise<Engine> {
  ready ??= init({ module_or_path: readFileSync(require.resolve("@relate/relate-wasm/relate_bg.wasm")) });
  await ready;
  const db = new RelateDb();
  if (script) for (const envelope of db.executeScript(script, null)) if (JSON.parse(envelope).error) throw new Error(JSON.parse(envelope).error);
  return { execute: (statement, params) => JSON.parse(db.execute(statement, params == null ? null : JSON.stringify(params))) as Envelope };
}

/** A small hand-written graph (people, companies, cities) from SPIKE-001. */
export const seedScript = `
CREATE (alice:Person {name: 'Alice', age: 34}),
       (bob:Person {name: 'Bob', age: 41}),
       (carol:Person {name: 'Carol', age: 29}),
       (dave:Person {name: 'Dave', age: 52}),
       (erin:Person {name: 'Erin', age: 38}),
       (neo:Company {name: 'Neo4j'}),
       (acme:Company {name: 'Acme'}),
       (malmo:City {name: 'Malmo'}),
       (london:City {name: 'London'}),
       (sf:City {name: 'San Francisco'}),
       (alice)-[:KNOWS {since: 2015}]->(bob),
       (bob)-[:KNOWS {since: 2018}]->(carol),
       (carol)-[:KNOWS {since: 2020}]->(dave),
       (alice)-[:KNOWS {since: 2012}]->(erin),
       (erin)-[:KNOWS {since: 2019}]->(dave),
       (alice)-[:WORKS_AT {role: 'Engineer'}]->(neo),
       (bob)-[:WORKS_AT {role: 'Designer'}]->(neo),
       (carol)-[:WORKS_AT {role: 'Analyst'}]->(acme),
       (dave)-[:WORKS_AT {role: 'Director'}]->(acme),
       (erin)-[:WORKS_AT {role: 'Engineer'}]->(neo),
       (alice)-[:LIVES_IN]->(malmo),
       (bob)-[:LIVES_IN]->(london),
       (carol)-[:LIVES_IN]->(london),
       (dave)-[:LIVES_IN]->(sf),
       (erin)-[:LIVES_IN]->(malmo)
`;
