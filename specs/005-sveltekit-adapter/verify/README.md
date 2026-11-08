# Planning checks (fixtures)

Stand-ins for pieces of the adapter, used to check the plan's unknowns in a temporary copy of `design/spikes/SPIKE-007-sveltekit-embedding/sveltekit-core` (its `package.json` pointed at tarballs of the core and the engine made with `pnpm pack`, and at `probe-pkg` packed with `npm pack`). Results are in [research.md](../research.md) (V-1 to V-9).

- `app/src/lib/route.ts` and `graphs.ts`: a stand-in route builder (`entries()` evaluating each source twice, the base path from the request, development evaluating per request) and its declarations (`BAD=throw|random|invalid` and `REV` make the failing and changing sources).
- `app/src/lib/GdY.svelte` and `GdX.svelte`: the two inline-graph components compared in V-3.
- `probe-pkg/`: a package that ships a `.svelte` component and a rune module and imports `$app/paths` (V-1, V-2).
- `probe-*.mjs`: Playwright scripts (the paths in them are the temporary copy's).

They are single-run fixtures, not the adapter.
