// Opens a CypherLite instance in the page and loads the build-time graph into
// it by replay: fixed UNWIND statements over the JSON the site emitted.
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import wasmUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import {normalize} from "./normalize.js";

const LOAD_PAGES = "UNWIND $pages AS p CREATE (:Page {id: p.id, slug: p.slug, title: p.title, section: p.section})";
const LOAD_LINKS = "UNWIND $links AS l MATCH (a:Page {id: l.from}), (b:Page {id: l.to}) CREATE (a)-[:LINKS_TO]->(b)";

const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;

// variant "url": hand the bundler-resolved .wasm URL to init() (what SPIKE-001
// needed under Observable Framework).
// variant "default": call init() with no argument and let the glue resolve the
// binary from its own module URL.
export async function openGraph({graphUrl = "/graph.json", variant = "url", indexed = true} = {}) {
  const timings = {variant, indexed, wasmUrl};
  let t = performance.now();
  await (variant === "default" ? init() : init({module_or_path: wasmUrl}));
  timings.initMs = ms(t);

  t = performance.now();
  const db = new CypherliteDb();
  timings.constructMs = ms(t);

  t = performance.now();
  const response = await fetch(graphUrl);
  const body = await response.text();
  timings.graphFetchMs = ms(t);
  timings.graphBytes = body.length;
  timings.graphEncodedBytes = Number(response.headers.get("content-length")) || null;

  t = performance.now();
  const {pages, links} = JSON.parse(body);
  timings.graphParseMs = ms(t);

  t = performance.now();
  if (indexed) db.execute("CREATE INDEX page_id FOR (p:Page) ON (p.id)", null);
  const params = JSON.stringify({pages, links});
  for (const statement of [LOAD_PAGES, LOAD_LINKS]) {
    const result = JSON.parse(db.execute(statement, params));
    if (result.error) throw new Error(result.error);
  }
  timings.loadMs = ms(t);
  timings.pages = pages.length;
  timings.links = links.length;

  const run = (cypher) => {
    const started = performance.now();
    const result = normalize(JSON.parse(db.execute(cypher, null)));
    result.wallMs = ms(started);
    return result;
  };
  return {db, run, timings};
}
