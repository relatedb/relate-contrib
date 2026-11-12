// Does the engine enforce a uniqueness constraint on a label's `id`, and how does it behave?
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
  console.log(`\n## ${label}\n${q}\n->`, env.error ? "ERROR: " + env.error : JSON.stringify(env.rows).slice(0, 300), env.stats ? `constraints+${env.stats.constraints_added} indexes+${env.stats.indexes_added} nodes+${env.stats.nodes_created}` : "");
};
run("constraint (Cypher 5 syntax)", `CREATE CONSTRAINT person_id FOR (p:Person) REQUIRE p.id IS UNIQUE`);
run("show constraints", `SHOW CONSTRAINTS`);
run("show indexes (does the constraint own one?)", `SHOW INDEXES`);
run("create p1", `CREATE (:Person {id:'p1', name:'A'})`);
run("create duplicate p1", `CREATE (:Person {id:'p1', name:'dup'})`);
run("count p1", `MATCH (p:Person {id:'p1'}) RETURN count(p) AS n`);
run("same id, other label (allowed?)", `CREATE (:Company {id:'p1'})`);
run("SET to a taken id", `CREATE (:Person {id:'p2'}) WITH 1 AS x MATCH (p:Person {id:'p2'}) SET p.id = 'p1'`);
run("create without id (null)", `CREATE (:Person {name:'no id'})`);
run("create two without id", `CREATE (:Person {name:'no id 2'})`);
run("guarded create via MERGE-less pattern still fine", `OPTIONAL MATCH (e:Person {id:$id}) WITH e WHERE e IS NULL CREATE (p:Person {id:$id}) RETURN p.id AS id`, { id: "p1" });
run("constraint on existing duplicates", `CREATE (:Thing {id:'x'}), (:Thing {id:'x'})`);
run("add constraint over duplicates", `CREATE CONSTRAINT thing_id FOR (t:Thing) REQUIRE t.id IS UNIQUE`);
run("drop constraint", `DROP CONSTRAINT person_id`);
run("duplicate after drop", `CREATE (:Person {id:'p1', name:'dup2'})`);
