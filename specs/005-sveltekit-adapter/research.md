# Research: SvelteKit Adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-08

This file records the checks made while planning (V-1 to V-9) and the decisions that follow. They are single runs on SvelteKit 3.1.1, Svelte 5.57.3, Vite 8.3.6, Node 24.14.1, macOS arm64, in Playwright's Chromium, Firefox and WebKit, with the fixtures in [`verify/`](verify/README.md), built in a temporary copy of the SPIKE-007 app whose dependencies were tarballs of the core, the engine and a probe package (so, as published). ADR-007 §4 listed items for implementation; V-1 to V-8 answer them early because two could have changed the design.

## Checks

### V-1. `resolve()` from `$app/paths` works in a package compiled by the site's build

A packed package whose `.svelte.js` module imported `resolve` from `$app/paths` and whose component called it was compiled by the site's build, prerendered and hydrated. During prerendering it returned a path relative to the page (`./relate/example/descriptor.json`), with and without `paths.base = "/docs"`; in the browser it returned the base-prefixed path (`/docs/relate/example/descriptor.json`), with no hydration warning. A location is only fetched in the browser, so the server's value never matters. ADR-007 §2.2 says the base path joins "in the browser and in the server render"; it joins in the browser, and the server render gets a relative path (amended in ADR-007 §6).

### V-2. A `.svelte.ts` module in a package fails `vite dev`; `.svelte.js` works

The probe package's rune module, written in TypeScript as `paths.svelte.ts`, built in production (SPIKE-007 5.7, 5.8) but `vite dev` stopped in dependency optimization: `[plugin vite-plugin-svelte:optimize-module] … paths.svelte.ts:3:29 Unexpected token`. The same module as `paths.svelte.js` (plain JavaScript, JSDoc types) started the dev server and rendered the page; a `.svelte` component with `lang="ts"` in the same package rendered in dev. Decision D-1 follows.

### V-3. An inline graph written on the server only is removed by hydration

Two components wrote the same `<script type="application/json" data-relate-graph>` element: `GdY.svelte` with `{@html …}` on both sides, and `GdX.svelte` with the element inside `{#if import.meta.env.SSR}`. After hydration the document held 1 element for the first and 0 for the second, in Chromium. Neither printed a warning. In both pages the document's literal appears in the prerendered HTML and in the page's client code (a document built in a `load` function would instead be in the page's hydration data), so the document is in the page twice either way; a tiny document made the total script size 91.1 kB against 90.5 kB. Decision D-3 follows.

### V-4. A build fails for a throwing source, a non-deterministic source and an invalid document

With a stand-in route builder (`verify/app/src/lib/route.ts`): a source that throws, one that returns different content on each call (caught by `entries()` evaluating twice) and one that returns an invalid document each made `vite build` exit 1, with `graph "bad": the source failed: …`, `graph "bad": the source is not deterministic: two evaluations differ` and `graph "bad": nodes[0].id: a node id must be a non-empty string`. The same builder with good sources wrote the descriptor and the revision-named data file.

### V-5. The Node output serves the prerendered endpoint

`adapter-node` wrote the endpoint's files to `build-node/prerendered/relate/example/` (with `.br` and `.gz` copies) and its server answered the descriptor with status 200 and `application/json`, the data file 200, another revision 404 and another graph id 404.

### V-6. The development server follows a source edit

Under `vite dev` the stand-in builder (evaluating on each request) answered a descriptor, then, after a source file was edited, a descriptor with a new revision within two seconds; the new data file answered 200, the old revision 404 and an unknown id 404.

### V-7. A holder hydrates in a page rendered on demand

A page with `export const prerender = false`, built with `adapter-node` and run, answered on-demand with the placeholder markup (`…`, first render `server`); in Chromium, Firefox and WebKit it hydrated, subscribed through the visit client and showed 3, with no warning.

### V-8. `data-sveltekit-reload` on the body makes every link a document load

With the attribute on `<body>` in `app.html`, following a link between the two inline pages loaded a new document (a marker set on `window` was gone) and the inline element was found (one element, the right content) in all three browsers.

### V-9. A symlinked package under `node_modules` needs the development allow list

From SPIKE-007 5.2 (not rerun): a workspace-linked core builds in production, and `vite dev` answers its worker with 403 until `server.fs.allow` includes the repository root. Whether the adapter's own Svelte source, linked from `packages/sveltekit`, compiles in the conformance site's build is not yet checked; the first task of the conformance site checks it, with pnpm's injected copy as the fallback (as for the Observable adapter).

## Decisions

### D-1. Rune modules are `.svelte.js`, with types written by hand

The adapter's rune modules are plain JavaScript files named `*.svelte.js`, typed with JSDoc and with a `.d.ts` beside each; components are `.svelte` and may use TypeScript. Rejected: `.svelte.ts` (V-2) and `optimizeDeps.exclude` in the site (a site setting the adapter should not need, FR-003). The registry, lookup and location modules that hold no runes are plain `.js` as well, so they run in Node tests.

### D-2. Locations are built in the browser

The catalog carries no locations; the helpers build a descriptor's location with `resolve()` (V-1) when they acquire a graph, which only happens after mount.

### D-3. `GraphData` writes the same element on the server and in the browser

It uses `{@html}` unconditionally (V-3), validates in both places (the core's check is small), and never gates the element on a server flag. The document being in the page twice is a stated cost (ADR-007 §4). Not taken: reading an inline graph from the page's data instead of an element, which would hold the document once in SvelteKit's own payload and tie the adapter to `page.data`; revisit if inline size matters.

### D-4. The registry is plain JavaScript

Counting holders, the deferred destroy, the visit clients, the inline-element lookup and the location builder live in modules without runes (`registry.js`, `inline.js`, `locations.js`), and the Svelte wrappers (`use-graph.svelte.js`, the two components) only connect them to `onMount`. The registry then has Node unit tests with a stub client, and the browser tests cover the wrappers.

### D-5. The conformance site's variants come from hooks and environment values

`NAVIGATION=multi-page` adds `data-sveltekit-reload` to the body through the site's `handle` hook (`transformPageChunk`), which also applies when prerendering; `ADAPTER=static|node`, `BASE` and `OUT` choose the output, as in the spike. The core's variants `b`, `mismatch` and `broken` are static files in `static/`, selected by the descriptor override, as the Astro and Next sites do.

### D-6. The route builder derives the base path from the request

`GET` takes everything in `url.pathname` before `/relate/` as the base, so it needs no `$app` module and no site setting (ADR-007 §2.2). A path without `/relate/` answers 404.

## Consequences for ADR-007

The amendment of 2026-11-08 in ADR-007 §6 records D-1, the changed `resolve()` statement and D-3, and the items V-4 to V-8 settle.
