# astro-survival

SPIKE-005 code. See `../SPIKE.md`. It is SPIKE-004's `astro-worker` (copied) reduced to the pages that test whether a worker client survives Astro route changes. Setup is the same as `astro-graph`'s: build the WASM package into `.wasm-build/`, then `npm install`.

- `src/pages/surv/[variant]/[n].astro`: five pages per variant.
  - `module`: the client is held in module state; the island remounts on each page and asks for it.
  - `island`: the island creates its own client and destroys it on unmount.
  - `persist`: the island (with its own client) is kept across swaps with `transition:persist` and re-registers its query on `astro:page-load`.
  - `plain`: no router; every page is a full load.
  - Each page links to the others, a `data-astro-reload` link, and a page without the router.
- `src/components/SurvivalPanel.tsx`: records one entry per arrival (document id, module id, client token, worker id, generation, spawn count, subscription count) in `window.__surv.log`.
- `src/layouts/Survival.astro`: the router, with `fallback="swap"`. `?vt=0` (kept in `sessionStorage`) removes `document.startViewTransition` before the router loads, so the router takes its simulation path, which does not wait for the browser to render. Without it the real view-transition path runs.
- `src/lib/survival/client.js`: the module-scope worker client; `src/lib/worker/`: the worker and its client from SPIKE-004 (plus `destroy()` and a worker id).
- `src/pages/storecost.astro`: add and drop of page-scoped data against an in-memory instance and an open store.

```bash
node scripts/synthesize.mjs 100,1000,5000,20000
npm run build && npx astro preview --port 4351
# open /surv/module/1/?graph=/synthetic/graph-1000.json&vt=0
```
