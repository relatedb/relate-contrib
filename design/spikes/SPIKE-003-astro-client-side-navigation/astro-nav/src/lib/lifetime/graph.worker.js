// SharedWorker that owns one CypherLite instance for every page that connects.
// The first page to connect supplies the .wasm bytes and the graph JSON; later
// pages find the instance already there and send nothing. (Pages fetch because
// fetch() inside a SharedWorker failed in the embedded browser used for the
// measurements, while the same fetch in a dedicated worker worked; see SPIKE.md.)
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import {SETUP} from "./overlay.js";

const instanceId = Math.random().toString(36).slice(2, 8);
const startedAt = Date.now();
const LOAD_PAGES = "UNWIND $pages AS p CREATE (:Page {id: p.id, slug: p.slug, title: p.title, section: p.section})";
const LOAD_LINKS = "UNWIND $links AS l MATCH (a:Page {id: l.from}), (b:Page {id: l.to}) CREATE (a)-[:LINKS_TO]->(b)";

let loaded = null; // {db, timings} once a page has supplied the data
let loading = null; // promise while the first load runs
let connections = 0;
let live = 0;

const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;

async function load(wasmBytes, graphText) {
  const timings = {};
  let t = performance.now();
  await init({module_or_path: wasmBytes});
  timings.initMs = ms(t);
  const db = new CypherliteDb();
  const {pages, links} = JSON.parse(graphText);
  t = performance.now();
  db.execute("CREATE INDEX page_id FOR (p:Page) ON (p.id)", null);
  const params = JSON.stringify({pages, links});
  for (const statement of [LOAD_PAGES, LOAD_LINKS]) {
    const result = JSON.parse(db.execute(statement, params));
    if (result.error) throw new Error(result.error);
  }
  for (const statement of SETUP) db.execute(statement, null);
  timings.loadMs = ms(t);
  timings.pages = pages.length;
  timings.links = links.length;
  return {db, timings};
}

onconnect = ({ports: [port]}) => {
  connections++;
  live++;
  port.onmessage = async ({data: {callId, op, cypher, params, wasmBytes, graphText}}) => {
    try {
      if (op === "open") {
        const info = {instanceId, connections, live, startedAt};
        if (loaded) port.postMessage({callId, value: {...info, ready: true, timings: loaded.timings}});
        else port.postMessage({callId, value: {...info, ready: false}});
      } else if (op === "load") {
        const reused = loaded !== null || loading !== null;
        if (!reused) {
          loading = load(wasmBytes, graphText);
          loading.then((l) => (loaded = l), () => (loading = null)); // a failed load can be retried
        }
        const {timings} = await loading;
        port.postMessage({callId, value: {instanceId, reused, timings, connections, live, startedAt}});
      } else if (op === "query") {
        const result = JSON.parse(loaded.db.execute(cypher, params ? JSON.stringify(params) : null));
        if (result.error) throw new Error(result.error);
        port.postMessage({callId, value: result});
      } else if (op === "stats") {
        port.postMessage({callId, value: {instanceId, connections, live, startedAt, ageMs: Date.now() - startedAt}});
      } else if (op === "bye") {
        live--;
      }
    } catch (e) {
      if (callId >= 0) port.postMessage({callId, error: String(e?.message ?? e)});
    }
  };
};
