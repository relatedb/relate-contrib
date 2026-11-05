# Research: Astro Adapter

Findings that shaped the plan. "Verify" items are unmeasured assumptions; each becomes an early task (a short check against the installed Astro 7) before its dependent code is written (constitution V).

## R-1. Astro version and peers

- **Decision**: peer `astro` `^7.4`; develop against 7.4.5 (current) after confirming the spikes' behavior on 7.4.4 still holds.
- **Rationale**: SPIKE-002, -003 and -005 ran on 7.4.4; ADR-004 names Astro 7 only.
- **Alternatives**: a wider range. Rejected: other versions are not checked (spec scope).

## R-2. Serving the registered files

- **Decision**: the integration calls `injectRoute` once, with the pattern `/_relate/[id]/[file]` and `prerender: true`, and an entrypoint file in the package whose `getStaticPaths` returns two entries per registered graph (`descriptor.json` and `graph.<revision>.json`). The entrypoint reads a shared, memoized evaluation of every source.
- **Rationale**: SPIKE-002 produced the correct graph from a `src/pages` static endpoint over `astro:content`. One dynamic route keeps the route list independent of the number of graphs, and the memoized evaluation gives FR-008 (one evaluation per build).
- **Finding (V-1, 2026-11-04, Astro 7.4.5, Node 24)**: confirmed for `astro build` and `astro dev` with the integration and route entrypoint outside the project root (code: `packages/astro/tests/verify/v1`). An injected route `/_relate/[id]/[file]` with `prerender: true` and a `getStaticPaths` that awaits a user source importing `astro:content` generated `/_relate/x/graph.json` with the collection's entries, and the dev server served it and reflected a newly added content file on the next request. Not yet checked: the integration installed as a packed package under `node_modules` (task T064).
- **Verify (V-1, original statement)**: that an injected route's entrypoint, in a package under `node_modules` (and linked in the workspace), can import a user source that itself imports `astro:content`, in `astro build` and `astro dev`. SPIKE-002 did not use `injectRoute`; its type exists in 7.4.4 (`integrations.d.ts`).
- **Alternatives**: one injected route per graph (more routes, same behavior); a generated `src/pages` file (writes into the user's tree). Rejected.

## R-3. Sources and the virtual modules

- **Decision**: a Vite plugin in the integration provides `virtual:relate-web/config` (names, descriptor URLs including `BASE_URL`, lifetimes, indexes, profile; imported by the client module) and `virtual:relate-web/sources` (imports each source module or JSON file; used only on the server by the route entrypoint). A source module default-exports a function; a JSON file is wrapped as a function returning its content.
- **Rationale**: sources go through Vite so they can use `astro:content` (FR-003); keeping the sources module out of the client config keeps documents out of the page bundle.
- **Finding (V-2, 2026-11-04)**: `getStaticPaths` runs on each request in the dev server and the source module is re-imported when its file changes, so no explicit invalidation is needed and the descriptor's revision follows an edit (test: `packages/astro/tests/build/dev.test.ts`). Test processes must not inherit `NODE_ENV=test` or the agent variables (`AI_AGENT`, `CLAUDECODE`): with the first the dev server serves nothing, with the second `astro dev` starts a background daemon.
- **Verify (V-2, original statement)**: the dev server re-evaluates a source when a file it imports changes (Vite module invalidation of the sources module on watcher events) and the descriptor's revision follows.
- **Dev failure**: the memoized evaluation stores either a result or the error. A failing source prints the error and the route answers `500` with the error text for that graph's two files; the next successful evaluation replaces it (spec FR-011).

- **Finding (client-routing, 2026-11-04)**: the core's `createSiteClient` under `client-routing` returns one client for the whole visit whatever graph is asked for, so two `visit` graphs would silently share the first. The client module therefore keeps visit-lifetime clients by name in module state, made with the core's `createClient` under `client-routing` and with `createSiteClient` under `multi-page`; behavior is the core's persistent profile for one graph and correct for several. ADR-004 says "made with `createSiteClient`"; this is a refinement to record in its amendments.
- **Finding (base, mode, 2026-11-04)**: `import.meta.env.BASE_URL` and `PROD` in the injected route are unreliable under a programmatic build (the test process's `NODE_ENV`); the plugin passes the site's `base` and whether the command is `dev` through the sources module instead.

## R-4. Revision and canonical form

- **Decision**: canonical form = JSON with object keys sorted at every level, node order by `id`, link order by `(source, target, type)` then canonical properties; array-valued properties keep their order (order is data). Revision = first 12 hex of SHA-256 of that text. The data file is written in the same canonical text so the bytes match the hash.
- **Rationale**: spec FR-007 and SC-002 (same content, same revision; changed content, new revision). Node and link order carry no meaning in ADR-002, so sorting them is safe; property arrays do carry order.
- **Alternatives**: hashing the source's raw output (varies with key order). Rejected.

## R-5. The inline graph component

- **Decision**: `GraphData.astro` (exported as `@relate/web-astro/graph-data`) takes `id`, `document` and optional `config` (`{ indexes }`). It validates with the core's validator at render, then writes `<script type="application/json" data-relate-graph="<id>">{document, config}</script>` with `<`, `>`, `&` and U+2028/2029 escaped. The duplicate-name check uses a per-render-request set; the registered-name check reads the integration's config.
- **Rationale**: inert data costs no request and cannot execute; escaping avoids closing the script early.
- **Finding (V-3, linked, 2026-11-04)**: `GraphData.astro` imported from a workspace-linked `node_modules/@relate/web-astro` compiles in `astro build` with `ssr.noExternal` (build tests `tests/build/inline.test.ts`). The component imports its helpers from `../dist`, because only `src/GraphData.astro` and `dist` are published. A packed install is still to be checked (task T064).
- **Verify (V-3, original statement)**: the package's `.astro` file is compiled when installed under `node_modules`; the integration adds the package to `vite.ssr.noExternal` through `updateConfig`. Check in the clean-install test.
- **Alternatives**: `define:vars` (executes script), a data attribute (size limits, escaping). Rejected.

## R-6. Page lifecycle in Astro

- **Facts** (SPIKE-003, -005; Astro docs): a bundled module script runs once per document; with `ClientRouter`, `astro:before-swap` and `astro:page-load` fire around each swap; `astro:page-load` fires on the initial load only when the router is present.
- **Decision**: the page entry (a) runs registered setups at first load once the DOM is ready, whether or not the router exists, and ignores the router's first `astro:page-load` for that document; (b) runs setups again on later `astro:page-load` events; (c) runs cleanups on `astro:before-swap` and `pagehide`. Registration is global to the module, so a page-specific setup would otherwise run on pages that do not carry it: see D-2 (`selector`).
- **Finding (V-4 and V-5, 2026-11-04, Astro 7.4.5)**: with the router (`<ClientRouter fallback="swap" />`) and without it, a setup registered by a layout-level script ran exactly once on the first page, ran again on each later page the router brought in, and its cleanup and the page client's `destroy()` ran before the next page's setup (`tests/browser/lifecycle.spec.ts`, Chromium, Firefox and WebKit). The router was not given a no-animation override, so each browser used its own view-transition path (SPIKE-005 only saw the no-animation path): a `visit` graph kept one instance and generation across link click, history back and forward, and a script `navigate()`. A page-scoped script that ran once per document and registered with a selector stayed off pages where the selector did not match. The registration runs at the first `onPage` call when the document is ready, so a script that a later page loads for the first time runs its setup at once and its `astro:page-load` finds it already run.
- **Verify (V-4, original statement)**: first-load ordering with and without the router (single run per document, no double run), and the departing page's cleanup finishing before the next page's setup (spec US3 scenario 1 and 2).
- **Verify (V-5)**: real view-transition path in Chromium, Firefox and WebKit (SPIKE-005 only saw the no-animation path).

## R-7. The engine binary and the dev server

- **Decision**: the client module imports `@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm?url`; the integration adds `optimizeDeps.exclude` for the engine package so the dev server does not pre-bundle it (the core's own site does the same).
- **Rationale**: SPIKE-002 saw the production bundler place and hash the binary without a workaround; the core's Vite config shows the dev-server exclusion.
- **Verify (V-6)**: dev server serves the binary and the worker from a packed (not linked) install.

## R-8. Conformance against the core's runner

- **Facts**: the runner expects fixed page paths, a `blank.html`, `variant` query values and request-URL substrings (see plan D-1). `build.format: "file"` makes Astro emit `page-1.html` rather than `page-1/index.html`.
- **Decision**: the conformance site sets `build: { format: "file" }`, mirrors the example site's pages and markup, serves variant `a` through the integration, and serves the other variants as D-1 describes.

## R-9. Tests

- **Decision**: Vitest for pure logic and for `astro build` of small fixture sites (failure messages, base path, determinism); Playwright for browser behavior and the conformance run; the clean-install test follows the core's (pack both packages, install in a temp project outside the repository, build, run in Chromium).
- **Rationale**: matches the core's practice and its `// covers:` tagging so the trace check can be reused.

## R-10. Recorded runs (single runs, one environment)

Environment: macOS (Darwin 25.6.0, Apple silicon), Node 24.14.1, Astro 7.4.5, Playwright 1.64 browsers (Chromium, Firefox, WebKit), 2026-11-04.

- Conformance (`pnpm test:astro-conformance`): the core's scenarios C-01 to C-11 passed under `multi-page` (11 of 11) and under `client-routing` (8 of 8 that apply; C-07, C-08 and C-11 are multi-page scenarios) in Chromium, Firefox and WebKit: 6 of 6 runs passed, 1.3 minutes in total.
- Browser suite (`pnpm test:astro-browsers`): 81 passed, 6 skipped (the development-check tests run in Chromium only), 1.1 minutes.
- Unit and build suite (`pnpm test:astro`): 51 passed in 8 files.
- Core regression after the runner parameters (`pnpm test:conformance` in `@relate/web-core`): 12 passed in three browsers.

**Load figures** (`pnpm exec playwright test tests/browser/figures.spec.ts`, Chromium and Firefox, not WebKit; median of three cold loads in fresh browser contexts, the core's own `total` timing, milliseconds, one environment, single session):

| Nodes (5 links each) | Chromium inline | Chromium registered | Firefox inline | Firefox registered |
|---|---|---|---|---|
| 20 | 38 | 55 | 36 | 198 |
| 300 | 88 | 104 | 89 | 249 |
| 2,000 | 299 | 325 | 334 | 504 |

Registered graphs include fetching the descriptor and the data over a local server; inline graphs include neither. The page weight an inline graph adds (the document in the HTML) is not measured here. No threshold is set from these figures.

**Packed install** (`pnpm test:astro-package`, 4 passed in about 8 s): V-1, V-3 and V-6 hold for the packed adapter and core installed in a clean Astro 7 project outside the repository. The registered graph is built from a content collection and an inline graph is on the same page; both answer a query in Chromium from the build and from the dev server, and the bundler placed the engine binary with no workaround.
