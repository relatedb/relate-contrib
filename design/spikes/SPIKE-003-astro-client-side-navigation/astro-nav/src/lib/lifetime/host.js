// Three ways to give a page a CypherLite instance, behind one interface:
//   instance   a new main-thread instance for every arrival (freed on departure)
//   singleton  one main-thread instance kept in module state across arrivals
//   worker     one instance in a SharedWorker, reached over a message port
// Every host exposes {kind, instanceId, reused, timings, totalPages, query, release}.
import {openGraph} from "../graphClient.js";
import wasmUrl from "@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url";
import {SETUP} from "./overlay.js";

const id = () => Math.random().toString(36).slice(2, 8);

async function openMainThread(config) {
  const {db, timings} = await openGraph({graphUrl: config.graph});
  for (const statement of SETUP) db.execute(statement, null);
  const instanceId = id();
  const host = {
    kind: "main-thread",
    instanceId,
    timings,
    totalPages: timings.pages,
    query(cypher, params) {
      const result = JSON.parse(db.execute(cypher, params ? JSON.stringify(params) : null));
      if (result.error) throw new Error(result.error);
      return result;
    },
    free() {
      db.free();
    }
  };
  return host;
}

let singleton = null;

export async function acquire(mode, config) {
  if (mode === "singleton") {
    const reused = singleton !== null;
    singleton ??= openMainThread(config);
    const host = await singleton;
    return {...host, reused, release() {}};
  }
  if (mode === "worker") return acquireWorker(config);
  const host = await openMainThread(config);
  return {...host, reused: false, release: () => host.free()};
}

function acquireWorker(config) {
  const worker = new SharedWorker(new URL("./graph.worker.js", import.meta.url), {type: "module", name: config.workerName});
  const port = worker.port;
  const pending = new Map();
  let next = 0;
  const call = (op, payload = {}) =>
    new Promise((resolve, reject) => {
      const callId = next++;
      pending.set(callId, {resolve, reject});
      port.postMessage({callId, op, ...payload});
    });
  port.onmessage = ({data}) => {
    const entry = pending.get(data.callId);
    pending.delete(data.callId);
    if (!entry) return;
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.value);
  };
  port.start();
  const wrap = (opened, reused) => ({
    kind: "shared-worker",
    instanceId: opened.instanceId,
    reused,
    timings: opened.timings,
    totalPages: opened.timings.pages,
    connections: opened.connections,
    query: (cypher, params) => call("query", {cypher, params}),
    stats: () => call("stats"),
    release() {
      port.postMessage({callId: -1, op: "bye"});
      port.close();
    }
  });
  return call("open").then(async (opened) => {
    if (opened.ready) return wrap(opened, true);
    // First page: supply the binary and the graph.
    const [wasmBytes, graphText] = await Promise.all([
      fetch(wasmUrl).then((r) => r.arrayBuffer()),
      fetch(config.graph).then((r) => {
        if (!r.ok) throw new Error(`graph ${config.graph}: ${r.status}`);
        return r.text();
      })
    ]);
    const loaded = await new Promise((resolve, reject) => {
      const callId = next++;
      pending.set(callId, {resolve, reject});
      port.postMessage({callId, op: "load", wasmBytes, graphText}, [wasmBytes]);
    });
    return wrap(loaded, loaded.reused);
  });
}
