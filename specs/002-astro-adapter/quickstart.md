# Quickstart: validating the Astro adapter

Prerequisites: the repository set up as in `CLAUDE.md` (engine built, `pnpm install`, `pnpm -r build`), Playwright browsers installed.

```sh
pnpm --filter @relate/web-astro build
pnpm test:astro                 # unit and build tests (Vitest)
pnpm test:astro-browsers        # Playwright: lifecycle, store, direct lookup, dev server (3 browsers)
pnpm test:astro-conformance     # core runner over the conformance site, both profiles, 3 browsers
pnpm test:astro-package         # packed adapter and core in a clean Astro project
pnpm test:astro-trace           # every FR and SC has a passing, tagged test
```

Manual check (US1, US2): in the conformance site, `pnpm --filter @relate/web-astro conformance:dev`, open `/page-1.html` (status moves from `loading` to `ready`, count shows the graph's page count) and `/inline.html` (inline graph query result, no request for a descriptor in the network panel).

Expected outcomes: the commands above all pass; `SC-002` (same revision across two builds) and `SC-003` (no leftover clients after navigation) are asserted by tests, not by hand.

See [contracts/](contracts/) for the interfaces and [data-model.md](data-model.md) for the entities.
