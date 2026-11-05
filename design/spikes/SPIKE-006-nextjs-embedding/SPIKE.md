---
id: SPIKE-006
title: Embedding the Core in Next.js
status: done
rfcs: [RFC-001]
created: 2026-11-05
---

# SPIKE-006: Embedding the Core in Next.js

## 1. Question

Can the shared core package (`related-web-core`, which runs the graph engine in a Web Worker and loads its WebAssembly binary) be used from a Next.js app, and what would a Next adapter have to do that the Astro adapter does not?

Four sub-questions, from the parent RFC:

- RFC-001 §7.7: under a bundler outside the Vite family, who places the engine's `.wasm` file and the core's worker script, and how does their URL reach the core? Does it work under both of Next's bundlers (webpack and Turbopack), from a packed install and from a symlinked workspace package?
- RFC-001 §7.6: does a worker client held in module state, or in a client component, keep the same worker and instance across app-router navigations, history back and forward, and programmatic navigation? What ends it?
- RFC-001 §5 (server-render and hydration consistency): does a component that reads graph data render the same on the server and in the browser, and does the page stay usable before the database is ready and when it fails to load?
- RFC-001 §7.5: which Next output modes (static export, Node server, serverless, edge) can deliver the descriptor and data files and host the core? Which distributions (WASM, native Node package) fit each?

## 2. Method

1. **Read the installed Next first.** Record the version, whether Turbopack is the default for `dev` and `build`, how each bundler treats `new Worker(new URL(..., import.meta.url))`, `.wasm` imports and assets referenced from `node_modules`, and how the app router swaps routes (client cache, soft navigation, scroll and focus handling).
2. **Set up.** Create `next-core/` in this spike's directory: a Next app (app router, TypeScript) that depends on the core by workspace link, and a second copy that depends on the packed core and engine installed from tarballs. Reuse the core's example graph and conformance site fixtures rather than new data.
3. **Placement of the worker and the binary** (§7.7). For each bundler, in dev and in production build, with `output: "export"` and without it:
   - the core's default worker URL resolution and the engine's default `.wasm` URL resolution, unmodified;
   - where each file lands in the build output and whether the browser fetches it;
   - the smallest change that makes it work (a config option, copying files to `public/`, an explicit URL passed to `createClient`), and whether that change can live in an adapter.
4. **Route changes** (§7.6). With a client in module state, then in a client component in the root layout, then in a page component:
   - forward link clicks across several pages;
   - history back and forward;
   - `router.push` and `router.replace`;
   - a link to a route in another root layout (full document load), and a hard reload;
   - a navigation while a query is in flight and while the worker is still loading.

   Record whether the worker id, the instance generation and registered subscriptions survive, and what a page must do on arrival and departure. Check the core's `client-routing` profile against these results.
5. **Server rendering and hydration** (§5). Render a server component that reads build-time graph data, and a client component that queries the browser instance. Record hydration warnings, what the server can render (fallback content, no query results), the state before the worker is ready, and the state when the data or worker fails. Check that links stay real `<a>` elements.
6. **Output modes and runtimes** (§7.5). For static export, a Node server, and (by build output inspection and size, without deploying) the serverless and edge bundles:
   - how a registered graph's descriptor and revisioned data file could be served: static files in `public/`, a route handler, or a build step;
   - whether importing the core or the engine in server code is possible, and the bundle size it adds;
   - whether the native Node package loads in a server runtime, and what the edge runtime rejects.
7. **Run the core's conformance runner** against a minimal Next conformance site if steps 3 and 4 succeed in time, to find out how far the shared scenarios (C-01 to C-11) get without adapter code.

## 3. Time-box

Two working days. Steps 1 to 4 come first; steps 5 to 7 are cut in that order if time runs out, and what was cut is recorded in Notes. If neither bundler can load the worker and binary without changes to the core, stop and record the minimal change.

## 4. Notes

