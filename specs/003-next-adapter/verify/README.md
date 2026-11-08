# Planning checks (V-1 to V-6)

Small fixtures used while planning, recorded in `../research.md`. They are not part of the package and are not run in CI.

- `route-factory.ts`: a route builder shaped like the adapter's (destructured export, source read per call, revision check), used for V-1, V-5 and V-8. Placed in a scratch Next 16.4.5 app with `app/relate/[id]/[file]/route.ts` exporting `dynamic`, `dynamicParams` and `export const { GET, generateStaticParams } = createGraphRoute([...])`.
- `Holder.tsx`: a client component that counts holds and releases in `window.__holders` (V-4).
- `hidden-pages.mjs`, `hidden-visibility.mjs`: Playwright scripts for V-4 (`node hidden-pages.mjs http://localhost:3111`), with two pages `/hide/a` and `/hide/b` that each render a `Holder` and a `script[data-relate-graph]`. Paths in the scripts point at the Playwright install of SPIKE-006's `next-core`.
