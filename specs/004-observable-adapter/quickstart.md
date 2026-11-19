# Quickstart: validating the adapter

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Prerequisites: the repository set up as in `CLAUDE.md` (`pnpm run build:wasm`, `pnpm install`, `pnpm -r build`), and the three Playwright browsers installed.

```sh
pnpm test:observable               # unit and build tests: results against the real engine, loaders, failures
pnpm test:observable-browsers      # destruction on invalidation and pagehide, several opens, queries feeding components
pnpm test:observable-conformance   # the core's conformance runner over the conformance site (per-page profile)
pnpm test:observable-package       # packs adapter, core and engine; installs in a clean Framework project; builds and runs a page
pnpm test:observable-trace         # every requirement and success criterion has a passing, tagged test
```

## A site, by hand

1. In a Framework 1.x project add `@relate/contrib-observable`, `@relate/contrib-web` and `@relate/relate-wasm`.
2. Add the four loaders from [contracts/loader-entry.md](contracts/loader-entry.md): the engine, the worker, and a graph's document and descriptor over a source module.
3. Set the site's scripts to clean before building: `"clean": "rm -rf docs/.observablehq/cache"`, `"build": "npm run clean && observable build"`, `"dev": "npm run clean && observable preview"` (Framework 1.13 has no `clean` command; its templates clear the cache folder with a script).
4. In a cell, call `open` as in [contracts/browser-entry.md](contracts/browser-entry.md), `await db.ready`, and pass `await db.cypher\`…\`` to a chart or table.

Expected: the page shows rows from the graph; changing a graph source and rebuilding changes the descriptor's revision; a graph that breaks the data format stops the build and names the first problem.

Checks and numbers recorded in [research.md](research.md) (V-1 to V-8) are single runs in one environment.
