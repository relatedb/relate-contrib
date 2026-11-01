// SPIKE-002 step 1, RFC-001 §7.9: what does the native Node library write when
// it checkpoints a content graph, and does it read back?
//
// Needs the native C library and the Node client (neither is on npm; build the
// library from a CypherLite checkout and copy clients/javascript somewhere with
// koffi installed):
//   NATIVE_CLIENT_DIR=/path/to/clients/javascript-copy \
//   CYPHERLITE_LIB=/path/to/libcypherlite_ffi.dylib \
//   CYPHERLITE_SNAPSHOT_FORMAT=json \
//   node scripts/native-checkpoint.mjs <store-dir> [pages]
import {createRequire} from "node:module";
import {readdirSync, statSync, readFileSync, rmSync} from "node:fs";
import {join, relative} from "node:path";

const {NATIVE_CLIENT_DIR, CYPHERLITE_LIB} = process.env;
if (!NATIVE_CLIENT_DIR || !CYPHERLITE_LIB) throw new Error("set NATIVE_CLIENT_DIR and CYPHERLITE_LIB");
const {Database} = createRequire(join(NATIVE_CLIENT_DIR, "index.js"))("./index.js");

const store = process.argv[2];
if (!store) throw new Error("usage: native-checkpoint.mjs <store-dir> [pages]");
const n = Number(process.argv[3] ?? 100);
rmSync(store, {recursive: true, force: true});

// Same synthetic site as delivery.mjs, kept deliberately simple here.
const pages = Array.from({length: n}, (_, id) => ({id, slug: `page-${id}`, title: `Page ${id}`, section: id % 8}));
const links = pages.flatMap((p) => [1, 2, 3, 4, 5].map((k) => ({from: p.id, to: (p.id + k * 7) % n}))).filter((l) => l.from !== l.to);

const list = (dir) =>
  readdirSync(dir, {withFileTypes: true}).flatMap((e) =>
    e.isDirectory() ? list(join(dir, e.name)) : [{path: relative(store, join(dir, e.name)), bytes: statSync(join(dir, e.name)).size}]
  );

let db;
try {
  db = Database.open(store);
} catch (e) {
  console.log(`writable open of a missing store failed: ${e.message}`);
  process.exit(1);
}
const conn = db.connect();
conn.query("CREATE INDEX page_id FOR (p:Page) ON (p.id)");
conn.query("UNWIND $pages AS p CREATE (:Page {id: p.id, slug: p.slug, title: p.title, section: p.section})", {pages});
conn.query("UNWIND $links AS l MATCH (a:Page {id: l.from}), (b:Page {id: l.to}) CREATE (a)-[:LINKS_TO]->(b)", {links});
db.checkpoint();
console.log("files after checkpoint:");
for (const f of list(store)) console.log(`  ${String(f.bytes).padStart(9)}  ${f.path}`);
conn.close?.();
db.close?.();

const reader = Database.open(store, {readOnly: true});
const count = (cypher) => reader.connect().query(cypher).rows[0].c;
console.log("read back natively:", {pages: count("MATCH (p:Page) RETURN count(p) AS c"), links: count("MATCH ()-[r:LINKS_TO]->() RETURN count(r) AS c")});

const json = list(store).filter((f) => f.path.endsWith(".json"));
for (const f of json.slice(0, 3)) {
  const text = readFileSync(join(store, f.path), "utf8");
  console.log(`\n${f.path} (${f.bytes} bytes) starts: ${text.slice(0, 300).replace(/\s+/g, " ")}`);
}
