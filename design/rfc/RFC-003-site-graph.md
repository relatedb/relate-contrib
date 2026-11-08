---
id: RFC-003
title: The Site Graph
status: draft
created: 2026-11-08
adrs: []
---

# RFC-003: The Site Graph

## 1. Summary

A site graph is one property graph for a whole website: its pages, their sections, the links between them, their tags and front matter, and a vector embedding for each unit of text worth finding. It is built from the site's content when the site is built, shipped to the browser as plain data, and queried there with Cypher by an embedded database. Its first consumer is a navigation element, a mostly visual control that takes a few words from a visitor and answers with the part of the site that is relevant, as real links.

The organizing claim is that three problems sit under that one sentence and can be settled separately: how a site's content becomes a graph, for generators whose content models differ; how a graph with embeddings reaches the browser at a size and load time a content page can afford; and how a visitor's words become a vector in the browser, which needs the same embedding model that produced the site's vectors. The database searches vectors exactly, by scanning all of them, so cost grows with the number of vectors times their dimensions, and that bounds how large a site graph is comfortable.

This RFC settles what the problem is, what a site graph has to do, and which directions are worth measuring. No approach is chosen.

## 2. Problem / Motivation

Four facts frame the problem.

- **The graph has no schema and no producer.** The shared core package accepts any graph as node-link JSON and replays it through fixed statements; what the nodes and relationships of a site are is left open. Authors of other kinds of data (a notebook's example graph, a dashboard) write their own. A site's content is too large to write by hand and is shaped differently by each generator: markdown with front matter, MDX, React components, a headless CMS. Without a producer that understands those shapes, each framework adapter would have to grow its own, and the same site would yield different graphs in different frameworks.
- **Embeddings are most of the weight.** A 384-dimension vector is 1,536 bytes as 32-bit floats, before any text encoding. The database's own cookbook example (40 short notes with 384-dimension embeddings, plus text) is 85 KB, about 2 KB per note. At that rate a site with 1,000 embedded units is about 2 MB before compression, and more if vectors are written at full precision or have more dimensions, against the 1.5 MB (brotli) the database module already costs. The core's replay measurements, which have no vectors, took about 160–190 ms for 1,000 pages and 2.2 s for 20,000 on the main thread, and 1.8–2.8× longer in a worker. Neither the size nor the load time with embeddings has been measured.
- **Search is an exact scan.** The database's vector search compares the query with every stored vector and keeps the best few. Its own benchmarks (native, not WebAssembly) put a 90,000 × 1,536 corpus at 12.6 ms and one million 768-dimension vectors at 61 ms on a single thread. An approximate index is not planned; a binary pre-filter is proposed upstream. A site in the browser has fewer vectors than those corpora by orders of magnitude, but the WebAssembly cost, and the point at which it stops being comfortable, have not been measured.
- **A query must be embedded with the corpus's model.** Vector search needs the visitor's words as a vector from the same model that embedded the site. The database stores and searches vectors; nothing found in its documentation generates them. A model that runs in the page adds download and compute cost; a service receives the visitor's words and needs infrastructure a static site lacks; a fixed set of precomputed phrases cannot answer free text. The database's cookbook sidesteps the question by embedding offline with a deterministic hash embedder, which matches on shared words, not meaning.

Three constraints from the rest of the design apply:

- **Navigation cannot depend on the graph.** Pages have to remain usable and navigable before the database is ready and when it fails to load. The element must expose real links, keyboard access and a fallback without scripting.
- **The graph is public.** Whatever is in the shipped graph reaches every visitor, including titles, text and links of draft or unlisted pages that are not linked from anywhere.
- **Page graphs sit beside it.** A page may carry its own small graph. The measured arrangement is a read-only shared graph with a per-page overlay: adding 50 nodes and 50 relationships took 3–5 ms and removing them under 1 ms, with the lookup property indexed, at 1,000 and 5,000 pages. It was not measured with embeddings present.

## 3. Goals

- Define what a site graph represents: the kinds of things in it, and at what granularity (page, section, passage) text is embedded, since that sets the number of vectors.
- Define how content from different site generators becomes the same graph, with one producer that a build step, a continuous-integration job and an agent can all run.
- Define how a graph with embeddings is delivered, with a measured size and load time, and a budget a content site can accept.
- Define how a visitor's words are embedded in the browser, with the cost to the visitor and to the site owner stated for each option.
- Establish the largest site the browser comfortably searches, from measurements in WebAssembly, and what a site larger than that does.
- Define how the site graph and a page's graph coexist, including when the site graph loads and who owns it across navigation.
- Keep every consumer working without the graph: results are links, and the site is navigable when the graph is absent or fails.
- Keep content a site does not want shipped out of the graph, with a way to say so.

## 4. Non-Goals

- The navigation element: its visual form and its language interface. This RFC supplies its data.
- A generative model. It may become an optional layer over the results; nothing here requires one.
- The hosting model for the database instance (worker, recovery, lifetime). That is settled and taken as given.
- Page graphs and their authoring.
- Changes to the database. Needs, such as a way to generate embeddings or to load a snapshot, are recorded and raised with its maintainers.
- Sites whose content changes at request time, such as per-visitor or per-session content. The graph is built when the site is built.
- Running search on a server.

## 5. Proposed Approach (high-level)

The approach is a set of axes, each with candidates, and the concerns shared by all of them.

### 5.1 What the graph holds

Pages and the links between them are the common core. Beyond that, candidates add structure: sections or headings as nodes under their page, tags and categories, front matter fields, authors, a site's own taxonomy, and the passages of text that get embedded. The granularity decision matters most: embedding whole pages gives few vectors and coarse answers, embedding sections or passages gives more precise answers and many more vectors. A schema should be small enough that every generator can fill it, with room for site-specific additions.

### 5.2 Where content becomes a graph

Three candidates:

- **Each framework adapter extracts from its own content model.** It knows the framework's collections and routes. The cost is one extractor per framework and graphs that differ for the same content.
- **One framework-neutral extractor over the built site.** It reads rendered output and derives pages, headings and links from it. Every generator is covered with the same code, at the cost of losing source-level information such as front matter and component structure, and of depending on the output's markup.
- **One extractor over content sources, run as a database extension.** The engine's tooling already has first-party extensions that turn a file tree or a repository into a graph. A site-content extension reads markdown, MDX and front matter directly and writes the graph document an adapter's build step consumes. The same implementation then serves a build, a continuous-integration check and an agent that wants to query a site's content. The cost is that content in a CMS or in components is outside it.

The candidates combine: a source extractor for the common content formats, with an adapter-supplied hook for the rest.

### 5.3 Generating embeddings

Embeddings are produced when the site is built, never in the visitor's browser. The choices are the model, its dimensions and numeric precision, which text of a unit is embedded (title only, the whole page, a summary, each passage), and how the build runs the model (a local model, or a service the site owner calls once per build). The model fixes what the browser must use for queries (5.4), so the choice is made once and recorded with the graph.

### 5.4 Embedding the visitor's words

Four candidates, usable together:

- **A small model in the page.** It runs in a worker and loads on first use of the navigation element. Meaning-based search works offline and sends nothing out. It costs a model download and compute on the visitor's device.
- **A service.** The page sends the visitor's words to an endpoint that returns a vector. It is small in the browser and needs infrastructure, an operator and a privacy statement.
- **Precomputed phrases.** The site ships vectors for a closed set of phrases (page titles, questions the site expects). Nothing runs in the browser, and free text cannot be answered.
- **No query vectors.** Text search over the graph's own text and a walk along its links, with embeddings used only to relate nodes to each other. Weaker answers; no embedding model at the visitor.

A site may offer text search always and add vectors when a model or service is available.

### 5.5 Delivering the graph

The graph is plain data replayed into an instance. Variants differ in what ships first and what is stored. One document carries structure and vectors together. Structure can ship first (pages, links, titles) so navigation works while vectors arrive later, in one or several files. A descriptor with a revision lets a visitor's browser restore a stored copy instead of replaying, which is faster for one tab and goes stale when content changes. The graph loads on first use of the navigation element, or at page load if it is on every page, and one instance serves the visit where the router keeps it alive. All of these inherit the hosting model's limits and are judged by the measured size and load time with embeddings (see 7.2).

### 5.6 Relating the site graph to page graphs

The site graph is read-only and shared; a page's graph is an overlay scoped to that page view and removed with it, or a separate instance whose results are composed with the site graph's by identifier. The overlay allows queries over both; the separate instance keeps faults and lifetimes independent. A page overlay and the site's vectors must not interfere with each other's search.

### 5.7 Cross-cutting concerns

- **Works without the graph.** The element's results are links, and the same links exist in the page's markup so the site is navigable with no graph, no script and no model.
- **Budgets.** Download, load time, memory and per-query time have stated budgets before candidates are compared.
- **Version coupling.** The graph records the schema version, the embedding model and its dimensions. A browser never loads a graph its module or query model cannot use.
- **Exclusion.** Content marked as unpublished, draft or private never enters the graph, and the build fails if a link or reference would expose it.
- **Reproducible builds.** The same content yields the same graph and revision, so a stored copy is not invalidated by a rebuild that changed nothing.

## 6. Alternatives Considered

- **A hosted search service or vector database.** Rejected for the browser-facing path: it removes the embedded, no-server property that the integrations exist to show and needs infrastructure static hosting lacks. It remains the comparison point for answer quality and latency.
- **A static full-text search index with no graph.** Kept as the comparison for cost and as the fallback in 5.4. Rejected as the whole answer: it returns pages that match words and has no way to expand to related pages along links, tags or sections.
- **Extractors inside every framework adapter, with no shared producer.** Rejected as the only route: the same site would produce different graphs per framework. Adapters supply what only they can know.
- **Embedding on the server per request.** Rejected: it needs a runtime the supported static outputs do not have.
- **A chat interface over the site, with a model reading retrieved passages.** Rejected for this RFC: the aim is navigation and search that returns links deterministically. A generative layer can be added over the results.
- **Approximate nearest-neighbour indexes shipped with the graph.** Not available in the database and not needed in the measured range; reconsidered only if the exact scan is too slow at a site size that matters.

## 7. Open Questions

7.1. What do real sites look like as graphs: pages, sections and passages per site, links per page, and tags? A documentation site, a blog and a marketing site probably differ by an order of magnitude in the number of vectors.

7.2. How large is a graph with embeddings on the wire and in the browser, compressed and not, at 384 and at higher dimensions, and how long does replay take in a worker at those sizes? Does a split delivery (structure first, vectors later) make navigation usable sooner, and what does a stored copy save?

7.3. How long does an exact vector search take in the WebAssembly build as vectors and dimensions grow, with and without a text index beside it and with a page overlay present, and at what count does it stop being comfortable?

7.4. Which embedding model, if any, is small enough to run in a visitor's browser, and what do its download, start-up and per-query time cost on a typical device? How much meaning does a smaller model lose against the model used for building?

7.5. If the query is embedded by a service, who runs it, what does the visitor's text disclose, and can a static site avoid needing one?

7.6. Is the build model the same as the browser model, or can a larger model embed the site and a smaller model embed queries in a space compatible with it?

7.7. Which granularity (page, section, passage) answers navigation queries best, and what does each cost in vectors?

7.8. Can one extractor over content sources cover enough of the target generators, and what does it need from an adapter for content outside files? Is it best written as a database extension, a package in this repository, or both, and what does that require of the database's maintainers?

7.9. How is content excluded from the graph, and how does the build detect a link or reference that would expose an excluded page?

7.10. Should the database generate embeddings itself, in its native and browser builds, so that this repository, agent memory and the site's navigation do not each choose a model? The survey of agent frameworks asks the same question from the other side.

7.11. When a page also carries its own graph, do queries span both in one instance, and how do vectors on the page's nodes and the site's nodes avoid mixing in one search?

7.12. At what site size does the whole graph stop fitting in a visitor's browser, and what does the element do then: load a part of the graph, search a reduced set of vectors, or fall back to text search?

## 8. ADRs

_(none yet)_
