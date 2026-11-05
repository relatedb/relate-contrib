# @relate/web-astro

Astro integration for [`@relate/web-core`](../core/README.md) (a working name, like this package): it puts the embedded
graph database into an Astro 7 static site. It serves graphs built from the site's content, carries small graphs inside
pages, and ties each page's graph clients to the router's arrival and departure. Instances, faults, loading and
navigation profiles are the core's; this package only wires them into Astro. Decisions: `design/adr/ADR-004-astro-adapter.md`.

## Install

Peer dependencies: `astro` (7.x), `@relate/web-core` and `@neo4j-labs/cypherlite-wasm`. Static output only.

```js
// astro.config.mjs
import relatedWeb from "@relate/web-astro";
export default defineConfig({
  integrations: [
    relatedWeb({
      navigation: "client-routing", // "multi-page" (default) if the site has no ClientRouter
      graphs: {
        site: { source: "./src/site-graph.ts", lifetime: "visit", indexes: [{ label: "Page", property: "id" }] },
        pantry: { source: "./src/data/pantry.json" }, // lifetime "page" by default
      },
    }),
  ],
});
```

## Two ways to declare a graph

**Registered** (a file): `source` is a module whose default export returns an ADR-002 graph document (it may use
`astro:content`), or a `.json` file. The build validates it and publishes `/_related/<name>/descriptor.json` and
`/_related/<name>/graph.<revision>.json` (under Astro's `base`); the revision is 12 hex digits of a hash of the
canonical document, so content changes invalidate stored copies. A failing source fails the build with the path of the
first problem; in `astro dev` the server keeps running, prints the error and answers that graph's files with `500`.

**Inline** (in a page): a component writes a small graph into the page, with no extra request, descriptor or stored copy.

```astro
---
import GraphData from "@relate/web-astro/graph-data";
const entry = await getEntry("recipes", Astro.params.slug);
---
<GraphData id="recipe" document={graphOf(entry)} config={{ indexes: [{ label: "Step", property: "id" }] }} />
```

The build fails for an invalid document or `config`, a duplicate `id` on a page, or an `id` that is also registered.

## In the browser

```ts
import { onPage, graph } from "@relate/web-astro/client";

onPage(
  (page) => {
    const client = page.graph("recipe"); // an inline graph of this page first, then a registered one
    const off = client.subscribe("MATCH (s:Step) RETURN count(s) AS c", null, (u) => show(u));
    return () => off(); // runs before the page is swapped out and when it is hidden
  },
  { selector: "[data-recipe]" }, // optional: only on pages where this matches
);

const site = graph("site"); // visit-lifetime registered graphs only, for code that lives across pages
```

- `onPage` runs the setup once on the first page (with or without the router) and on each later page the router brings
  in where the selector matches (default: every page). A bundled script runs once per document, so a script that serves
  only some pages must pass a selector.
- **Lifetimes.** `"page"` (default): the client is the core's `createClient`, with the stored copy used when there is a
  descriptor, and is destroyed when the page is left. `"visit"`: shared by pages; under `client-routing` it is one client
  for the whole visit. Inline graphs are always `"page"`. Asking twice for one name on a page returns one client.
- Status, generation, events, `failed` and `retry()` are the core's, unaltered.
- `options.navigation` and `options.descriptor` (second argument of both lookups) are testing aids that change only the
  profile or the descriptor URL passed to the core.
- In development the client warns when `navigation` disagrees with the presence of `ClientRouter`.

### For wrappers in UI frameworks

A hook or composable that wraps `graph()` or `onPage` must render a placeholder first and read the client only after
mount: a first render that reads the instance mismatches the server output once the instance outlives the page
(SPIKE-003). Nothing in a page's first render may depend on the graph, and navigation links must work without it.

## Tested

Astro 7.4.5, static output, on Chromium, Firefox and WebKit (desktop), against the core's conformance scenarios under both
profiles. Other Astro versions, server output and mobile browsers are not tested. See `specs/002-astro-adapter/`.

```sh
pnpm test:astro               # unit and build tests
pnpm test:astro-browsers      # lifecycle, store, inline graphs, profile check, direct lookup (3 browsers)
pnpm test:astro-conformance   # the core's conformance runner over packages/astro/conformance-site, both profiles
pnpm test:astro-package       # the packed adapter and core in a clean Astro project
pnpm test:astro-trace         # every requirement and success criterion has a passing, tagged test
```
