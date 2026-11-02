// Client for a dedicated-worker CypherLite instance, with recovery.
//
// Surface an adapter has to expose, and nothing more:
//   generation          integer, +1 every time the instance is replaced
//   status              "loading" | "ready" | "recovering"
//   query(cypher, params, {timeoutMs, raw})
//                       resolves with the result, rejects with {trap, timeout, lost}
//   subscribe(cypher, params, listener)
//                       listener({status, generation, rows?, error?}); the query is
//                       re-run on every new generation, so components need no retry code
//   events              [ms since construction, name] log for measurement
export class WorkerDb {
  constructor({graph, store = null}) {
    this.graph = graph;
    this.store = store;
    this.generation = 0;
    this.status = "loading";
    this.events = [];
    this.timings = null;
    this.t0 = performance.now();
    this.subs = new Set();
    this.pending = new Map();
    this.nextId = 0;
    this.worker = null;
    this.ready = null;
    this.#start();
  }

  #log(name) {
    this.events.push([Math.round((performance.now() - this.t0) * 10) / 10, name]);
  }

  #start() {
    this.generation++;
    const generation = this.generation;
    this.status = generation > 1 ? "recovering" : "loading";
    this.#log(`spawn g${generation}`);
    const worker = new Worker(new URL("./db.worker.js", import.meta.url), {type: "module"});
    this.worker = worker;
    worker.onmessage = ({data}) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      clearTimeout(entry.timer);
      if (data.error !== undefined) {
        const error = Object.assign(new Error(data.error), {trap: !!data.trap});
        entry.reject(error);
        if (data.trap && generation === this.generation) this.#recover("trap");
      } else entry.resolve(data);
    };
    worker.onerror = (e) => {
      this.#log(`worker error g${generation}: ${e.message}`);
      if (generation === this.generation) this.#recover("worker error");
    };
    this.ready = this.#send({op: "open", graph: this.graph, store: this.store}).then(({value}) => {
      if (generation !== this.generation) return;
      this.timings = value;
      this.status = "ready";
      this.#log(`ready g${generation}`);
      this.#notify();
    });
    this.ready.catch(() => {});
    this.#notify();
  }

  #recover(reason) {
    this.#log(`recover (${reason}) g${this.generation}`);
    this.worker.terminate();
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(Object.assign(new Error("instance replaced"), {lost: true}));
    }
    this.pending.clear();
    this.#start();
  }

  #send(message, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const entry = {resolve, reject, timer: null};
      if (timeoutMs) {
        const generation = this.generation;
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(Object.assign(new Error(`query exceeded ${timeoutMs} ms`), {timeout: true}));
          if (generation === this.generation) this.#recover("timeout");
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      this.worker.postMessage({id, ...message});
    });
  }

  async query(cypher, params = null, {timeoutMs = 0, raw = false} = {}) {
    for (;;) {
      const generation = this.generation;
      await this.ready;
      if (generation === this.generation && this.status === "ready") break;
    }
    const {value, workerMs} = await this.#send({op: "query", cypher, params, raw}, timeoutMs);
    return {result: value, workerMs};
  }

  // Ends the worker for good (the owner is going away).
  destroy() {
    this.#log("destroy");
    this.worker.terminate();
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(Object.assign(new Error("client destroyed"), {lost: true}));
    }
    this.pending.clear();
    this.destroyed = true;
  }

  get workerId() {
    return this.timings?.workerId ?? null;
  }

  subscribe(cypher, params, listener) {
    const sub = {cypher, params, listener, runGeneration: 0};
    this.subs.add(sub);
    this.#runSub(sub);
    return () => this.subs.delete(sub);
  }

  async #runSub(sub) {
    if (this.status !== "ready") {
      sub.listener({status: this.status, generation: this.generation});
      return;
    }
    const generation = this.generation;
    if (sub.runGeneration === generation) return;
    sub.runGeneration = generation;
    try {
      const {result} = await this.query(sub.cypher, sub.params);
      if (generation === this.generation) sub.listener({status: "ready", generation, rows: result.rows});
    } catch (error) {
      if (!error.lost) sub.listener({status: this.status, generation: this.generation, error: error.message});
    }
  }

  #notify() {
    for (const sub of this.subs) this.#runSub(sub);
  }
}
