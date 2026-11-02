---
id: RFC-002
title: Page Graphs
status: draft
created: 2026-11-02
adrs: []
---

# RFC-002: Page Graphs

## 1. Summary

A page graph is a small property graph that belongs to one web page and is queried with Cypher by that page's own components. Three uses share the idea: a cookbook or notebook page, where explanatory text sits beside Cypher cells that run over a small example graph; a page encoded as a graph, where the page's own structure and content become nodes and relationships that its components query; and a dashboard, where charts and tables are driven by graph data carried in the page. None of them needs the rest of the site: the graph's data, its lifetime and its audience are the page's.

The organizing claim is that page graphs differ from a site-wide graph along four lines that deserve their own decisions: where the data comes from and who writes it, how many independent graphs a page can carry, what happens to a visitor's edits when the instance fails, and where the instance runs given how small these graphs are. The hosting machinery (a worker, a recovery client, fault handling) is shared with every other instance.

This RFC states the problem, the candidate directions along those lines, and the questions that measurements must answer. It chooses nothing.

## 2. Problem / Motivation

CypherLite's own reference consumers are page graphs. Its playground and its cookbook pages run Cypher against small example graphs inside the page, and an earlier integration in a notebook framework did the same: notebook cells queried an in-page instance and the results fed charting, input, table, aggregation and SQL components once their shape was normalized.

- **The data has no agreed home.** A cookbook's example graph is written by the page's author, a page-as-graph is derived from the page, and a dashboard's data arrives from wherever the dashboard gets it. With no common form for any of them, a build step cannot check the data.
- **The module dwarfs the data.** The release module is 5,973,771 bytes raw (about 1.5 MB brotli-compressed); an example graph is a few kilobytes. A page with several graphs pays for the module once, but each instance also holds its own database in memory, and nothing has been measured for several instances on one page.
- **Visitor edits are lost on failure.** A cookbook invites the visitor to change statements and run them. A statement of about a thousand nested parentheses traps the engine, and a runaway statement can only be stopped by terminating the worker. Replacing the instance reloads the seed data, so everything the visitor did to the graph is gone.
- **Small graphs may not need the worker.** On the main thread, replaying 1,000 pages took about 160–190 ms; a worker removes the freeze but made the same load take 1.8–2.8× longer. Nothing has been measured below 1,000 pages, which is where most page graphs sit, so there is no basis yet for choosing between them.
- **A page sometimes wants both graphs.** A documentation page may show its own example graph and also look up the site's pages. How the two relate (queried together, or kept apart) has no answer; the hosting work treated a per-page graph only as an overlay on the site graph.

## 3. Goals

- Name the independent decisions behind "a page carries its own graph", so each can be settled and revisited on its own.
- Define how a page declares its graph data in a form its author can write and the build step can check, covering authored, extracted and delivered data.
- Support several independent graphs on one page, with a measured cost per additional graph.
- Define what a visitor's edits mean, and what a replaced instance restores.
- Establish the size range of real page graphs (cookbook examples, a typical page as a graph, dashboards) and, from it, a rule for where each runs.
- Define how a page graph and the site-wide graph coexist when a page wants both, without requiring either to exist.
- Define what a page shows before the instance is ready and when it fails, so the page's text and results remain usable.

## 4. Non-Goals

- The hosting model itself (worker, recovery client, fault handling). That is settled for every instance elsewhere; this RFC takes it as given.
- The site-wide graph: its schema, how site content becomes a graph, and vector embeddings.
- The navigation element and its language interface.
- Saving or sharing a visitor's edits beyond the page view, such as saved notebooks or shareable links to an edited graph.
- An editor, notebook runtime or dashboard framework. Existing frameworks host the cells and charts; the subject here is the graph under them.
- Changes to CypherLite itself. Needs are recorded and raised with its maintainers.

## 5. Proposed Approach (high-level)

The approach is a set of axes along which page graphs vary, with candidate directions on each, plus the concerns that apply to all of them.

### 5.1 Where the data comes from

Four candidates, usable together:

