# Planned RFCs: the site graph, the navigation element, graph-format interop

This repository plans how to embed a small property-graph database in web pages and sites, for several web
frameworks. The database is CypherLite, Neo4j Labs' embedded openCypher engine, which runs in the browser as
WebAssembly. RFC-001 (embedding in web frameworks) and RFC-002 (page graphs) are drafted, and the first
package, `related-web-core`, is merged. Three further RFCs are intended and none is started. This note keeps
the framing of each so it is not lost; it binds no decision, and each RFC may reshape what is written here.

## RFC-003: the site graph

One shared graph for the whole website, built from its content and shipped to the browser with vector
embeddings. It is the data behind the navigation element (RFC-004).

Questions the RFC should take up:

- How content (pages, headings, links, tags, front matter) becomes nodes and relationships, at build time,
  for each kind of site generator.
- How the graph reaches the browser. Today a document is replayed through fixed statements (ADR-002), with
  an optional descriptor that lets a page restore a stored copy (ADR-003). Embeddings enlarge the document a
  great deal, so size and load cost need measuring. The engine's vector search is an exact flat scan, so
  cost grows with corpus size times dimensions, and that bounds how large a site graph is comfortable.
- How a visitor's query gets embedded in the browser: a small model in the page, a call to a service, or
  precomputed embeddings for a closed set of phrases. This is the largest open question.
- How the site graph relates to per-page graphs (RFC-002): a read-only shared graph plus an ephemeral
  per-page overlay is the working assumption in `CLAUDE.md`.

## RFC-004: the language-driven navigation element

A navigation element that is primarily visual, with a minimal natural-language interface. It is language-driven
navigation and search, not a chatbot.

Framing to keep:

- Deterministic first: natural language, then embedding search, then graph expansion, then a focused subgraph
  view. A generative model may be an optional layer and is never required.
- It must still expose real `<a>` links, keyboard access and a no-JS fallback, so the page works without the
  graph (constitution principle III).
- It depends on RFC-003 for its data and on the core's `failed` and `recovering` states for graceful
  degradation.

## RFC-005: graph-format interop (follow-up proposed by a side session)

The engine's native Node and Python clients return a result graph through `graph()`: id-ordered,
de-duplicated `{nodes, relationships}`. The browser build has no `graph()`, but its result envelope carries
entities with a kind, integer ids, and `start_node` and `end_node`. The question is how result graphs and the
ADR-002 data document convert to each other.

Comparison with the ADR-002 document, as observed:

- Node shape is nearly identical (labels and properties).
- Relationship keys are renamed (`start_node` and `end_node` against `source` and `target`).
- Ids differ in meaning: the engine's integer id against the author's string id, which ADR-002 stores as the
  `id` property.
- Gaps: relationships whose endpoint is missing from the result (dangling), and property values that are not
  flat.

A proposed conversion, to be tested rather than assumed: nodes become `{id: properties.id ?? String(n.id),
labels, properties minus id}`, links become `{source, target, type, properties}` with dangling ones skipped,
and the document gets `{version: 1}`.

ADRs would follow the RFC on the result-graph mapping, where the converter lives and its API, gram support,
and schema interop. This RFC is drafted only when the user asks, on its own branch or worktree. The number
is likely 005 because 003 and 004 are reserved above.
