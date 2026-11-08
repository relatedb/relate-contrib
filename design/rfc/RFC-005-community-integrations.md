---
id: RFC-005
title: Integrations for Community Projects and Hackathons
status: draft
created: 2026-11-08
adrs: [ADR-008]
---

# RFC-005: Integrations for Community Projects and Hackathons

## 1. Summary

RelateDB (relate) is an embedded property-graph database that speaks openCypher. In the browser it runs inside a Web Worker, behind a core package that gives a page asynchronous queries; results come back as columns and rows. A launch with a hackathon brings people who arrive with ideas: a game, a notes app, an admin tool, a map, a graph explorer. Their first hours go to wiring a database into whatever library they already use, and the wiring is the same few problems each time: shaping rows into a library's data model, bridging an asynchronous database to code that expects an answer now, turning a user interface's sort and filter state into safe queries, and giving records stable identities.

The organizing claim is that the integrations worth building at this stage are starters, not a catalogue of adapters. A starter is a small, runnable application for one kind of project, with the helper it needs, chosen so that most ideas have a near neighbour to copy. Its purpose is to inspire community projects and lower the friction of adopting the database. Starters are built in one repository; needs that recur across them are extracted into shared libraries afterwards, once the repetition is visible.

This RFC settles what the integrations are for, how candidates are chosen, what kinds of work they involve, and how much design process each one gets. It does not choose the full list.

## 2. Problem / Motivation

Integration with web frameworks is covered: adapters exist for four frameworks and handle hosting, page lifecycles and data delivery. What people build on top of a framework is not covered, and a survey of the libraries used for those things (2026-11-08, in `design/notes/2026-11-08-integration-candidates-survey.md`) shows what a newcomer meets:

- **Libraries want their own data shapes.** One graph-visualization library mutates the objects it is given and replaces link endpoints with references to nodes; another needs a coordinate for every node and so a separate layout step; a third needs positions and offers no layout at all. A result of rows and columns fits none of them without a conversion.
- **Remote data models ask for queries.** The datagrids that load data on demand describe the user's sort, filter, grouping and page as a model, and expect the application to turn it into a query. Doing that by concatenating text into a query allows injection; doing it safely needs a declared list of columns and bound parameters. Each participant would write this again.
- **Frame loops cannot wait.** A game's update runs many times a second and cannot await a database in a worker. Turn-based games can pause for an answer; frame-based ones need a cache and a queue. The right pattern is easy to describe and easy to get wrong.
- **Frameworks define small data contracts.** An admin framework's data provider is a short list of methods (list, get, create, update, delete, references). One implementation gives a working multi-screen application over a graph. Relationships map onto its reference fields, but the mapping has to be designed: foreign key versus edge, direction, stable ids.
- **Editors need a derived graph.** A block or Markdown editor keeps its document in its own format; links, backlinks, tags and embedded queries have to be projected into the graph on save, in a way that survives moves, renames and undo.
- **Some dependencies bind their users.** Several candidate libraries hold their useful features behind a paywall or a copyleft licence for add-on packages. A starter that depends on one hands those terms to every project that copies it.
- **The engine has limits a starter must respect.** Spatial support is points only, with no lines or polygons. A browser instance is private to a visitor. A shared, durable store needs one long-lived writer process, and the server's single shared credential does no per-user authentication.

The relate core team is building the common interface components and the agent integration. Games, third-party graph visualization, map visualization and the building blocks of do-it-yourself SaaS applications are outside that work. Without starters for them, every hackathon project begins with the same integration task, and the variety of what the database can do goes unseen.

## 3. Goals

- **Inspire.** Each starter is a working application a participant can run, change and show within hours, not a fragment. Together the starters span application types (administrative tools, document editors, graph and data visualization, games, maps) so that most project ideas have a close example.
- **Lower adoption friction.** The path from a clean checkout to a first query on screen takes minutes. The integration problem is already solved when a participant starts.
- **Run locally first.** The first batch runs entirely in the browser with no server, so participants install nothing but the starter's own dependencies and share no data between visitors.
- **Find the common needs.** Starters live in this repository so that repetition across them is visible. Result shaping, safe construction of queries from interface state, the asynchronous-to-synchronous bridge, stable record identity and data seeding are the expected candidates. A need is extracted into a shared library when starters demonstrate it, not before.
- **Grow the ecosystem.** Starters depend on libraries from the wider open ecosystem. They do not depend on products owned by the engine's vendor, and they favour permissive licences that leave a participant's project free of obligations.
- **Spend process in proportion.** This RFC covers the program. Each starter records its own decisions in a short ADR; a target that turns out to need real design gets a fuller treatment.