- **Written beside the prose.** The author writes the graph in the page source next to the text that explains it (the natural form for a cookbook).
- **Referenced from a data file.** The page names a file that several pages can share.
- **Extracted from the page.** A build step derives the graph from the page's own structure and content (headings, links, components), so authors write nothing (the natural form for a page encoded as a graph).
- **Delivered with the page.** A dashboard's data is fetched or embedded when the page loads and turned into the graph there.

Whatever the source, the build step should be able to validate the data, and the form should be the same for every framework adapter.

### 5.2 How many graphs, and how they are hosted

A page carries one graph or several independent ones (several notebooks, or a notebook beside a dashboard). Two candidates: one instance per graph, which isolates them completely, or one host holding several databases, which pays for the module and worker once. The choice trades isolation (a trapped instance should not take the others with it) against memory and startup cost per graph.

### 5.3 Edits and recovery

Read-only graphs (dashboards, a page as a graph) recover by loading their data again. Editable graphs have three candidates: lose the edits and tell the visitor, replay the statements the visitor ran after the seed data, or offer an explicit reset and keep nothing. Replay is only sound for statements that give the same result when run again.

### 5.4 Where an instance runs

Small graphs may run on the main thread when the measured load stays under a budget the page can afford; larger ones belong in a worker. The threshold is a measurement, not a guess. A page may also mix: a small notebook graph on the main thread next to a larger dashboard graph in a worker.

### 5.5 Relating a page graph to the site-wide graph

Three candidates: keep them apart, with nothing in common; keep them apart but let queries refer to site pages by identifier, composing results outside the database; or load the page graph into the site-wide instance as scoped data that goes away with the page. The second keeps instances independent while allowing the common cases (a notebook linking to a site page).

### 5.6 Cross-cutting concerns

- **Readable without the instance.** The page's text, and for cookbooks the recorded output of each example, can be produced at build time and shown before the instance is ready or when it fails to load.
- **First render independent of the instance.** The same constraint that applies to every component that renders on a server and again in the browser.
- **Visitor-typed statements.** A cookbook runs statements the author never saw, so timeouts and replacement are part of the page's normal behavior, not an error path.

## 6. Alternatives Considered

- **Embedding CypherLite's existing playground in a frame on each page.** Kept as a comparison point and as the cheapest way to put a live graph in a page. Rejected for page-as-graph and dashboards: the page's components cannot query a graph inside a frame, and nothing is shared with the rest of the page.
- **Precomputing every result at build time with no instance in the browser.** Kept for display (recorded outputs before the instance loads). Rejected as the only mechanism: a visitor cannot edit or run anything.
- **Loading every page graph into one site-wide instance.** Rejected as the default: it ties a page's graph to the site's, so a page with no connection to the site pays for the site's data, and one fault ends every page's graph. It remains one candidate for the case where a page wants both graphs (5.5).
- **Running page graphs on a server.** Rejected: it removes the embedded, no-server property and needs infrastructure that static hosting lacks.

## 7. Open Questions

7.1. What is the size range of real page graphs (cookbook example graphs, a typical page extracted as a graph, dashboard data), and at what size does main-thread loading stop fitting a page's budget? Nothing has been measured below 1,000 pages.

7.2. What does each additional instance on one page cost in memory and startup, and does one worker holding several databases reduce it without giving up isolation when one is trapped?

7.3. In what form should authors write page graph data so a build step can check it and the page can display it, and should the same form serve authored, shared-file and extracted data?

7.4. For editable graphs, what must a replacement restore, and is replaying the visitor's statements sound when statements can be non-repeatable, time-dependent or numerous?

7.5. Can a page's structure be turned into a useful graph without author effort, and which parts of the page (headings, links, components, text) belong in it?

7.6. When a page wants both graphs, should queries span them (the page graph loaded into the site-wide instance) or stay separate with references by identifier, and what do dashboards need from the site?

7.7. What should a page show before the instance is ready and when it fails: recorded results from build time, a placeholder, or the page's text alone, and how should a cookbook keep its examples readable?

## 8. ADRs

_(populated automatically as `/adr-create` links ADRs to this RFC)_
