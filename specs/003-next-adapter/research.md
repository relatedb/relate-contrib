# Research: Next.js Adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-05

This file records the checks made while planning (V-1 to V-6) and the decisions that follow. They are single runs on Next 16.4.5, Node 24.14.1, macOS, with Turbopack and webpack, using the fixtures in [`verify/`](verify/README.md). ADR-005 §6 listed four questions for implementation; V-1, V-2, V-4 and V-5 answer them early because two of them could have changed the design.

## Checks

### V-1. A destructured route export is accepted (ADR-005 §6)

`export const { GET, generateStaticParams } = createGraphRoute(ids)`, next to literal `export const dynamic = "force-static"` and `dynamicParams = false`, built and, under export, wrote `descriptor.json` and `graph.<revision>.json` for each id, with Turbopack and with webpack, for the production server build and for `output: "export"`. The route is accepted as written in ADR-005 §2.2.

Also observed: in all four builds `generateStaticParams` ran in a different process from the `GET` calls (different process ids). The multi-process hazard that motivated the revision check (ADR-005 §2.2) is real, not theoretical.

### V-2. The catalog passes from a server component as props (ADR-005 §6)

A root layout (a server component) passed an object with a list of `{ id, descriptor, lifetime, indexes }` to a client provider, which put it in context. The static export under both bundlers prerendered the catalog into the page and the client read it. Plain data with nested arrays and literal-union strings needs nothing special.

### V-3. Revision and determinism check (ADR-005 §2.2)

Pre-existing code: `@relate/astro`'s `sources.ts` imports `node:crypto`. ADR-005 §2.2 says the build subpath has "no Node-only module". See decision D-1.

### V-4. Hidden earlier pages (ADR-005 §6)

Two pages each rendered a hold-counting client component and an inline-graph script. Navigating a to b to a to b in a production build:

| Config | Departed page's holder | Departed page's inline `script` element |
|---|---|---|
| default | released (effect cleanup runs) | removed; one script in the document |
| `cacheComponents: true` | released (effect cleanup runs) | **stays in the document**; two scripts, the visible page's not reliably first |

With `cacheComponents: true` the router keeps the departed page's DOM with `display: none` and runs its effect cleanups, so holders are released and page clients are destroyed as designed. `next dev` showed the same, plus the doubled hold, release, hold of strict mode. The inline graph element is the problem: a hook that queries `script[data-relate-graph="g"]` can find the hidden page's element. In Chromium, Firefox and WebKit the script's parent element reports `checkVisibility()` true for the visible page and false for the hidden one, and the `[hidden]` attribute is not set, so only visibility can tell them apart. See decision D-4.

### V-5. The development server follows source edits (ADR-005 §6)

A route handler that reads its source on every call served a new descriptor revision after the source file changed (no restart) and served the new `graph.<revision>.json` with status 200, with both bundlers, even with `dynamicParams = false`. A request for the old revision reached `GET`, where the revision check threw, so it answered 500. In the production build `GET` is called only for listed names, so the check there is the build failure of FR-009. See decision D-3.

### V-6. A Next app builds inside the pnpm workspace

A Next 16.4.5 app in a pnpm workspace package (dependencies in the package's `node_modules`, as symlinks into the workspace store) built under both bundlers. The conformance site can therefore be a workspace-style package inside `packages/nextjs`, as the Astro one is. A copy of SPIKE-006's app whose `node_modules` was a symlink from outside the project failed under Turbopack ("Could not find the Next.js package"); the fixtures use a real directory.

### V-7. Determinism check catches a changing source (FR-009)

With a source that adds a random node on every read, `next build` failed under both bundlers with "revision mismatch for graph.<revision>.json" and exit status 1.

### Checks made while implementing (V-8 to V-11)

- **V-8. `cacheComponents` refuses `dynamic` and `dynamicParams`.** With `cacheComponents: true` the Turbopack build failed with "Route segment config "dynamic" is not compatible with `nextConfig.cacheComponents`" (and the same for `dynamicParams`), for the route file and for a page. The cache build of the conformance site is made from copies of those files without the two lines (`conformance-site/variant.mjs`). The route then answers an unlisted file through `GET`, so a stale revision must answer 404 outside a build; the revision check decides by `NEXT_PHASE` (not by `NODE_ENV`). ADR-005 §6 records it.
- **V-9. The development server's list of files can trail an edit.** After a source edit the descriptor showed the new revision at once, but the new data file answered 404 for a moment (Next's own parameter list); polling for it succeeded. `allowedDevOrigins: ["127.0.0.1"]` is needed for the tests' address, or the development server blocks its own scripts.
- **V-10. Static export hosting.** A route folder named `page-1.html` exports as `page-1.html.html` beside a folder `page-1.html/` of router data, and the router's `.txt` payloads must be served as `text/x-component`; with another content type the router fell back to a full page load and the core's C-02 scenario (the same instance across pages) failed in the export build only.
- **V-11. Consecutive pages share a page client.** A page that unmounts while the next page mounts, in one commit, releases and holds in the same task, so a page-lifetime graph both pages ask for keeps one client. This follows FR-020's sharing; the lifecycle test records it.