## 4. Non-Goals

- Covering every library in a category, or every framework. Each category gets a few representative starters.
- Replacing the core team's interface components or agent integration.
- Server-backed, multi-user kits in the first batch. Shared durable data is a separate shape of application (one writer per store, a proxy, application-side tenant checks) and is taken up later.
- Headless content-management systems.
- New engine capabilities. Gaps found while building starters (richer spatial types, for instance) are raised with the engine's maintainers, not worked around inside a starter.
- A promise of long-term compatibility with every release of a third-party library. Starters pin versions.
- Choosing the complete list of starters or their order beyond the first one.

## 5. Proposed Approach (high-level)

### 5.1 Three kinds of work

The candidates differ in cost, and the differences set how much process each needs:

| Kind | What it involves | Typical weight |
|---|---|---|
| Result transform | A function from query results to a library's data model | small |
| Contract implementation | An implementation of an interface a framework already defines | small to medium |
| Pattern kit | A runnable application plus a recipe for one awkward problem | medium |

None of them needs a hosting adapter's lifecycle machinery. The framework adapters stay as they are; starters build on the core package.

### 5.2 Choosing candidates

A candidate is judged on:

- how many people it reaches, and how quickly it yields an impressive demo;
- how well it fits an asynchronous, worker-hosted data source;
- licence terms, and whether any needed feature sits behind a paywall or copyleft;
- signs of continued maintenance;
- whether the starter exercises the graph (paths, neighbourhoods, aggregates) and not only storage.

The survey note holds the candidate libraries with their figures. A first ordering favours a data provider for an admin framework, because its contract is small and its demo is broad: several linked entities with list, filter, edit and relation pickers, all in the browser. Graph-visualization helpers, a document-editor starter, a datagrid-to-query translator, a frame-based and a turn-based game starter, and a map example follow, in an order the ADRs settle.

### 5.3 Starters first, shared libraries by extraction

Starters are built in this repository, each on the core package. When two starters need the same thing, the second one's work includes extracting it into a shared library that both use. The shared libraries then become what later integrations, and community projects, build on. Extraction driven by evidence keeps the libraries small and fitted to real use.

### 5.4 Process

This RFC states the goals and the approach. Each starter, or family of starters with the same shape, records one short ADR: which library, what the helper does, how it is checked. A target with real design in it (a second runtime, a document model, a server) gets its own RFC or a fuller ADR. Each starter has an automated check that it builds and answers a query, so it does not decay between launches.

### 5.5 Cross-cutting concerns

- **Licences** are checked before a library is adopted, including the terms of add-on packages.
- **Safe queries.** Anything that builds a query from user interface state takes identifiers from a declared list and binds values as parameters.
- **Identity.** The engine's internal ids can be reused, so starters give records an application-assigned stable id.
- **Local data.** Starters seed their data, and say what survives a reload and what a visitor clearing browser storage loses.

## 6. Alternatives Considered

- **An adapter package for every library.** Rejected: most libraries need a function or a small provider, not a lifecycle, and a package per library multiplies maintenance for little gain at launch.
- **Written recipes without runnable code.** Rejected: a recipe cannot be run or checked, drifts from the libraries it describes, and leaves the participant doing the setup.
- **Shared libraries designed first, starters afterwards.** Rejected: which needs recur is unknown until starters exist, and libraries designed in advance are shaped by guesses.
- **Leaving integrations to the community.** Rejected: the first participants would have nothing to copy, and the same integration problems would be solved separately each time.

## 7. Open Questions

7.1. Which starters make up the first batch, and in what order? A data provider for an admin framework leads; the rest of the survey's candidates are open, and each ADR settles one.

7.2. Where does a slim ADR end and a full RFC begin? Candidate triggers: a starter that adds a second runtime, introduces a document or data model other starters would share, or needs a server.

7.3. Which shared libraries are likely, and what triggers an extraction: the second starter that needs it, or the third?

7.4. What do local-first starters promise about persistence: seeded in-memory data that resets, or a browser file store that survives reloads? This touches the visitor-edit and recovery questions in RFC-002.

7.5. How are starters maintained after the hackathon, and how are updates and breakages in third-party libraries noticed?

7.6. Should a shared library prescribe stable application ids for nodes and relationships, or leave identity to each starter?

7.7. When does a server-backed kit come, and for whom, given one writer process per store and a single shared credential?

7.8. How is success measured: time from a clean checkout to a first query, the number of participant projects that began from a starter, or something else?

## 8. ADRs

- ADR-008: a react-admin data provider over the core, with a local-first starter
