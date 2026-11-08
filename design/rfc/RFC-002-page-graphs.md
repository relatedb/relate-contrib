---
id: RFC-002
title: Page Graphs
status: draft
created: 2026-11-02
adrs: [ADR-002, ADR-004, ADR-005, ADR-006]
---

# RFC-002: Page Graphs

## 1. Summary

A page graph is a small property graph that belongs to one web page and is queried with Cypher by that page's own components. Three uses share the idea: a cookbook or notebook page, where explanatory text sits beside Cypher cells that run over a small example graph; a page encoded as a graph, where the page's own structure and content become nodes and relationships that its components query; and a dashboard, where charts and tables are driven by graph data carried in the page. None of them needs the rest of the site: the graph's data, its lifetime and its audience are the page's.

CypherLite's own cookbook already does the first of these for one static site, with its own authoring format, build and runtime. The organizing claim is that page graphs differ from a site-wide graph along four lines that deserve their own decisions: where the data comes from and who writes it, how many independent graphs a page can carry, what happens to a visitor's work when the instance fails, and where the instance runs given how small these graphs are. The hosting machinery (a worker, a recovery client, fault handling) is shared with every other instance.

The questions below turn on how much of the cookbook's approach carries over to sites built with web frameworks, and on measurements of small graphs and of pages with several instances. No approach is chosen.

## 2. Problem / Motivation

CypherLite's cookbook is the closest existing page graph. A recipe is a markdown file with runnable `cypher` cells, embedded JSON fixtures and the recorded result of each cell. A build step turns recipes into static pages with the results pre-rendered. In the browser, a custom element runs the cells in a module worker that loads on the first click of Run, never on page load; all cells on a page share one database, running a cell first runs the earlier cells that have not run, Stop terminates the worker (the answer to the engine's missing query timeout), and Reset discards the database. Continuous integration runs every recipe natively and in the browser build and fails on any difference from the recordings. Its graph results are at most a few hundred nodes; a graph view stops growing at 1,000. An earlier integration in a notebook framework also queried an in-page instance from cells and fed the results to charting, input, table, aggregation and SQL components once their shape was normalized.

What these do not give a site built on a web framework, and what the other two uses lack altogether:

- **No carrier through a framework's build.** The cookbook's pipeline is a framework-free build tied to CypherLite's own release process. A site built with Astro, Next, Nuxt or SvelteKit has its own build and component model, and nothing carries a recipe, its data and its recorded output through them.
- **No equivalent for the other two uses.** A page encoded as a graph and a dashboard have no authoring form and no recorded output: the data is derived from the page or arrives with it.
- **One database per page.** All cells share one database. A page with a notebook beside a dashboard, or several independent notebooks, has no model, and nothing has been measured for several instances on one page. The module downloads once, but each worker compiles and holds its own copy (the module is 5,973,771 bytes raw, about 1.5 MB brotli-compressed), while an example graph is a few kilobytes.
- **Recovery rests on authored cells.** After Stop or a fault the cookbook replays earlier cells in document order. That is sound because the cells are authored and recorded. A statement a visitor types has no record, a statement of about a thousand nested parentheses traps the engine, and a runaway statement can only be stopped by terminating the worker, which discards the graph.
- **Where small graphs should run has no measurements.** On the main thread, replaying 1,000 pages took about 160–190 ms; a worker removes the freeze but made the same load take 1.8–2.8× longer. Nothing has been measured below 1,000 pages, which is the range of the cookbook's results.
- **A page sometimes wants both graphs.** A documentation page may show its own example graph and also look up the site's pages. How the two relate (queried together, or kept apart) has no answer; the hosting work treated a per-page graph only as an overlay on the site graph.

## 3. Goals

- Name the independent decisions behind "a page carries its own graph", so each can be settled and revisited on its own.
- State, for each part of the cookbook's approach (recipe format, recorded outputs, the check against recordings in CI, the cell component, starting the engine on first use), whether framework sites reuse it unchanged, adapt it or replace it.
- Define how a page declares its graph data in a form its author can write and the build step can check, covering authored, extracted and delivered data.
- Support several independent graphs on one page, with a measured cost per additional graph.
- Define what a visitor's work means, and what a replaced instance restores.
- Establish the size range of real page graphs (cookbook examples, a typical page as a graph, dashboards) and, from it, a rule for where each runs.
- Define how a page graph and the site-wide graph coexist when a page wants both, without requiring either to exist.
- Define what a page shows before the instance is ready and when it fails, so the page's text and results remain usable.

## 4. Non-Goals

- The hosting model itself (worker, recovery client, fault handling). That is settled for every instance elsewhere; this RFC takes it as given.
- The site-wide graph: its schema, how site content becomes a graph, and vector embeddings.
- The navigation element and its language interface.
- Saving or sharing a visitor's work beyond the page view, such as saved notebooks or shareable links to an edited graph.
- An editor, notebook runtime or dashboard framework. Existing frameworks host the cells and charts; the subject here is the graph under them.
- Changes to CypherLite itself, including its cookbook. Needs are recorded and raised with its maintainers.

## 5. Proposed Approach (high-level)

The approach is a set of axes along which page graphs vary, with candidate directions on each, plus the concerns that apply to all of them.

### 5.1 Where the data comes from

Four candidates, usable together:

