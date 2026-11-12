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
  console.log(`\n## ${label}\n${q}\n->`, env.error ? "ERROR: " + env.error : JSON.stringify(env.rows).slice(0, 250));
};
run("constraint", `CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE`);
run("same again (idempotent?)", `CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE`);
run("same again, other name", `CREATE CONSTRAINT person_id2 IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE`);
run("seed load with the constraint in place (bulk create of unique ids)", `UNWIND range(1, 5) AS i CREATE (:Person {id: 'p' + toString(i)})`);
run("lookup then readCount", `MATCH (p:Person {id:'p3'}) RETURN p.id AS id`);
run("indexes", `SHOW INDEXES`);
