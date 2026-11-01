// Dedicated worker that owns one CypherLite instance. The worker fetches the
// binary and the graph itself and replays the graph with fixed statements, or
// (with a store name) opens an origin-private store and replays only when the
// store is empty.
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import wasmUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import {isWasmTrap} from "@neo4j-labs/cypherlite-wasm/trap.js";

const LOAD_PAGES = "UNWIND $pages AS p CREATE (:Page {id: p.id, slug: p.slug, title: p.title, section: p.section})";
const LOAD_LINKS = "UNWIND $links AS l MATCH (a:Page {id: l.from}), (b:Page {id: l.to}) CREATE (a)-[:LINKS_TO]->(b)";
const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;

let db = null;
let poisoned = false; // set by the first trap; every later call fails

const run = (cypher, params) => {
  const result = JSON.parse(db.execute(cypher, params ? JSON.stringify(params) : null));
  if (result.error) throw new Error(result.error);
  return result;
};

async function open({graph, store}) {
  const timings = {};
  const wall = performance.now();
  let t = performance.now();
  await init({module_or_path: wasmUrl});
  timings.initMs = ms(t);
  t = performance.now();
  db = store ? await CypherliteDb.open(`opfs://${store}`) : new CypherliteDb();
  timings.openMs = ms(t);
  const existing = store ? run("MATCH (p:Page) RETURN count(p) AS c").rows[0].c : 0;
  if (existing > 0) {
    timings.restored = true;
    timings.pages = existing;
  } else {
    t = performance.now();
    const body = await (await fetch(graph)).text();
    timings.graphFetchMs = ms(t);
    t = performance.now();
    const {pages, links} = JSON.parse(body);
    timings.graphParseMs = ms(t);
    t = performance.now();
    run("CREATE INDEX page_id FOR (p:Page) ON (p.id)");
    const params = {pages, links};
    run(LOAD_PAGES, params);
    run(LOAD_LINKS, params);
    timings.loadMs = ms(t);
    timings.pages = pages.length;
    timings.links = links.length;
  }
  timings.totalMs = ms(wall);
  return timings;
}

self.onmessage = async ({data: {id, op, graph, store, cypher, params, raw}}) => {
  try {
    if (op === "open") {
      self.postMessage({id, value: await open({graph, store})});
    } else if (op === "query") {
      if (poisoned) {
        self.postMessage({id, error: "instance is unusable after a trap", trap: true});
        return;
      }
      const started = performance.now();
      const text = db.execute(cypher, params ? JSON.stringify(params) : null);
      const workerMs = ms(started);
      if (raw) {
        self.postMessage({id, value: text, workerMs});
      } else {
        const result = JSON.parse(text);
        if (result.error) self.postMessage({id, error: result.error, workerMs});
        else self.postMessage({id, value: result, workerMs});
      }
    }
  } catch (e) {
    const trap = isWasmTrap(e);
    if (trap) poisoned = true;
    self.postMessage({id, error: String(e?.message ?? e), trap});
  }
};
