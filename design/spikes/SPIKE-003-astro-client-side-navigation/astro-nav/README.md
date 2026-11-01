# astro-nav

SPIKE-003 code. See `../SPIKE.md` for the question, method and findings. It is the SPIKE-002 Astro site (`astro-graph`, copied) extended with client-side routing and six instance lifetimes. Setup is the same as `astro-graph`'s: build the WASM package into `.wasm-build/`, then `npm install`.

## Lifetimes

`/life/<mode>/<n>/` (n = 1 to 5) serves the same page under each mode:

| mode | router | instance |
|---|---|---|
| `reload` | off | new main-thread instance on every page load |
| `baseline` | on | new main-thread instance on every navigation |
| `singleton` | on | one main-thread instance in module state |
| `persist` | on | singleton, plus the island kept in the DOM with `transition:persist` |
| `naive` | on | singleton, with a component that reads instance state during render (hydration mismatch demo) |
| `worker` | off | one instance in a SharedWorker |
| `worker-router` | on | SharedWorker, with client-side routing |

Settings carried in the query string and kept in `sessionStorage`: `?graph=/synthetic/graph-1000.json` (graph to load; `/missing.json` simulates a load failure) and `&workerName=v2` (a different SharedWorker identity).

## Where things are

- `src/lib/lifetime/host.js`: the three hosts behind one interface (`query`, `release`).
- `src/lib/lifetime/graph.worker.js`: the SharedWorker. The first page to connect sends the `.wasm` bytes and the graph JSON.
- `src/lib/lifetime/overlay.js`: page-scoped notes added on arrival and dropped on departure.
- `src/components/GraphPanel.tsx`: the React island; records one log entry per arrival (`window.__lifetimeLog`, `sessionStorage` key `lifetime.log`).
- `scripts/overlay.mjs`: the add/remove experiment in Node (`node scripts/overlay.mjs 1000,5000 100`), output in `results/overlay.json`.

```bash
node scripts/synthesize.mjs 100,1000,5000
npm run build && npm run preview
```
