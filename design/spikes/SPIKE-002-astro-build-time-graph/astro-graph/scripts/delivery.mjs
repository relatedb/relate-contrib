// SPIKE-002 step 1: how can the WASM build take a content graph, and what does
// each route cost? Runs the real WASM engine in Node over synthetic sites of
// increasing size and compares:
//   A1  one CREATE statement with variables for every page and link
//   A2  a script of one statement per page, then one MATCH+CREATE per link
//   B   UNWIND over parameters: the graph ships as JSON data, the statements are fixed
// Node timings are indicative only: the engine is the same WASM module the
// browser runs, but a browser adds its own start-up and slower cores.
//
// Usage: node scripts/delivery.mjs [sizes, e.g. 10,100,1000] [--indexed]
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {brotliCompressSync, gzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";

const args = process.argv.slice(2);
const sizes = (args.find((a) => /^\d/.test(a)) ?? "10,100,1000,5000").split(",").map(Number);
const indexed = args.includes("--indexed");
const LINKS_PER_PAGE = 5;
const SKIP_AFTER_MS = 20_000;

await init({module_or_path: readFileSync(fileURLToPath(new URL("../.wasm-build/pkg/cypherlite_bg.wasm", import.meta.url)))});

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic synthetic site: n pages in 8 sections; each page links to
// LINKS_PER_PAGE other pages, mostly inside its own section.
function site(n) {
  const rand = mulberry32(42);
  const pages = Array.from({length: n}, (_, id) => ({id, slug: `page-${id}`, title: `Page ${id}`, section: id % 8}));
  const links = [];
  for (const p of pages) {
    const seen = new Set([p.id]);
    for (let k = 0; k < Math.min(LINKS_PER_PAGE, n - 1); k++) {
      let to;
      do {
        const sameSection = rand() < 0.7;
        to = sameSection ? Math.floor(rand() * Math.ceil(n / 8)) * 8 + p.section : Math.floor(rand() * n);
        if (to >= n) to = Math.floor(rand() * n);
      } while (seen.has(to));
      seen.add(to);
      links.push({from: p.id, to});
    }
  }
  return {pages, links};
}

const q = (s) => `'${String(s).replace(/'/g, "\\'")}'`;
const props = (p) => `{id: ${p.id}, slug: ${q(p.slug)}, title: ${q(p.title)}, section: ${p.section}}`;

const routes = {
  A1: {
    label: "single CREATE",
    payload: ({pages, links}) =>
      "CREATE " +
      [...pages.map((p) => `(p${p.id}:Page ${props(p)})`), ...links.map((l) => `(p${l.from})-[:LINKS_TO]->(p${l.to})`)].join(",\n       "),
    load: (db, text) => JSON.parse(db.execute(text, null)).error
  },
  A2: {
    label: "script, statement per item",
    payload: ({pages, links}) =>
      [
        ...(indexed ? ["CREATE INDEX page_id FOR (p:Page) ON (p.id);"] : []),
        ...pages.map((p) => `CREATE (:Page ${props(p)});`),
        ...links.map((l) => `MATCH (a:Page {id: ${l.from}}), (b:Page {id: ${l.to}}) CREATE (a)-[:LINKS_TO]->(b);`)
      ].join("\n"),
    load: (db, text) => db.executeScript(text, null).map((e) => JSON.parse(e)).find((e) => e.error)?.error ?? null
  },
  B: {
    label: "UNWIND over parameters",
    payload: ({pages, links}) => JSON.stringify({pages, links}),
    load: (db, json) => {
      if (indexed) db.execute("CREATE INDEX page_id FOR (p:Page) ON (p.id)", null);
      const a = JSON.parse(db.execute("UNWIND $pages AS p CREATE (:Page {id: p.id, slug: p.slug, title: p.title, section: p.section})", json));
      if (a.error) return a.error;
      const b = JSON.parse(
        db.execute("UNWIND $links AS l MATCH (a:Page {id: l.from}), (b:Page {id: l.to}) CREATE (a)-[:LINKS_TO]->(b)", json)
      );
      return b.error;
    }
  }
};

const one = (db, cypher) => JSON.parse(db.execute(cypher, null));
const time = (fn) => {
  const t0 = performance.now();
  const value = fn();
  return [performance.now() - t0, value];
};

const results = [];
const skipped = new Set();
for (const n of sizes) {
  const data = site(n);
  for (const [key, route] of Object.entries(routes)) {
    if (skipped.has(key)) {
      results.push({n, route: key, skipped: true});
      continue;
    }
    const payload = route.payload(data);
    const bytes = Buffer.byteLength(payload);
    const db = new CypherliteDb();
    let loadMs, error;
    try {
      [loadMs, error] = time(() => route.load(db, payload));
    } catch (e) {
      error = String(e).slice(0, 200);
    }
    const row = {n, route: key, bytes, gzip: gzipSync(payload).length, brotli: brotliCompressSync(payload).length, loadMs, error: error ?? null};
    if (!error) {
      row.pages = one(db, "MATCH (p:Page) RETURN count(p) AS c").rows[0].c;
      row.links = one(db, "MATCH ()-[r:LINKS_TO]->() RETURN count(r) AS c").rows[0].c;
      row.neighborsMs = time(() => one(db, "MATCH (p:Page {id: 0})-[:LINKS_TO]->(q) RETURN count(q) AS c"))[0];
      row.twoHopMs = time(() => one(db, "MATCH (p:Page {id: 0})-[:LINKS_TO*2]->(q) RETURN count(DISTINCT q) AS c"))[0];
    }
    if (error || loadMs > SKIP_AFTER_MS) skipped.add(key);
    db.free();
    results.push(row);
    console.log(JSON.stringify(row));
  }
}

const kb = (b) => (b == null ? "" : (b / 1024).toFixed(1));
const ms = (v) => (v == null ? "" : v.toFixed(1));
console.log(`\n${indexed ? "with" : "without"} an index on Page.id\n`);
console.log("| pages | route | payload KB | gzip KB | brotli KB | load ms | 1-hop ms | 2-hop ms | result |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  const status = r.skipped ? "skipped (previous size too slow)" : r.error ? `error: ${String(r.error).slice(0, 60)}` : `${r.pages} pages, ${r.links} links`;
  console.log(`| ${r.n} | ${r.route} | ${kb(r.bytes)} | ${kb(r.gzip)} | ${kb(r.brotli)} | ${ms(r.loadMs)} | ${ms(r.neighborsMs)} | ${ms(r.twoHopMs)} | ${status} |`);
}
mkdirSync(new URL("../results/", import.meta.url), {recursive: true});
writeFileSync(new URL(`../results/delivery-${indexed ? "indexed" : "plain"}.json`, import.meta.url), JSON.stringify(results, null, 2));
