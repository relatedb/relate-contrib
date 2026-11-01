# astro-worker

SPIKE-004 code. See `../SPIKE.md` for the question, method and findings. It is SPIKE-003's `astro-nav` (copied) plus a dedicated-worker host with recovery. Setup is the same as `astro-graph`'s: build the WASM package into `.wasm-build/`, then `npm install`.

- `src/lib/worker/db.worker.js`: the dedicated worker. It fetches the binary and graph, replays them (or opens an origin-private store and replays only when the store is empty), and marks itself unusable after the first trap.
- `src/lib/worker/workerDb.js`: the client. Exposes `generation`, `status`, `query(cypher, params, {timeoutMs, raw})` and `subscribe(cypher, params, listener)`. A trap, a timeout or a worker error terminates the worker, starts a new one, and re-runs every subscription.
- `src/pages/bench.astro`: `/bench/?host=main|worker&graph=/synthetic/graph-1000.json[&store=name][&runs=30]` measures load, main-thread gaps and per-query cost; results in `window.__bench`.
- `src/pages/fault.astro`: `window.__fault.start(graph, store)`, `.trap()`, `.runaway(ms)`, `.ping()` drive the fault experiments from the console.
- `src/pages/life/[mode]/[n].astro`: SPIKE-003's lifetime pages, with a new `dedicated` mode that uses `WorkerDb`.
- `scripts/trap.mjs`: which statements trap the engine (Node). `scripts/synthesize.mjs 20000` writes the larger graph.
- `results/browser-runs.json`: the numbers behind SPIKE.md.

```bash
node scripts/synthesize.mjs 100,1000,5000,20000
npm run build && npx astro preview --port 4341
```
