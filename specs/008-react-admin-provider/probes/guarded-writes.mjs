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
  return env;
};
run("seed", `CREATE (:Company {id:'c1', name:'Acme'}), (:Company {id:'c2', name:'Beta'}), (:Person {id:'p1', name:'Ada'}), (:Person {id:'p2', name:'Bo'}), (:Project {id:'j1', name:'J'})`);
run("rel", `MATCH (p:Person {id:'p1'}), (c:Company {id:'c1'}) CREATE (p)-[:WORKS_AT]->(c)`);
// update: targets matched first, so a missing target changes nothing
const upd = `MATCH (p:Person {id:$id}), (c:Company {id:$cid}) SET p += $props WITH p, c OPTIONAL MATCH (p)-[r:WORKS_AT]->(:Company) DELETE r WITH DISTINCT p, c CREATE (p)-[:WORKS_AT]->(c) RETURN p.id AS id`;
run("update ok", upd, { id: "p1", cid: "c2", props: { name: "Ada2" } });
run("check", `MATCH (p:Person {id:'p1'})-[:WORKS_AT]->(c) RETURN p.name AS n, c.id AS c`);
run("update missing target (must change nothing)", upd, { id: "p1", cid: "nope", props: { name: "ZZZ" } });
run("check unchanged", `MATCH (p:Person {id:'p1'})-[:WORKS_AT]->(c) RETURN p.name AS n, c.id AS c`);
// update with two references (company and lead) and nothing to delete the first time
const upd2 = `MATCH (j:Project {id:$id}), (t0:Company {id:$r0}), (t1:Person {id:$r1}) SET j += $props
 WITH j, t0, t1 OPTIONAL MATCH (j)-[o0:OWNED_BY]->(:Company) DELETE o0
 WITH DISTINCT j, t0, t1 OPTIONAL MATCH (j)-[o1:LED_BY]->(:Person) DELETE o1
 WITH DISTINCT j, t0, t1 CREATE (j)-[:OWNED_BY]->(t0) CREATE (j)-[:LED_BY]->(t1) RETURN j.id AS id`;
run("update two refs", upd2, { id: "j1", r0: "c1", r1: "p2", props: { name: "J2" } });
run("update two refs again (replace)", upd2, { id: "j1", r0: "c2", r1: "p1", props: {} });
run("check", `MATCH (j:Project {id:'j1'})-[a:OWNED_BY]->(c), (j)-[b:LED_BY]->(p) RETURN j.name AS n, c.id AS c, p.id AS p, count(a) AS na, count(b) AS nb`);
// clear a reference
run("clear ref", `MATCH (p:Person {id:$id}) SET p += $props WITH p OPTIONAL MATCH (p)-[r:WORKS_AT]->(:Company) DELETE r RETURN p.id AS id`, { id: "p1", props: {} });
run("after clear", `MATCH (p:Person {id:'p1'}) OPTIONAL MATCH (p)-[:WORKS_AT]->(c) RETURN p.id AS id, c.id AS c`);
// create with uniqueness guard and a reference
const create = `OPTIONAL MATCH (e:Person {id:$id}) WITH e WHERE e IS NULL MATCH (c:Company {id:$cid}) CREATE (p:Person {id:$id}) SET p += $props CREATE (p)-[:WORKS_AT]->(c) RETURN p.id AS id`;
run("create ok", create, { id: "p5", cid: "c1", props: { name: "Eve" } });
run("create duplicate id (expect no rows)", create, { id: "p5", cid: "c1", props: { name: "Dup" } });
run("create missing target (expect no rows)", create, { id: "p6", cid: "nope", props: { name: "X" } });
run("counts", `MATCH (p:Person) RETURN p.id AS id ORDER BY p.id`);
// create with no references and a uniqueness guard
const create0 = `OPTIONAL MATCH (e:Person {id:$id}) WITH e WHERE e IS NULL CREATE (p:Person {id:$id}) SET p += $props RETURN p.id AS id`;
run("create no refs ok", create0, { id: "p7", props: { name: "Zed" } });
run("create no refs dup", create0, { id: "p7", props: { name: "Zed2" } });
// membership on reference: via relationship target id
run("filter by reference", `MATCH (p:Person) WHERE EXISTS { (p)-[:WORKS_AT]->(:Company {id:$cid}) } RETURN p.id AS id`, { cid: "c1" });
run("filter by reference (pattern match form)", `MATCH (p:Person)-[:WORKS_AT]->(c:Company) WHERE c.id = $cid RETURN p.id AS id ORDER BY p.id`, { cid: "c1" });
// count with optional match to avoid double counting
run("count w/ reference filter", `MATCH (p:Person)-[:WORKS_AT]->(c:Company) WHERE c.id IN $ids RETURN count(p) AS total`, { ids: ["c1"] });
// sorting by reference-less: sort desc with nulls
run("desc order nulls", `MATCH (p:Person) RETURN p.id AS id, p.name AS name ORDER BY p.name DESC, p.id ASC`);
run("boolean field filter", `MATCH (p:Person) WHERE p.active = $v RETURN p.id AS id`, { v: true });