- 2026-11-05, step 1. Installed Next is 16.4.5; `next build` and `next dev` use Turbopack by default, and `--webpack` selects webpack. `next-core/` is an app-router app with `related-web-core` and the engine linked from the workspace (`npm install ../../../../packages/core`). `lib/probe.ts` holds one client in module state, `lib/Panel.tsx` shows its identity (module id, spawn count, status, generation, page count) and `scripts/probe.mjs` drives the built app in a real browser (Chromium, Firefox, WebKit).
- 2026-11-05, probe bug. The first Panel rendered the module's random id during server rendering, which produced React error 418 (text mismatch) on hydration. That was the probe, not the core: the id is now set in an effect. It does show that any client state read during render must come from an effect.
- 2026-11-05, step 3. Both bundlers placed the worker and the engine binary with no configuration. The core's `new Worker(new URL("../worker/worker.js", import.meta.url))` inside `node_modules` is picked up as a worker entry, and the app passes `new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url)` as `engineUrl`. Turbopack emits `static/media/cypherlite_bg.<hash>.wasm` and `static/media/worker.<hash>.js` (plus a small `turbopack-worker` chunk); webpack emits `static/media/cypherlite_bg.<hash>.wasm` and a numbered chunk (`394.<hash>.js`) for the worker. Same result from the linked workspace and from tarballs of the core and engine installed with npm (`/tmp`-style project outside the repository).
- 2026-11-05, step 3, base path. With `basePath: "/sub"` and `output: "export"`, the worker and `.wasm` URLs carry the base without help. The descriptor does not: a descriptor's `data.url` of `/graph.json` is requested from the host root, so the first run with a base path ended in `failed`. The adapter has to write base-prefixed URLs into descriptors, as the Astro adapter's `withBase` does. Next does not rewrite files in `public/`.
- 2026-11-05, step 4. Module-state client survives every navigation tried (below). Navigations to a plain HTML file or a reload create a new module (new id), as expected.
- 2026-11-05, step 6. The WASM engine initialised and ran a statement in a Node route handler, but only after the route stopped referring to the `.wasm` file by a statically analyzable path. `require.resolve(".../cypherlite_bg.wasm")` made Turbopack treat the file as a WebAssembly ES module and fail looking for `./cypherlite_bg.js`, and webpack failed with "module is not flagged as WebAssembly module". Building the path from `process.cwd()` (with Turbopack's `/*turbopackIgnore: true*/` comment) worked in both bundlers, bundled or listed in `serverExternalPackages`.
- 2026-11-05, step 6, edge. Next 16.4.5 prints that the Edge Runtime is deprecated in favour of the Node.js runtime. A route with `runtime = "edge"` built under both bundlers; at run time under `next start`, the webpack build initialised the engine (through a fetch of the asset URL, with a streaming-instantiation fallback warning) and Turbopack's build failed in `fetch` ("invalid method") because the asset URL resolved to a file URL. Neither was deployed to a real edge platform.
- 2026-11-05, addendum (checked while preparing the adapter decision). A route handler at `app/related-web/[id]/[file]/route.ts` with `dynamic = "force-static"`, `dynamicParams = false` and a `generateStaticParams` listing `descriptor.json` and `graph.<revision>.json` writes both files into a static export (`out/related-web/<id>/...`) under both bundlers, with and without `basePath`, and serves them from `next start` and `next dev`; an id that is not listed answers 404 in both. A folder named `_related` is a private folder in the app router and is never routed, so the route cannot use that name. In the same app, the earlier `app/api/*` route handlers (`dynamic = "force-dynamic"`, edge and Node) stop `output: "export"` from building at all, so a site with any server-only route cannot also export. The webpack export also emits an unused chunk for the route handler. `next dev` writes an `AGENTS.md` into the app directory; it was left out of the repository.
- 2026-11-05, cut. Step 7 (the conformance runner against a Next site) was not run, and the native Node package was not exercised: the engine repository has no built native library here, only its `koffi`-based client sources. Both are recorded as open.


## 5. Findings

Figures are single runs on Next 16.4.5, Node 24.14.1, macOS, Chromium, Firefox and WebKit through Playwright. `scripts/probe.mjs` and `scripts/navigation.mjs` drive the app; `scripts/serve.mjs` serves static exports.

### 5.1 Worker and binary placement (RFC-001 §7.7)

| Build | Turbopack | webpack |
|---|---|---|
| `next dev`, linked workspace | works | works |
| `next build` + `next start`, linked workspace | works | works |
| `next build`, packed core and engine from tarballs | works | works |
| `output: "export"`, served from `/` | works | works |
| `output: "export"`, `basePath: "/sub"` | works (worker, binary) | works (worker, binary) |

- No Next configuration, no copying to `public/`, no custom worker factory and no change to the core were needed. The app only had to pass the engine URL as `new URL("@neo4j-labs/cypherlite-wasm/cypherlite_bg.wasm", import.meta.url)`. Under Vite the same job is the `?url` import.
- The binary is 5.62 MB raw and 1.97 MB with gzip, served as `application/wasm`.
- Descriptors are the one thing that does not follow the base path (Notes, step 3). It is the adapter's job, as in Astro.
- Importing the engine package or the `.wasm` file in server code is a trap (5.5).

### 5.2 Route changes (RFC-001 §7.6)

A client held in module state (`lib/probe.ts`), used by client components in several pages, kept the same module, the same worker (spawn count 1) and the same generation (1) through the following. Link clicks, back and forward ran in Chromium, Firefox and WebKit under Turbopack production, and in Chromium under webpack production, both bundlers in development, and the static exports. The programmatic, in-query and while-loading cases ran in Chromium under Turbopack production only.


- link clicks across pages and back to home;
- history back and forward;
- `router.push` and `router.replace`;
- a navigation started while a long query was running (the module id and generation were unchanged and the page showed the data afterwards; the query's own result was not read, since the component that started it had unmounted);
- a navigation started while the graph was still loading (the load finished and the next page showed the data).

Subscriptions registered in a component's effect were removed on unmount and re-registered on the next page, and each page showed the count. Under development with React strict mode, effects ran twice and the client still spawned once. A plain `<a href="/plain.html">`, a reload or a link to a route outside the app creates a new document, a new module and a new worker.

### 5.3 Server rendering and hydration (RFC-001 §5)

- The server renders real `<a>` links and placeholder content in client components (status `—`, count `…`), with no instance. Nothing is missing before the database is ready.
- A client component that rendered a random module id during rendering caused React error 418 on hydration. Moving it to an effect removed it. Every value that comes from the instance must be set in an effect.
- Failure wording and the failed state are the core's; they were not re-tested under Next.

### 5.4 Output modes and runtimes (RFC-001 §7.5)

- **Static export** works end to end, including the data file and descriptor as `public/` files. The 404s for prefetches in the first export run were my static server, not Next. Aborted prefetch requests of pages appear as request failures in the browser.
- **Node server**: the core's validators ran in a server component. The engine ran a statement in a route handler in about 14 ms after loading, in both bundlers, bundled or in `serverExternalPackages`, once the `.wasm` path was not statically analyzable.
- **Edge**: the Edge Runtime is deprecated in 16.4.5. A route built under both bundlers; the engine initialised under webpack and failed under Turbopack in this local run. Not deployed.
- **Serverless size limits** were not measured: the binary alone is 1.97 MB gzip, which is below common function limits but was not checked against a provider.
- **Native Node package**: not exercised.

## 6. Conclusion

For RFC-001:

- §7.7 (frameworks outside the Vite family): Next needs no adapter code to place the worker or the binary under either bundler, from a linked or a packed install, with or without a base path. The only placement concern is the descriptor's data URL under a base path, which the adapter already has to solve for Astro.
- §7.6: a module-state client survives app-router navigation, including programmatic navigation, history and navigation during a query or a load, so the core's `client-routing` profile fits Next as it stands. A Next adapter's job there is lifecycle glue in React (create once, subscribe in effects, `destroy` never on navigation).
- §5 (hydration): client state must enter the page only through effects. A React hook (`useGraphQuery` or similar) is the natural shape, and it must render the same placeholder on the server and on first client render.
- §7.5: static export is fully workable. For server runtimes, the Node route handler works; the `.wasm` file must not be referenced through `require.resolve` or a static import in server code. The edge runtime is deprecated by Next itself and unreliable here; the native Node package and provider size limits remain unmeasured.

Open after this spike: the core's conformance runner against a Next site (step 7), the native package in Next's Node runtime, and a deployed serverless or edge function. None blocks an ADR for a static-export Next adapter.

