// Forms the write calls rely on that the earlier probes did not run: an empty property map, deleted ids returned,
// and an update over several ids with one target.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const req = createRequire(new URL("../../../packages/web/package.json", import.meta.url));
const dir = dirname(req.resolve("@relate/relate-wasm"));
const mod = await import(join(dir, "relate.js"));
await mod.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
const db = new mod.RelateDb();
const run = (label, q, p) => {
  const env = JSON.parse(db.execute(q, p ? JSON.stringify(p) : null));
  console.log(`\n## ${label}\n->`, env.error ? "ERROR: " + env.error : JSON.stringify(env.rows).slice(0, 300));
};
run("seed", `CREATE (:Company {id:'c1'}), (:Company {id:'c2'}), (:Person {id:'p1'}), (:Person {id:'p2'}), (:Person {id:'p3'})`);
run("rels", `MATCH (p:Person {id:'p1'}), (c:Company {id:'c1'}) CREATE (p)-[:WORKS_AT]->(c)`);
run("SET += empty map", `MATCH (n:Person {id: $id}) SET n += $props RETURN n.id AS id`, { id: "p1", props: {} });
run("update many with one target", `MATCH (n:Person) WHERE n.id IN $ids MATCH (t0:Company {id: $r0}) SET n += $props WITH n, t0 OPTIONAL MATCH (n)-[o0:WORKS_AT]->(:Company) DELETE o0 WITH DISTINCT n, t0 CREATE (n)-[:WORKS_AT]->(t0) RETURN n.id AS id`, { ids: ["p1", "p2", "nope"], r0: "c2", props: { x: 1 } });
run("check", `MATCH (p:Person)-[:WORKS_AT]->(c) RETURN p.id AS p, c.id AS c ORDER BY p`);
run("delete returning removed ids", `MATCH (n:Person) WHERE n.id IN $ids WITH n, n.id AS removed DETACH DELETE n RETURN removed`, { ids: ["p1", "nope", "p3"] });
run("left", `MATCH (n:Person) RETURN n.id AS id`);
run("delete detaching relationships", `MATCH (n:Company) WHERE n.id IN $ids WITH n, n.id AS removed DETACH DELETE n RETURN removed`, { ids: ["c2"] });
run("remaining relationships", `MATCH ()-[r]->() RETURN count(r) AS n`);
