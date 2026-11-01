import {FileAttachment} from "observablehq:stdlib";
import init, {CypherliteDb} from "@neo4j-labs/cypherlite-wasm";
import {normalize} from "./normalize.js";
import {makeCypher} from "./cypherTag.js";

let opened;

// Open the in-memory database once per page. The .wasm binary is served as a
// static file (see scripts/sync-wasm.js) and its URL is passed to init()
// explicitly; the glue's default `new URL(..., import.meta.url)` lookup does
// not resolve under Framework's bundler.
export function openDb() {
  opened ??= (async () => {
    const t0 = performance.now();
    const url = await FileAttachment("../data/cypherlite_bg.wasm").url();
    const t1 = performance.now();
    await init({module_or_path: url});
    const t2 = performance.now();
    const db = new CypherliteDb();
    const t3 = performance.now();
    return {db, timings: {resolveUrl: t1 - t0, init: t2 - t1, construct: t3 - t2}};
  })();
  return opened;
}

// Run one statement and return the parsed wire envelope, unmodified.
export async function rawQuery(cypher, params = null) {
  const {db} = await openDb();
  return JSON.parse(db.execute(cypher, params == null ? null : JSON.stringify(params)));
}

// Run one statement and return the normalized result (see normalize.js).
export async function query(cypher, params = null) {
  return normalize(await rawQuery(cypher, params));
}

// Observable-style tagged template; see cypherTag.js.
export const cypher = makeCypher((text, params) => query(text, params));

export async function runScript(script) {
  const {db} = await openDb();
  return db.executeScript(script, null).map((envelope) => JSON.parse(envelope));
}
