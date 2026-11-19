# Quickstart: validating the adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Prerequisites: the repository set up as in `CLAUDE.md` (`pnpm run build:wasm`, `pnpm install`, `pnpm -r build`) and the three Playwright browsers installed.

```sh
pnpm test:sveltekit               # unit and build tests: route builder, registry, inline lookup, build failures
pnpm test:sveltekit-browsers      # lifetimes, consecutive pages, inline graphs, direct lookup, on-demand hydration
pnpm test:sveltekit-conformance   # the core's conformance runner over conformance-site (both profiles, both outputs)
pnpm test:sveltekit-package       # packs adapter, core and engine; installs in a clean SvelteKit 3 project; builds with each adapter
pnpm test:sveltekit-trace         # every requirement and success criterion has a passing, tagged test
```

## A site, by hand

1. In a SvelteKit 3 project add `@relate/contrib-sveltekit`, `@relate/contrib-web` and `@relate/relate-wasm`.
2. Write a declaration module (`#lib/graphs.ts`): an id mapped to `{ source, indexes?, lifetime? }`.
3. Add the route file and the layout load from [contracts/server-entry.md](contracts/server-entry.md).
4. Place `RelateProvider` in the root layout with the catalog and the engine's `?url` import ([contracts/client-entry.md](contracts/client-entry.md)).
5. In a component call `useQuery("pantry", "MATCH (p:Page) RETURN count(p) AS n")` and show a placeholder while `status` is `idle` or `loading`.

Expected: the prerendered page holds the placeholder; after hydration the count appears; `vite build` writes `relate/pantry/descriptor.json` and `relate/pantry/graph.<revision>.json`; a source that breaks the data format stops the build and names the first problem.

Checks recorded in [research.md](research.md) (V-1 to V-9) are single runs in one environment.