- **Written beside the prose.** The author writes the graph in the page source next to the text that explains it. The cookbook's recipe format is this candidate in use.
- **Referenced from a data file.** The page names a file that several pages can share.
- **Extracted from the page.** A build step derives the graph from the page's own structure and content (headings, links, components), so authors write nothing (the natural form for a page encoded as a graph).
- **Delivered with the page.** A dashboard's data is fetched or embedded when the page loads and turned into the graph there.

Whatever the source, the build step should be able to validate the data, and the form should be the same for every framework adapter.

### 5.2 How many graphs, and how they are hosted

A page carries one graph or several independent ones (several notebooks, or a notebook beside a dashboard). The cookbook's model is one database per page, shared by every cell. Beyond it are two candidates: one instance per graph, which isolates them completely, or one host holding several databases, which pays for the worker once. The choice trades isolation (a trapped instance should not take the others with it) against memory and startup cost per graph.

### 5.3 Visitor work and recovery

Read-only graphs (dashboards, a page as a graph) recover by loading their data again. Where a graph's state is the result of authored cells run in order, as in the cookbook, recovery can replay the earlier cells. Where visitors type statements, three candidates: lose the work and tell the visitor, replay the statements the visitor ran after the seed data, or offer an explicit reset and keep nothing. Replay is only sound for statements that give the same result when run again.

### 5.4 When and where an instance runs

Two choices. When: at page load, or on first use, as the cookbook does with its first click of Run, so that a page nobody interacts with downloads and runs nothing. Where: small graphs may run on the main thread when the measured load stays under a budget the page can afford, with the limits of a main-thread instance (no way to stop a runaway statement short of reloading the page); larger ones belong in a worker. The threshold comes from measurement. A page may mix: a small notebook graph next to a larger dashboard graph in a worker.

### 5.5 Relating a page graph to the site-wide graph

Three candidates: keep them apart, with nothing in common; keep them apart but let queries refer to site pages by identifier, composing results outside the database; or load the page graph into the site-wide instance as scoped data that goes away with the page. The second keeps instances independent while allowing the common cases (a notebook linking to a site page).

### 5.6 Cross-cutting concerns

- **Readable without the instance.** The page's text and, where there is a recording, each example's output can be produced at build time and shown before the instance is ready or when it fails to load. The cookbook already pre-renders outputs; a page encoded as a graph and a dashboard have no recording to render.
- **First render independent of the instance.** The same constraint that applies to every component that renders on a server and again in the browser.
- **Visitor-typed statements.** A cookbook runs statements the author never saw, so timeouts, a Stop control and replacement are part of the page's normal behavior, not an error path.

## 6. Alternatives Considered

- **Adopting the cookbook's pipeline unchanged for every site.** Rejected as the only mechanism: it is a framework-free build tied to CypherLite's release process, and framework sites need the same contract (recipe, data, recorded output, check in CI) carried through their own build and component systems. It stays as the prior art that defines the contract (see 7.8).
- **Embedding CypherLite's existing playground in a frame on each page.** Kept as a comparison point and as the cheapest way to put a live graph in a page. Rejected for page-as-graph and dashboards: the page's components cannot query a graph inside a frame, and nothing is shared with the rest of the page.
- **Precomputing every result at build time with no instance in the browser.** Kept for display (recorded outputs before the instance loads). Rejected as the only mechanism: a visitor cannot run anything.
- **Loading every page graph into one site-wide instance.** Rejected as the default: it ties a page's graph to the site's, so a page with no connection to the site pays for the site's data, and one fault ends every page's graph. It remains one candidate for the case where a page wants both graphs (5.5).
- **Running page graphs on a server.** Rejected: it removes the embedded, no-server property and needs infrastructure that static hosting lacks.

## 7. Open Questions

7.1. The cookbook's results are at most a few hundred nodes and its graph view caps at 1,000. What size range do a typical page encoded as a graph and a dashboard's data reach, and at what size does main-thread loading stop fitting a page's budget? Nothing has been measured below 1,000 pages.

7.2. What does each additional instance on one page cost in memory and startup, and does one worker holding several databases reduce it without giving up isolation when one is trapped?

7.3. In what form should authors write page graph data so a build step can check it and the page can display it, and should the cookbook's recipe form serve authored, shared-file and extracted data alike?

7.4. Replaying the earlier authored cells restores a cookbook's database. For visitor-typed statements, what must a replacement restore, and is replaying them sound when statements can be non-repeatable, time-dependent or numerous?

7.5. Can a page's structure be turned into a useful graph without author effort, and which parts of the page (headings, links, components, text) belong in it?

7.6. When a page wants both graphs, should queries span them (the page graph loaded into the site-wide instance) or stay separate with references by identifier, and what do dashboards need from the site?

7.7. A cookbook shows recorded output before the instance runs. What should a page encoded as a graph or a dashboard, which has no recording, show before the instance is ready and when it fails?

7.8. Which parts of the cookbook's approach (recipe format, recorded outputs, the check against recordings in CI, the cell component, starting the engine on first use) can framework adapters reuse unchanged, which must adapt, and which are replaced?

## 8. ADRs

- [ADR-002](../adr/ADR-002-graph-data-format.md): Node-link JSON as the graph data format (accepted)
- [ADR-004](../adr/ADR-004-astro-adapter.md): The Astro adapter, which declares page graphs inline and shared graphs as files (accepted)
- [ADR-005](../adr/ADR-005-next-adapter.md): The Next.js adapter, which serves registered graphs from a route handler and reads inline graphs from the page (accepted)
- [ADR-006](../adr/ADR-006-observable-adapter.md): The Observable Framework adapter, which reads page graphs from data loaders or from cells (accepted)
