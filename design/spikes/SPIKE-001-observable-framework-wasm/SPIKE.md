---
id: SPIKE-001
title: CypherLite WASM in Observable Framework
status: done
rfcs: [RFC-001]
created: 2026-11-01
---

# SPIKE-001: CypherLite WASM in Observable Framework

This is a retrospective record. The spike was done earlier in a separate local project (`observable-graph`, an Observable Framework app embedding a peer checkout of the then-unreleased CypherLite WASM build), and the findings below come from that project's own `CLAUDE.md` notes, not from a fresh run. Anything the notes do not state is marked as not recorded.

## 1. Question

RFC-001 §7.7 and §7.10: what does it take to run the WASM build inside a framework's bundler and dev server, and what does the WASM result shape require of a shared core?

The two open questions are answered together here because they were encountered together in one integration. A later spike on another framework should treat them separately.

## 2. Method

Not recorded in detail. What the source notes establish:

- An Observable Framework app, with the CypherLite WASM package built from a peer checkout of the CypherLite repository and copied into the app's dependencies.
- Queries run through a small client module, with results shaped for a force-directed graph visualization and Observable's input and table components.
- Where the instance ran (main thread or worker) and whether any persistence was used: not recorded.

## 3. Time-box

Not recorded.

## 4. Findings

Sourced from the `observable-graph` project's `CLAUDE.md` ("Gotchas" and "Conventions").

**4.1 Bundler resolution of the package.** Framework's bundler could not resolve a symlinked `file:` dependency whose real path lies outside the project, failing with "Could not resolve entry module". The workaround was to make the package manager copy linked dependencies instead of symlinking them (npm's `install-links` setting), which means rebuilding and reinstalling after every change to the database. This arose from using an unreleased peer checkout; whether it recurs with the published package is not recorded.

**4.2 Locating the `.wasm` file.** The glue code's default of resolving the `.wasm` file relative to its own module URL did not work under Framework. What worked: a sync script copies the binary into a git-ignored data directory, the framework's file-attachment mechanism produces its served URL, and that URL is passed to the module initializer explicitly.

**4.3 Result shape.** Each statement returns an envelope of `columns`, `columnTypes`, `rows` (objects keyed by column name), `stats` and `error`.
- Engine errors arrive in `error` and are not thrown.
- Row keys come back in alphabetical order, so the client reorders by `columns` (upstream issue neo4j-labs/cypherlite#528). The notes expect the reorder to stay harmless if the issue is fixed.
- Nodes and relationships carry a `kind` tag (`node` or `relationship`).
- Paths arrive as alternating arrays `[node, rel, node, ...]` with column type `PATH`. The client also handles a `{nodes, relationships}` shape defensively.

**4.4 Presentation-layer notes (specific to Observable).** Its table input formats cells with `String()`, so flattened entities needed a non-enumerable `toString` to read well. Its select input reports option indices as DOM values, and its search input matches word prefixes, which matters for scripted browser tests.

**4.5 Visualization convention.** The client flattens results into `{nodes: [{id, label, properties}], links: [{source, target, type}]}`. The graph component copies its input because the layout library mutates it. A result with no nodes or relationships yields an empty graph, deliberately.

**4.6 Not measured.** Module size, cold-start time, query latency, trap recovery, worker use, and persistence were not recorded, so RFC-001 §7.1, §7.2 and §7.6 are untouched by this spike.

## 5. Conclusion

**§7.7 (bundler handling of the `.wasm` asset).** In this framework the core cannot locate the file itself: the adapter has to produce the asset URL through the framework's own mechanism and hand it to the core, which should accept it as an explicit input. This matches the premise in RFC-001 §2. The out-of-tree dependency failure (4.1) may be specific to using an unreleased checkout, and should be rechecked against the published package in the next framework spike before it is counted as a bundler concern.

**§7.10 (WASM vs native API shape).** The WASM envelope needs normalizing before anything else can consume it: column ordering, entity tagging, path shape, and in-band errors (4.3) are all handled in application code today. These are candidates for the core's normalization layer (4.5 shows the shape one consumer wanted). The spike did not look at the native package, so whether it yields the same shapes is still open.

**Text for the RFC.** Suggested wording for RFC-001's open questions, applied manually:

> 7.7 (partial answer, SPIKE-001): under Observable Framework the adapter supplied the `.wasm` URL through the framework's file-attachment mechanism and passed it to the initializer explicitly; the default relative lookup failed. A core input for the asset location is sufficient for this framework; other bundlers remain untested.
>
> 7.10 (partial answer, SPIKE-001): the WASM result envelope required client-side normalization of column order, entity kind tags, path shape, and in-band errors. The native package's result shape was not examined.

**Gaps for follow-up spikes.** Measure module size and cold start (7.1); run in a worker and exercise trap recovery (7.2, 7.6); recheck bundler behavior with the published package; compare the native package's result shapes (7.10).
