---
id: SPIKE-006
title: Embedding the Core in Next.js
status: planned
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

_(dated entries added during the work)_

## 5. Findings

_(filled in once the spike concludes)_

## 6. Conclusion

_(filled in once the spike concludes)_
