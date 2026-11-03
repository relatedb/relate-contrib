# Naming this project

This repository plans how to embed a small property-graph database in web pages and sites (per-page
graphs, and one site-wide graph behind a navigation element) for several web frameworks. The database
is CypherLite, Neo4j Labs' embedded openCypher engine, but CypherLite's own name is not settled, and
the query language (Cypher), the data shape (graphs) and a possible file format (gram) may each end up
in a name too. The project needs a working name in the meantime, and probably a final one once the
engine's name is known.

## Where things stand

- The repository directory is `graph-web`, and the documents call the work "CypherLite integrations
  with web frameworks". Neither is a decision.
- Recommendation: keep `graph-web` as the working name. "Graph" is the stable word; it doesn't name
  the engine, the query language or a file format. It also reads as "the web as a graph", which fits
  the site-wide graph.
- Revisit the name when CypherLite's name is settled. A hard dependency it is not: the project can
  proceed under `graph-web`. But a name that matches the feel of the engine's final name (playful or
  plain, one word or two, a coinage or an ordinary word) is better than one chosen in isolation, so
  hold off on anything permanent (package scope, domain, public repository name) until then.

## Keeping a rename cheap

CypherLite's current name is easy to find with a global replace, and `cypher*` globs catch the rest.
To keep that true:

- Use the engine's name only where it names a real thing: the npm packages
  (`@neo4j-labs/cypherlite-wasm`, `@neo4j-labs/cypherlite`), the `CypherliteDb` API and the engine's
  repository path.
- Elsewhere write "the engine" or "the embedded graph", including in titles, summaries and goals.
- Keep file names free of the engine's name (the current RFC, ADR and spike file names already are).

## Candidates considered (2026-11-02)

Ideas for a name with some personality, in the families that came up. None is chosen.

- **Paragraph and `graf`.** "Paragraph" contains "graph", and "para" means alongside: a graph
  alongside the page. `graf` is newsroom slang for a paragraph, so it works as a short name
  (`graf-core`, `graf-astro`) and already looks like a deliberate misspelling. "Paragraph" itself is a
  real word, so it is hard to search for.
- **Graph garden.** From "digital garden", the kind of interlinked-notes site that already looks like a
  graph. It pairs with grafting (attaching a page graph to the site graph), a forest of graphs, and
  an orchard. The risk is that "garden" leans toward personal note-taking sites, while the first
  target is a product and its documentation. See the availability results below.
- **"-graph" words.** autograph (a page that carries its own graph), epigraph, cartograph (the map:
  suits the navigation element better than the whole project), telegraph, monograph (one graph for a
  site), topograph.
- **Collective nouns for several graphs.** A graffiti of grafs, a forest of grafs (a forest is a
  disconnected set of trees in graph theory), a clique of grafs, an orchard of grafs, a ream or sheaf
  of grafs.
- **Avoid.** `pagegraph`: Brave's PageGraph is an existing tool.

## Availability checks (2026-11-02)

Checked with the registries' own lookups and GitHub search. A name that is free today can be taken
tomorrow, and a free name is not a trademark clearance.

| Registry | Name | Result |
|---|---|---|
| npm | `graph-garden`, `@graph-garden/*`, `garden-astro` | free |
| npm | `garden-core` | taken: an unrelated package for managing garden apps |
| npm | `graphgarden` | taken: `bruits/graphgarden` (v0.1.0, February 2026), a protocol and tools that turn web rings into explorable node graphs |
| PyPI | `graph-garden` | taken: an unrelated Python library for ArangoDB |
| PyPI | `graphgarden`, `garden-core` | free |
| GitHub | `graph-garden`, `graphgarden` as users or organisations | free |
| GitHub | `importalline/Graph-Garden` | an unrelated Git-learning toy |

The result that matters is `bruits/graphgarden`: the same idea in a nearby space (turning linked sites
into explorable graphs), with a plant in its tagline. "Graph Garden" would be easy to confuse with it.
Neo4j community posts also show a horticulture knowledge graph (Hortigraph) and a biodiversity company
(Bioto), neither of which conflicts.

## Suggested next steps

1. Wait for CypherLite's name, then pick a project name that fits its feel.
2. If the garden idea is still attractive, check a variant that avoids `graphgarden` (for example
   `graph-grove`, `graph-orchard` or `graf-garden`) the same way; none has been checked yet. If
   "Graph Garden" itself is wanted, contact the `bruits/graphgarden` author first.
3. Check any final candidate on npm, PyPI, GitHub and the relevant domains, and ask Neo4j whether
   names beginning with "graph" need review.
4. Rename with one global replace, and update the package names (`<name>-core` and
   `<name>-<framework>` were the working pattern), `CLAUDE.md` and the README indexes.

## Update (2026-11-03): `related-web`

CypherLite is to be renamed `relate` upstream; the change has not happened yet. In anticipation, the
working project name moves from `graph-web` to `related-web` (core package `related-web-core`). It
echoes the engine's new name and keeps the "web" half of the old one. On npm, `related-web`,
`related-web-core` and the `@related-web` scope were unregistered when checked on 2026-11-03; GitHub and
PyPI have not been checked.

Scope of this rename: the long-form name in package names, the stored-copy directory in the
origin-private store (`related-web/<id>.json`), documents and the constitution. Left alone for now:

- The internal prefix `gw-` (store names `gw-<id>`, `data-gw-*` attributes). It needs a short form.
  `rw-` reads as read/write and `rel-` as "relationship"; `rew-` and others are still open.
- The repository directory, and every use of the engine's current name, until upstream settles its
  package, repository and API names.

The suggested steps above still apply for the final name, the registry checks and a global replace.
