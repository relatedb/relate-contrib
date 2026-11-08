---
id: SPIKE-007
title: Embedding the Core in SvelteKit
status: in-progress
rfcs: [RFC-001]
created: 2026-11-08
---

# SPIKE-007: Embedding the Core in SvelteKit

## 1. Question

Can the shared core package (`@relate/web`, which runs the graph engine in a Web Worker and loads its WebAssembly binary) be used from a SvelteKit app, and what would a SvelteKit adapter have to do that the Astro and Next adapters do not?

Five sub-questions, from the parent RFC:

- RFC-001 §7.7: SvelteKit builds with Vite, as Astro does. Who places the engine's `.wasm` file and the core's worker script, in `vite dev` and in a production build, with `adapter-static` and `adapter-node`, from a packed install and from a symlinked workspace package?
- RFC-001 §7.6: does a worker client held in module state keep the same worker and instance across SvelteKit's client-side navigations (link clicks, `goto`, history back and forward), and what ends it?
- RFC-001 §7.10: does a component that reads graph data render the same on the server and in the browser (server rendering, prerendering, hydration), and what do Svelte's lifecycle primitives (`onMount`, `onDestroy`, `$effect`) do on the server and in the browser?
- RFC-001 §7.5: which output modes (a prerendered static site, a Node server) can deliver a registered graph's descriptor and revisioned data file, and how: `+server.ts` endpoints with `prerender` and `entries`, or static files?
- How can a page carry a small inline graph, and how does an adapter find the right one after a client-side navigation?

## 2. Method

Planned, and recorded as done in section 4:

1. **Read the installed SvelteKit first.** Versions, how `vite dev` and `vite build` treat `new Worker(new URL(..., import.meta.url))` inside a dependency, `?url` imports of the binary, `optimizeDeps`, and `ssr.noExternal`.
2. **Set up** `sveltekit-core/` in this folder: a SvelteKit app (Svelte 5, TypeScript) depending on the core and the engine, once as a workspace-style link and once from packed tarballs, using the core's example graph shape.
3. **Placement** (§7.7): the core's default worker and binary resolution, unmodified, in dev and in `adapter-static` and `adapter-node` builds; where each file lands; the smallest change that works and whether an adapter can make it.
4. **Navigation** (§7.6): a client in module state across link clicks, `goto`, history, a hard reload and a link outside the app; what survives and what a page must do on arrival and departure.
5. **Rendering** (§7.10): server and prerendered output of a component that reads graph data in its first render and of one that waits for `onMount`; hydration warnings; `onMount`, `onDestroy` and `$effect` on the server.
6. **Publishing and inline graphs** (§7.5): a `+server.ts` route with `prerender = true` and `entries()` that publishes a descriptor and a revision-named data file, in both adapters and under a base path; a page's inline `<script type="application/json">` graph and its escaping.

## 3. Time-box

One working session (about four hours). Anything that needs a design decision rather than a measurement is recorded as a question for the ADR.

## 4. Notes

_(dated entries, added as the work goes)_

## 5. Findings

_(filled in once the spike concludes)_

## 6. Conclusion

_(filled in once the spike concludes)_
