---
id: SPIKE-007
title: Embedding the Core in SvelteKit
status: done
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

- 2026-11-08: SvelteKit 3.1.1 with Svelte 5.57.3 and Vite 8.3.6 (the Rolldown-based one) was current, so the spike ran on it, not on the SvelteKit 2 that most documentation describes. The first hour went to its changes (finding 5.1). The app is `sveltekit-core/`; `probe.mjs` and `probe-inline.mjs` drive it in the three browsers; `serve.mjs` serves a static build with clean URLs and an optional base path.
- 2026-11-08: the first static probe 404'd on `/early`: a plain static server does not map `/early` to `early.html`, which adapter-static writes. Not a SvelteKit fault; `serve.mjs` maps it.
- 2026-11-08: the first base-path build failed in prerendering because a test link (`/outside.html`) did not begin with the base. SvelteKit refuses it (`prerender_path_outside_base`) and says to use `resolve()`; the test was fixed.
- 2026-11-08: after the main checks, one more run for the first question the ADR will ask: `probe-pkg/` is a package that ships a `.svelte` component and a `.svelte.js` rune module as source, with a `svelte` export condition; installed from its tarball into the app and used from a page, it was compiled by the site's build (finding 5.8). The page and the install were removed again; the package is kept.
- 2026-11-08: a literal `</script>` inside a `.svelte` file's `<script>` block ends the block (the parser is HTML-shaped), so the escaping test builds the string from two pieces.

## 5. Findings

All runs are single runs on SvelteKit 3.1.1, Svelte 5.57.3, Vite 8.3.6, Node 24.14.1, macOS arm64, in Playwright's Chromium, Firefox and WebKit. The core and the engine were the repository's own build (core 0.0.0, engine 0.16.1).

**5.1 SvelteKit 3 differs from what an adapter written against SvelteKit 2 expects.**
- Configuration is passed to the `sveltekit({ ... })` Vite plugin; a `svelte.config.js` stops the build (`config_file_unsupported`).
- `$lib` is removed (`module_removed_lib`): use `#lib` through Node's `imports` field in `package.json`, or an `alias`.
- `$app/paths` exports `asset`, `resolve` and `match`; `base` and `assets` are gone.
- `tsconfig.json` must extend `$app/tsconfig`; TypeScript's peer range is `^6.0.0` (the repository uses 7).
- `data-sveltekit-preload-data` takes `""`, `"false"`, `"tap"` or `"hover"`, not `"off"`.
- `vite dev` listens on `localhost` only; a client at `127.0.0.1` is refused unless `server.host` is set.

