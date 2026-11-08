# Bevy and relate in one Rust process

This note is about embedding relate, the in-memory and durable property graph engine (openCypher) that
this repository integrates with web frameworks, into a Bevy application. Bevy is a Rust game engine
built on an entity-component-system (ECS): entities are ids, components are plain data stored in
contiguous arrays, and systems run over them once per frame. The idea comes from an architecture
sketch for an autonomous, agent-driven social network, pasted in on 2026-11-08 and summarized in §1.
Nothing here is decided, and nothing has been measured. It is not a web integration, so it would not
belong to `relate-contrib`'s planned order (see `CLAUDE.md`); it is recorded because it is the first
case where the engine is used as a native Rust library, not through WASM.

## 1. The idea

Two stores with different jobs live in one process:

- **Bevy's ECS** holds what changes every frame: an agent's energy, cooldowns, typing indicators, a
  post that has just appeared and must be visible to other agents at once.
- **relate** holds what outlives a frame and is connected: identities, `:FOLLOWS` edges, groups, the
  history of who said what to whom, and (through the engine's vector search) a memory that agents
  query by meaning and by path.

The link is a component on each Bevy entity that carries the graph node's id. Writes go the other way
round from reads: Bevy spawns the entity immediately and queues a graph write; reads that need
several hops go to the graph without touching the frame loop. The language-model "brains" sit outside
the loop and reach both stores through a tool interface.

```
Bevy world  ── events ──►  channel  ──►  writer thread  ──►  relate (Cypher)
    ▲                                                            │
    └──────────── results as events ◄── reader tasks ◄───────────┘
LLM brains  ── tool calls (MCP) ──► the same channel and reader tasks
```

## 2. What the engine offers for this, as documented

Checked against `/Users/abk/Developer/relatedb/relate/docs/api/` on 2026-11-08; none of it was run.

- **A Rust crate, `relate`.** `Database::open(":memory:")`, a file path or `file://…`, with
  `Connection` for statements and `QueryResult` and `Value` for results (`docs/api/rust/spec.md`). It
  is a library, so it needs no server and no serialization between Bevy and the graph.
- **Durable local storage** (write-ahead log plus checkpoints) when given a path, which suits a
  long-lived social ledger. The spec documents recovery, snapshot formats and store-version
  migration.
- **A change-data-capture poll**, `cdc_records_after`, described as non-blocking. That is a
  candidate for the reverse direction (graph changes reaching Bevy) without Bevy polling queries.
- **An MCP surface** (`surfaces/relate-mcp`, `docs/api/mcp/`) over stdio or streamable HTTP with
  three tools: `get_schema`, `read_cypher` and `write_cypher`. Reads are separated from writes.
- **Vector search** is an exact flat scan, so its cost grows with corpus size times dimensions
  (see `CLAUDE.md`); a memory of many thousands of items is the region to measure first.

## 3. Where the pasted sketch needs checking

The sketch is a plan from another tool, and several of its statements are assumptions:

- It proposes tools named `social_graph::get_trusted_feed`, `bevy_env::publish_action` and
  `memory::query_graph_rag`. Relate's own MCP surface exposes only `get_schema`, `read_cypher` and
  `write_cypher`. The three proposed tools would be a separate, application-level server (or wrap
  the generic ones with fixed Cypher), and the sketch's `hops` and `semantic_query` arguments would
  become parameters of fixed statements. Which of the two shapes to use is open.
- It sets "multi-millisecond" for graph queries against "microsecond" for the frame loop as a given.
  No query latency from the engine was measured here.
- It says `crossbeam` or `tokio::sync::mpsc`. Whether `Database` or `Connection` can be shared across
  threads, and what threading the engine requires, is in the Rust spec's execution sections
  (a worker-stack requirement for queries is mentioned there) and has to be read before choosing
  between one writer thread, a pool, or a connection per task.
- It keys a Bevy entity to the graph with a `u64` node id. Whether relate's node ids are stable
  across checkpoints and restore is unchecked; an application-assigned property used as the key
  would not depend on it.
- The A2A (agent-to-agent) payload and the Unix-socket transport are outside the engine; they are
  application design, and nothing in this repository concerns them.

## 4. Questions worth turning into work

1. **Threading model.** How a Bevy app, which runs systems in parallel across a task pool, should
   hold a `Database`: a single writer with batched statements, read connections per task, or both.
   This is an empirical question and fits a spike with a small Bevy app and a statement mix.
2. **Sync direction.** Whether graph state flows back into Bevy by events from the writer, by
   `cdc_records_after`, or not at all.
3. **Packaging.** A Bevy plugin (a `RelatePlugin` that owns the database, the channel and the
   result events) would follow this repository's rule that the core is the shared part and each
   integration is a thin adapter. No Rust workspace exists here; a plugin would live in its own
   repository or in the engine's `examples/`, and that is a decision for the engine's owners.
4. **Relationship to the web work.** A Bevy build can target WASM, where the engine's browser build
   (the `@relate/relate-wasm` package this repository uses) would apply instead of the native crate,
   with the browser's limits (a worker, no native storage). Whether one codebase should serve both
   is a question for RFC-001's runtime table, not this note.
5. **Overlap with the agentic survey.** `2026-11-05-agentic-frameworks-survey.md` considers agent
   frameworks for relate; an agent-simulation use of Bevy belongs beside it.

## 5. If this becomes a spike

A first spike could answer the threading question alone: a Bevy app with 1,000 agent entities, a
writer thread draining a channel into `write_cypher`-style statements, and 100 concurrent multi-hop
reads, reporting frame-time variance and statement latency. It needs a Rust toolchain, which the
engine already pins (`rust-toolchain.toml`).
