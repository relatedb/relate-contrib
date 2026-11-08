# Contract: conformance site

An unpublished Observable Framework project in `packages/observable/conformance-site`, built once with `observable build` and served as static files, driven by the core's conformance runner (`packages/web/conformance/run.ts`) in Chromium, Firefox and WebKit under the per-page profile.

## Markup

Cells write the `data-rel-*` markup the runner reads, as defined by the core's example site (`packages/web/conformance/example-site/rel-page.ts`) and as the Astro and Next sites do.

## Pages

| Page | Exercises |
|---|---|
| home, page-1, page-2, notes, blank, broken | the core's scenarios C-01 to C-11 with the loader-published descriptor-and-data graph |
| document | a page's own document, as an object a cell holds and as a data attachment |
| two-graphs | two independent graphs on one page |
| rerun | a cell that opens a graph and reads a range input; the test moves the input 20 times and counts live workers |
| queries | the tagged template, `normalize` and `toGraph` feeding a table, a chart and a select |

## Loaders and variants

`relate.wasm.js`, `relate-worker.js.js` and a graph source with `*.graph.json.js` and `*.descriptor.json.js` publish variant `a`. Variants `b`, `mismatch` and `broken` are plain files chosen by the `variant` query parameter through one literal attachment each (research D-6). The `navigation` query parameter is read by the pages as the core's scenario C-09 expects; the per-page profile is the only profile run, and the scenarios that need a retained instance are skipped.

## Build and serve

remove `docs/.observablehq/cache`, then `observable build`, then a static file server (`serve.mjs`, as the Astro site's). The site's packages are pnpm injected workspace dependencies (research D-4, V-6); `pretest` refreshes them.
