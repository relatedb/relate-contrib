# Contract: conformance site

An unpublished SvelteKit app in `packages/sveltekit/conformance-site`, built once per profile and once per output, driven by the core's conformance runner (`packages/web/conformance/run.ts`) in Chromium, Firefox and WebKit.

## Markup

The pages reproduce the `data-rel-*` markup the runner reads, as defined by the core's example site (`packages/web/conformance/example-site/rel-page.ts`) and as the Astro and Next sites do.

## Pages

| Page | Exercises |
|---|---|
| home, page-1, page-2, notes, blank, broken | the core's scenarios C-01 to C-11 with a shared (`"visit"`) registered graph |
| inline-a, inline-b | pages with their own inline graph, with and without `config`, the same id with different content |
| two-graphs | two independent graphs on one page |
| lifetime-a, lifetime-b | consecutive pages that use one registered page-lifetime graph |
| lifetime-c | a page that uses a different registered page-lifetime graph |
| direct | the direct lookup for a visit graph, a page graph and an inline graph |
| live | a page rendered on demand (Node output only) with a holder |

## Builds

| Variable | Values | Effect |
|---|---|---|
| `NAVIGATION` | `client-routing`, `multi-page` | the profile passed to the provider; `multi-page` adds `data-sveltekit-reload` to the body through the `handle` hook |
| `ADAPTER` | `static`, `node` | the output: files served by a static server, or a Node server |
| `BASE` | unset, `/docs` | a base path |
| `OUT` | a directory name | the build's output directory |

## Runner parameters

Variant `a` is served through the route; variants `b`, `mismatch` and `broken` are static files in `static/` selected by the descriptor override; the runner's data-request matchers match the revision-named URLs, as for the Astro and Next sites.