**5.2 Placement of the binary and the worker needs no configuration.**
- With the unmodified core and a `?url` import of the binary in the site's own module, a production build with `adapter-static` emitted the worker as `_app/immutable/workers/worker-<hash>.js` and the binary as `_app/immutable/assets/relate_bg.<hash>.wasm`. The worker started, loaded a three-node graph and answered a query in all three browsers. The same held with `adapter-node` and with `paths.base = "/docs"`, where both URLs gained the prefix.
- The binary is emitted more than once: twice in the static build (`assets/` and `workers/assets/`, 6.25 MB each, the second being the glue's own default and never requested) and three times in the `adapter-node` build (also `server/_app/immutable/assets/`).
- `vite dev` placed both with the default `optimizeDeps`; adding the core and the engine to `optimizeDeps.exclude` (the Astro adapter's setting) made no difference.
- A core installed as a symlink to `packages/web`, as a workspace link is, built in production. Under `vite dev` the core's worker answered 403 (`outside of Vite serving allow list`) until `server.fs.allow` included the repository root. A core and engine installed from packed tarballs needed nothing in dev or in production.

**5.3 A client in module state survives client-side navigation.** Across three link clicks, `goto`, history back and forward, one client was created, its generation stayed 1 and one worker was live, in all three browsers, for `adapter-static`, `adapter-node` and under a base path. A hard reload started a new client; a link with `data-sveltekit-reload` to a static page loaded a new document with no client. When SvelteKit replaces one page with another, the old page's `onDestroy` ran before the new page's `onMount` (`mount-a`, `destroy-a`, `mount-b`), so a graph used by two consecutive pages has no holder between them.

**5.4 Server rendering and the Svelte lifecycle.** During prerendering a component's script ran (with `window` undefined) and `onDestroy` ran; `onMount` and `$effect` did not. A page that read the instance in its first render produced the markup `server` on the server and `loading` in the browser; the document showed the client's value after hydration and no warning appeared in Chromium, Firefox or WebKit, in production or under `vite dev`. A registry that counts holders therefore has to count in `onMount` or `$effect` and never trust `onDestroy` alone.

**5.5 A prerendered endpoint publishes the descriptor and the revision-named data file.** `src/routes/relate/[id]/[file]/+server.ts` with `export const prerender = true` and an `entries()` function wrote `relate/example/descriptor.json` and `relate/example/graph.<revision>.json` into the `adapter-static` output, and a static server answered 200 for them and 404 for another revision. It worked under a base path, where the files are served at `<base>/relate/...` and the descriptor's data location has to carry the base itself (the endpoint did not add it). `entries()` and both `GET` calls ran in the same process (one process id), unlike Next's build, so the revision check that Next needs between processes would see nothing here.

**5.6 Inline graphs.** A component that wrote `{@html '<script type="application/json" data-relate-graph="g">' + escapeJson(document) + '</script>'}` was prerendered with the document escaped (`\u003c/script\u003e`, `\u0026`). A string containing `</script>`, `<!--` and `&` round-tripped through `JSON.parse` in all three browsers. After a client-side navigation and again after going back, the document held exactly one inline-graph element, because SvelteKit replaces the page.

**5.7 A package can ship Svelte source.** `probe-pkg/` (a component in a `.svelte` file, a rune module in a `.svelte.js` file, `"svelte"` and `"default"` export conditions, `svelte` as a peer dependency), packed and installed in the app, was compiled by the site's own build: prerendering wrote the component's text, and in Chromium the rune state updated on click (n = 2 after two clicks). Single run.

**5.8 Not checked.** The endpoint under `adapter-node` (its output was not requested); a build that fails when a source throws; rendering on demand (SSR, not prerendered) and its hydration; the serverless and edge adapters; `vite dev` publishing of the endpoint; hash-based routing; view transitions; cold-network cost; and a rune module shipped as `.svelte.ts` (the probe used `.svelte.js`).

## 6. Conclusion

**RFC-001 §7.7.** Under SvelteKit, whose bundler is Vite, nothing places the binary or the worker for the adapter: the unmodified core, with the binary imported by the site as a `?url` asset, worked in dev and production. The one workspace-only wrinkle is the dev server's serving allow list for a symlinked core. The repeated copies of the binary in the build output are worth a line in the adapter's notes.

**RFC-001 §7.6.** A module-state client survives SvelteKit's navigations, and the old page is destroyed before the new one mounts, so a page-lifetime graph needs the same deferred destroy as in the Next adapter.

**RFC-001 §7.10.** Svelte 5's `onMount` and `$effect` are browser-only and `onDestroy` is not, so counting holders belongs in `onMount` or `$effect`; reading the instance in a first render did not fail but the placeholder-first rule still applies.

**RFC-001 §7.5.** A prerendered `+server.ts` with `entries()` publishes a registered graph in a static build; its process boundary differs from Next's; the Node adapter and on-demand rendering are unchecked.

**Text for the RFC.** Suggested wording for RFC-001's open questions, applied manually:

> 7.7 (partial answer, SPIKE-007): under SvelteKit 3 (Vite 8) the core's worker and the engine's binary were placed with no configuration in development and in production builds with `adapter-static` and `adapter-node`, with and without a base path, once the site imported the binary as a `?url` asset; a core symlinked from a workspace needed `server.fs.allow` in `vite dev`. The binary was emitted two or three times in the build output.
>
> 7.6 (partial answer, SPIKE-007): a worker client held in module state kept one worker and one generation across SvelteKit link clicks, `goto` and history navigation in Chromium, Firefox and WebKit. The departing page's `onDestroy` ran before the arriving page's `onMount`.
>
> 7.10 (partial answer, SPIKE-007): in SvelteKit prerendering `onMount` and `$effect` do not run and `onDestroy` does; a component that read the instance in its first render showed the client's value after hydration with no warning.

**Questions for the ADR.** How a SvelteKit adapter exposes the client to components (functions over `onMount` and `$effect`, a rune module, or a store); which of the shipped source forms (`.svelte`, `.svelte.js`, `.svelte.ts`) the adapter uses, given that the site's build compiles a package's Svelte source (5.7); how the catalog reaches the client (a layout `load` function, or a module the Vite plugin supplies); whether the adapter's route file follows the Next shape (`entries()` and `GET` from a builder in a `+server.ts` the site writes, with `prerender = true`); and how the adapter checks that a source is deterministic when `entries()` and `GET` share a process.