## Decisions

**D-1. The build subpath uses Web Crypto, so it is asynchronous.** ADR-005 §2.2 requires `@relate/web/build` to need no Node-only module, and the Astro code computes the revision with `node:crypto`'s synchronous `createHash`. `globalThis.crypto.subtle.digest` is available in Node 20 and later and in every browser, and gives the same SHA-256, so revisions do not change. It is asynchronous, so `revisionOf`, `prepare` and `descriptorOf`'s caller become asynchronous (`evaluate` already was). Astro's call sites and its unit tests add `await`; no expectation changes. Alternative: keep `node:crypto` and amend ADR-005 to "no browser dependency, Node-compatible runtimes only". Rejected: it would fix the subpath to Node, and the Next adapter's server code can run in other runtimes later.

**D-2. The inline-graph check and JSON escaping move to the same subpath.** The Astro adapter's `inline.ts` (`checkInline`, `escapeJson`) validates an inline document and `config`, and escapes JSON for a script element. Both depend on nothing framework-specific, and the Next `GraphData` needs the same rules and the same error wording. Constitution principle II places framework-independent behavior in the core. The error text takes the caller's name as a parameter so messages still name the adapter. This extends the list in ADR-005 §2.2 and in spec FR-026 (which name canonical text, revision, document preparation and descriptor construction); both are amended.

**D-3. A stale revision is a 404 in development and a failure in the build.** V-5 showed the check throws for a request whose revision is not current. In `next dev` that is an error status for a file that no longer exists, which should be 404 so the core reports the failure normally; in `next build` any mismatch for a listed file must fail the build (FR-009). The route builder tells the two cases apart by `process.env.NODE_ENV` and the build phase. This is detail inside ADR-005 §2.2, not a change to it.

**D-4. Inline graphs are found by visibility, with a single-match shortcut.** ADR-005 §2.4 says an inline graph is found "among the `data-relate-graph` elements in the current document at the time of the first effect". V-4 shows that with `cacheComponents: true` the document can hold the hidden page's element as well. The hook takes the only match if there is one, and otherwise the match whose parent element is visible (`checkVisibility()`), and uses the first visible match if several are. The element is the key of ADR-005 §2.4's inline client, so a returning page's element is a new key only when it is a new element. ADR-005 §2.4 is amended. Alternative: have `GraphData` register the document through a small client component's effect, which React cleans up when the page is hidden; this needs no DOM query, but adds a client component to every inline graph and an ordering problem between the registering effect and a consumer that mounts first. It stays as the fallback if the visibility rule proves unreliable.

**D-5. Evaluation, per process.** `createGraphRoute` memoizes each source's evaluation per process in production and re-evaluates per request in development (V-5). Next evaluates sources in several processes, so a source runs more than once per build; ADR-005 §4 already records this.

**D-6. Conformance matrix.** The conformance site is built per profile (`NAVIGATION`) and served as a production server and as a static export. One more build sets `cacheComponents: true` and runs the lifecycle and inline-graph tests only, because V-4 shows it is the configuration where a departed page stays in the document.

**D-7. Load figures.** As for Astro, the conformance site records load figures for inline and registered graphs of three sizes in Chromium and Firefox (single runs, one environment), so a later decision can set the size at which a graph should be registered instead. No threshold is set.

## Alternatives considered and not taken

- Keeping `node:crypto` and amending ADR-005 (D-1).
- Duplicating `checkInline` and `escapeJson` in the Next adapter (D-2): two copies of the rule that decides what an inline graph may contain.
- Registering inline graphs through a client component (D-4): kept as the fallback.
- Running the conformance site against the development server: the development server's behavior (strict mode, per-request evaluation) is tested separately, not through the shared scenarios.
