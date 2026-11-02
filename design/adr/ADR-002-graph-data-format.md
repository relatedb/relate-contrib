---
id: ADR-002
title: Node-Link JSON as the Graph Data Format
status: proposed
rfcs: [RFC-001, RFC-002]
created: 2026-11-02
---

# ADR-002: Node-Link JSON as the Graph Data Format

## 1. Context

The browser build of CypherLite (Neo4j Labs' embedded property-graph database) has no way to import a snapshot. Every graph it holds is built by running statements, so a graph has to arrive as plain data that a loader replays through a fixed set of parameterized statements. Replaying a site's pages and links this way took about 0.16 s at 1,000 pages and 2.2 s at 20,000 on the main thread.

Two kinds of producer write that data, and they share nothing else:

- A build step that turns a site's content into a graph (pages, links, later embeddings). Its schema is still to be designed.
- A page author, or a tool, that supplies a small graph of unrelated data for one page: a notebook's example graph, a dashboard's figures, a page encoded as a graph. Nothing about it is shaped like a site.

The loader in the shared core package needs one input that serves both. The measurements so far used a fixed pages-and-links shape, which would tie the loader to one schema.

A property graph has more structure than most JSON graph formats carry: a node has any number of labels, a relationship has exactly one type, and both have named properties. The most widely produced format for graphs in JSON is the node-link form that D3 popularized: a `nodes` array and a `links` array whose entries name their endpoints. It is simple and any tool can emit it. It stores properties flat on the node or link, beside `id`, `source` and `target`, so a reader cannot tell which keys are properties and which are structure without knowing the convention. D3 also overwrites `source` and `target` with node objects, and adds `x`, `y` and velocity keys, when a force simulation runs.

CypherLite's own bulk-write path (ADR-0155 in its repository) already loads nodes from rows holding labels and properties with `UNWIND $rows AS row CREATE (n:$(row.labels))`, so labels can be supplied as data and the loader's statements stay fixed.

## 2. Decision

### 2.1 Node-link JSON with a reserved `properties` key

The graph is one JSON document in node-link form. Structure and properties are separated: every entity has a fixed set of structural keys, and everything the author wants to store lives under a key named `properties`. No other key carries data.

```json
{
  "version": 1,
  "revision": "9f2c41e",
  "nodes": [
    {
      "id": "page:/docs/start/",
      "labels": ["Page"],
      "properties": { "title": "Getting started", "words": 812 }
    },
    { "id": "page:/docs/query/", "labels": ["Page"], "properties": { "title": "Querying" } }
  ],
  "links": [
    {
      "source": "page:/docs/start/",
      "target": "page:/docs/query/",
      "type": "LINKS_TO",
      "properties": { "section": "next steps" }
    }
  ]
}
```

The labels, relationship types and properties in the example are illustrative; the site graph's schema is set elsewhere.

### 2.2 Document keys

- `version`: required integer, the version of this format. A loader that does not know the version rejects the document. This decision defines version 1.
- `revision`: optional string that changes whenever the data changes (a build id or a hash of the content). The staleness check for a stored graph (ADR-001 2.4) compares it. A document without a `revision` is never restored from or written to a store.
- `nodes`: required array. `links`: required array (either may be empty).

### 2.3 Nodes

- `id`: required string, unique across all nodes in the document, whatever their labels. It names the node as a link endpoint, and the loader stores it on the node as a property called `id` so queries can look nodes up by it.
- `labels`: optional array of strings, empty when omitted.
- `properties`: optional object. It must not contain a key named `id`.

### 2.4 Links

- `source` and `target`: required strings, each the `id` of a node in the document. A link is directed from source to target.
- `type`: required string, the relationship type.
- `properties`: optional object.
- Any number of links may connect the same two nodes, and a link may connect a node to itself.

### 2.5 Property values

A property value is a string, a finite number, a boolean, or a non-empty array whose items are all strings, all numbers or all booleans. An array of numbers is how an embedding is carried. JSON does not distinguish integers from floats, so a number with no fractional part loads as an integer and any other number as a float; integers beyond ±2^53 cannot be represented. How an embedding must be typed for vector search is decided with the site-graph schema. `null`, nested objects, arrays of arrays and empty arrays are not accepted: a property that has no value is left out. Dates and other richer values are strings.

### 2.6 Validation

A validator in the core package checks a document against these rules and reports the path of the first problem (for example `nodes[3].properties.id`). Build steps call it when they produce a document, and the loader calls it, in the worker, before running any statement, so a rejected document leaves the instance empty. These are errors: an unknown key on the document, a node or a link; a duplicate node `id`; a link endpoint that names no node; a value that is not allowed in 2.5.

### 2.7 Mapping to the graph

A node becomes one graph node with its labels, the entries of `properties`, and the `id` property. A link becomes one relationship of the given type from the source node to the target node, with the entries of `properties`. Labels and relationship types are applied as data (dynamic labels and types), so the loader's statements do not depend on which labels a document uses.

Link endpoints are resolved through the element ids (the engine's internal identifiers for nodes and relationships) that the engine returns for the node batch, the pattern in CypherLite's own bulk loader (ADR-0155). The loader keeps a map from node `id` to element id for the duration of one load, so no label or index takes part in resolving an endpoint.

The loader creates no indexes of its own. A caller that looks nodes up by `id` names the labels to index, and those indexes are created before the nodes are loaded.

A load may be given a scope value. The loader then adds a `scope` property with that value to every node it creates (ADR-001 2.5 drops page-scoped data by matching that property, and a detach-delete removes the nodes' relationships with them), and a `scope` key in a node's `properties` is then an error. Ids need to be unique only within one document, so a document loaded as an overlay may reuse ids that exist in the site graph; a lookup by `id` in an instance that holds several documents should also name a label or a scope.

### 2.8 Left to other decisions

The order and size of the loader's batches, chosen at implementation against the measured replay costs. The site graph's schema (which labels, relationship types and properties a site's pages carry) and how embeddings are represented: a convention over this format, set by the site-graph RFC. How the document reaches the page (embedded in the page, fetched, or generated at run time). Whether page graphs may also be seeded by a Cypher script, as the cookbook does today; if they may, this format covers only graphs that are shipped or delivered as data (RFC-002 5.1 and 7.3).

## 3. Alternatives Considered

- **Wait for the site-graph RFC and define a pages-and-links schema.** Rejected: page graphs carry data that is not shaped like a site, so a core that knows one schema cannot load them.
- **D3's node-link form as it is, with properties flat on the node or link.** Rejected: a reader must know which keys are structure, a property named `type`, `source` or `target` collides with one, and adding a structural key later changes the meaning of existing data. D3 documents also arrive mutated by simulation (`x`, `y`, replaced endpoints).
- **NetworkX node-link form.** Rejected: it also keeps attributes flat beside the structural keys, and its `directed` and `multigraph` flags add nothing here, since links are always directed and may repeat.
- **JSON Graph Format.** Rejected: it gives each node a single `label`, where a property graph has several labels per node.
- **Cytoscape elements or graphology's serialization.** Rejected: both are shaped by their visualization libraries and keep properties in tool-specific bags.
- **CypherLite's bulk-write row shape** (`labels`, `props`, and the engine's element ids for endpoints). Rejected as the document: a producer cannot know element ids before the load, and the shape has no document-level version or revision. The loader converts a document into these rows internally.
- **A Cypher script (or gram, a text notation for graphs that CypherLite can render results in) as the only input.** Rejected for generated data: a 20,000-page graph becomes a very large script, and a build step that wants to emit nodes and links must format statements. A script remains a possible second way to seed a small, hand-written page graph.
- **Flat properties with a documented list of reserved keys.** Rejected: the list has to be learned before a document can be read, and a key added to it later would change the meaning of existing data.

## 4. Consequences

- Any tool that can write JSON can produce a graph, and the same document serves a site-wide graph and a notebook's example graph. The validator gives every framework adapter the same check.
- Existing D3 data does not load as it is: its properties must move under `properties`, and any simulation keys must be removed. Unknown keys are errors, not ignored, so this fails loudly, and adding a structural key later means a new format version. A small converter from flat D3 data is a possible follow-up.
- The format is verbose: `properties` adds a level per node and `labels` repeats per node. Compression removes most of that; embeddings, when added, dominate the size.
- Every node has a property named `id`, and an author cannot use that name for something else.
- ADR-001 2.1 describes an index on the lookup property created before the links are loaded, which assumed a known label. Resolving endpoints through element ids removes that need for loading, so indexes serve queries only, and which labels get an `id` index is the caller's choice. The loader's first test is that this keeps loading near the figures in ADR-001 (0.6 s at 5,000 pages on the main thread, 1.4 s in the worker).
- Not verified: loading this shape at the sizes measured so far (the earlier figures used a fixed pages-and-links shape); in the WASM build, dynamic labels and relationship types in `CREATE` and the element-id seek (documented as supported in the engine); the cost of validating a 20,000-node document with embeddings; how CypherLite's vector search expects an embedding to be stored, which the site-graph RFC has to settle.
- Follow-up: the site-graph RFC defines its schema as a profile of this format; batch size and order of loading, chosen at implementation once measured; optionally a published JSON Schema for editors and build tools.
- RFC questions this decision informs: RFC-001 7.3 (the form replay takes as input; it does not answer the replay-cost questions) and RFC-002 7.3 (the form of page graph data; the cookbook's recipe form and whether it should carry the same data stay open).

## 5. Related

- RFCs: RFC-001, RFC-002
- ADRs: ADR-001 (the loader runs in its worker host)
- Evidence: `design/spikes/SPIKE-002-astro-build-time-graph/SPIKE.md` and `design/spikes/SPIKE-004-worker-hosting-and-faults/SPIKE.md` (replay costs for a fixed pages-and-links shape)
- In the CypherLite repository: ADR-0155 (bulk writes through batched `UNWIND`)
