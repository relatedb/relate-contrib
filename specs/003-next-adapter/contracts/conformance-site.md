# Contract: conformance site

An unpublished Next app in `packages/next/conformance-site`, built once per profile and in each form below, driven by the core's conformance runner (`packages/core/conformance/run.ts`) in Chromium, Firefox and WebKit.

## Markup

The pages reproduce the `data-gw-*` markup the runner reads, as defined by the core's example site (`packages/core/conformance/example-site/gw-page.ts`) and as the Astro conformance site does.

## Pages

| Page | Exercises |
|---|---|
| home, page-1, page-2, notes, blank, broken | the core's scenarios C-01 to C-11 with a shared (`"visit"`) registered graph |
| inline | a page with its own inline graph, with and without `config` |
| two-graphs | two independent graphs on one page |
| lifetime-a, lifetime-b | a registered page-lifetime graph used by consecutive pages; two pages with inline graphs of the same name and different content |
| direct | the direct lookup for a visit graph, a page graph and an inline graph |

## Builds

| Variable | Values | Effect |
|---|---|---|
| `NAVIGATION` | `client-routing`, `multi-page` | the profile passed to the provider |
| `EXPORT` | unset, `1` | production server build, or `output: "export"` served as static files |
| `CACHE_COMPONENTS` | unset, `1` | adds `cacheComponents: true`; used for the lifecycle and inline-graph tests only |
| `BUNDLER` | `turbopack`, `webpack` | which bundler builds (the default run uses Turbopack; the package test covers both) |

## Runner parameters

Variant `a` is served through the route; variants `b`, `mismatch` and `broken` are static files in `public/` selected by the descriptor override; the runner's data-request matchers (`dataRequests`) match the hashed URLs, as for the Astro site (ADR-004 §6).
