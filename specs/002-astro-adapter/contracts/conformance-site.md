# Contract: the conformance site and checks

**Site**: `packages/astro/conformance-site`, built once per profile with `NAVIGATION=multi-page` or `client-routing` (the router is in the layout only for `client-routing`) and `build.format: "file"`.

**Pages** (markup contract: the core's `data-rel-*` elements, from `packages/web/conformance/example-site/rel-page.ts`):

| Page | Purpose | Graph use |
|------|---------|-----------|
| `index`, `page-1`, `page-2`, `notes`, `broken`, `blank` | the core runner's pages | a shared registered graph (`visit`), per-page overlay on `notes` |
| `lifetime-a`, `lifetime-b` | page-lifetime registered graph across a navigation | registered `"page"` graph |
| `inline` | inline graph with `config.indexes` | `<GraphData>` |
| `two-graphs` | two independent clients on one page | inline plus registered |

**Checks**:

1. The core's runner (`runConformance`) for both profiles in Chromium, Firefox and WebKit. Variant handling and the data-request matcher: plan D-1.
2. Adapter tests (`packages/astro/tests/browser`) for the pages beyond the runner's: destruction on departure, the store being free for the next page, `graph()` rejections, same-client rule, two graphs isolated.
3. Build tests (`tests/build`): invalid document, duplicate name, registered-and-inline name, unsupported output, malformed name, determinism of revisions, base path, dev-server failure handling.
4. The clean-install test: pack the adapter and the core, install into a temp Astro 7 project outside the repository with the engine as a peer, build, load one page in Chromium, and see a query result.
5. The trace check: every FR and SC is named by a passing test's `// covers:` tag.
