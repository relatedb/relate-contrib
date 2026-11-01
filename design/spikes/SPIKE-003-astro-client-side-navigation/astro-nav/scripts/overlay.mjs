// SPIKE-003 step 3, RFC-001 §7.4: can one instance hold the site graph plus a
// page's own data, and remove only the page's data on navigation? Runs the
// real WASM engine in Node (same module the browser runs) against the
// synthetic site graphs from synthesize.mjs.
//
// Compares:
//   overlay   one instance: site graph + (:Note) nodes tagged with a page scope,
//             linked to site pages; remove with DETACH DELETE on departure
//   separate  a second instance per page holding only the page's data
//
// Usage: node scripts/overlay.mjs [sizes, default 1000,5000] [cycles, default 200]
import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";

const sizes = (process.argv[2] ?? "1000,5000").split(",").map(Number);
const cycles = Number(process.argv[3] ?? 200);
const NOTES = 50;

const wasm = await init({module_or_path: readFileSync(fileURLToPath(new URL("../.wasm-build/pkg/cypherlite_bg.wasm", import.meta.url)))});
const mem = () => Math.round(wasm.memory.buffer.byteLength / 1024 / 1024 * 10) / 10;
const ms = (t0) => Math.round((performance.now() - t0) * 100) / 100;
const run = (db, cypher, params) => {
  const r = JSON.parse(db.execute(cypher, params ? JSON.stringify(params) : null));
  if (r.error) throw new Error(`${cypher}\n${r.error}`);
  return r;
};
const count = (db, cypher) => Object.values(run(db, cypher).rows[0])[0];

const ADD_PAGES = "UNWIND $pages AS p CREATE (:Page {id: p.id, slug: p.slug, title: p.title, section: p.section})";
const ADD_LINKS = "UNWIND $links AS l MATCH (a:Page {id: l.from}), (b:Page {id: l.to}) CREATE (a)-[:LINKS_TO]->(b)";
const ADD_NOTES = "UNWIND $notes AS n CREATE (:Note {scope: $scope, n: n.n, text: n.text})";
const ADD_ABOUT = "UNWIND $about AS a MATCH (n:Note {scope: $scope, n: a.n}), (p:Page {id: a.page}) CREATE (n)-[:ABOUT]->(p)";
const DROP = "MATCH (n:Note {scope: $scope}) DETACH DELETE n";

const overlayFor = (k, total) => ({
  scope: `page-${k}`,
  notes: Array.from({length: NOTES}, (_, n) => ({n, text: `note ${n} of page ${k}`})),
  about: Array.from({length: NOTES}, (_, n) => ({n, page: (k * 7 + n * 13) % total}))
});

const results = [];
for (const total of sizes) {
  const site = JSON.parse(readFileSync(fileURLToPath(new URL(`../public/synthetic/graph-${total}.json`, import.meta.url))));
  for (const indexed of [true, false]) {
    const db = new CypherliteDb();
    if (indexed) {
      run(db, "CREATE INDEX page_id FOR (p:Page) ON (p.id)");
    }
    run(db, ADD_PAGES, {pages: site.pages});
    run(db, ADD_LINKS, {links: site.links});
    if (indexed) run(db, "CREATE INDEX note_scope FOR (n:Note) ON (n.scope)");
    const before = {
      pages: count(db, "MATCH (p:Page) RETURN count(p) AS c"),
      links: count(db, "MATCH ()-[r:LINKS_TO]->() RETURN count(r) AS c")
    };
    const memStart = mem();

    // One arrival/departure, timed, with counts after each step.
    const o = overlayFor(3, total);
    let t = performance.now();
    run(db, ADD_NOTES, {notes: o.notes, scope: o.scope});
    run(db, ADD_ABOUT, {about: o.about, scope: o.scope});
    const addMs = ms(t);
    const during = {
      notes: count(db, "MATCH (n:Note) RETURN count(n) AS c"),
      about: count(db, "MATCH ()-[r:ABOUT]->() RETURN count(r) AS c")
    };
    t = performance.now();
    run(db, DROP, {scope: o.scope});
    const dropMs = ms(t);
    const after = {
      pages: count(db, "MATCH (p:Page) RETURN count(p) AS c"),
      links: count(db, "MATCH ()-[r:LINKS_TO]->() RETURN count(r) AS c"),
      notes: count(db, "MATCH (n:Note) RETURN count(n) AS c"),
      about: count(db, "MATCH ()-[r:ABOUT]->() RETURN count(r) AS c")
    };

    // Navigation churn: arrive and leave `cycles` times, different page each time.
    let addTotal = 0, dropTotal = 0;
    for (let k = 0; k < cycles; k++) {
      const c = overlayFor(k, total);
      t = performance.now();
      run(db, ADD_NOTES, {notes: c.notes, scope: c.scope});
      run(db, ADD_ABOUT, {about: c.about, scope: c.scope});
      addTotal += performance.now() - t;
      t = performance.now();
      run(db, DROP, {scope: c.scope});
      dropTotal += performance.now() - t;
    }
    const churn = {
      cycles,
      avgAddMs: Math.round((addTotal / cycles) * 100) / 100,
      avgDropMs: Math.round((dropTotal / cycles) * 100) / 100,
      memBeforeMB: memStart,
      memAfterMB: mem(),
      pagesAfter: count(db, "MATCH (p:Page) RETURN count(p) AS c"),
      notesAfter: count(db, "MATCH (n:Note) RETURN count(n) AS c")
    };
    db.free();
    const row = {mode: "overlay", total, indexed, addMs, dropMs, before, during, after, churn};
    results.push(row);
    console.log(JSON.stringify(row));
  }

  // Separate instance per page: only the page's data, freed on departure.
  let constructTotal = 0, loadTotal = 0, freeTotal = 0;
  const memBefore = mem();
  for (let k = 0; k < cycles; k++) {
    const c = overlayFor(k, total);
    let t = performance.now();
    const db = new CypherliteDb();
    constructTotal += performance.now() - t;
    t = performance.now();
    run(db, ADD_NOTES, {notes: c.notes, scope: c.scope});
    loadTotal += performance.now() - t;
    t = performance.now();
    db.free();
    freeTotal += performance.now() - t;
  }
  const row = {
    mode: "separate",
    total,
    cycles,
    avgConstructMs: Math.round((constructTotal / cycles) * 100) / 100,
    avgLoadMs: Math.round((loadTotal / cycles) * 100) / 100,
    avgFreeMs: Math.round((freeTotal / cycles) * 100) / 100,
    memBeforeMB: memBefore,
    memAfterMB: mem()
  };
  results.push(row);
  console.log(JSON.stringify(row));
}

mkdirSync(new URL("../results/", import.meta.url), {recursive: true});
writeFileSync(new URL("../results/overlay.json", import.meta.url), JSON.stringify(results, null, 2));
