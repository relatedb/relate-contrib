# Contract: main entry (`@relate/sveltekit`)

Svelte source (`.svelte` components, `.svelte.js` rune modules with `.d.ts` beside each; research D-1) with `svelte` and `default` export conditions (FR-002). Nothing here touches the instance on the server or before mount (FR-022, FR-026).

## Provider and inline graphs

- `RelateProvider` props: `catalog` (from the layout load), `engineUrl` (the site's `import … from "@relate/relate-wasm/relate_bg.wasm?url"`), `navigation` (`"client-routing"` default, or `"multi-page"`), and children. Sets context; creates no client (FR-016). Belongs in the root layout.
- `GraphData` props: `id`, `document`, `config?` (`{ indexes }`), `page` (a name for messages). Validates with the core's inline check and writes the element with `{@html}` on the server and in the browser (research D-3). Fails the render for an invalid document or `config`, an id already used in this render, and an id that is also registered (FR-013, FR-014).

## Helpers (called while a component initializes)

- `useGraph(id, options?)` returns a reactive object whose `client` is the core's client, `null` on the server and until mounted (FR-017).
- `useQuery(id, statement, params?)` returns a reactive object with `status` (`"idle"` until mounted, then the core's), `rows`, `error`, `generation`; it subscribes through the client and re-runs after a replacement (FR-017).
- `graph(id, options?)` returns the client of a visit-lifetime registered graph; throws, naming the graph, for a page-lifetime or inline graph, and, naming the registered ids, for an unknown id (FR-023).
- `options.navigation` and `options.descriptor` override the profile and the descriptor location; testing aids; each changes only that value passed to the core (FR-025).

## Lookup and lifetimes

An id is looked up first among `script[data-relate-graph]` elements (the only match, else the first whose parent is visible), then in the catalog; an unknown id fails naming it and the registered ids (FR-018, FR-021). A holder acquires in `onMount`, releases in its cleanup, acquires again when the id changes (FR-022). Visit graphs are created once per id in module state and never destroyed (FR-019); registered page graphs and inline graphs are shared by holders and destroyed one task after the last holder is removed, with the stored copy used when there is a descriptor (FR-020). Descriptor locations are built with `resolve()` from `$app/paths` after mount (FR-024).

The adapter passes the core client's status, events and failure wording through unaltered (FR-027).
