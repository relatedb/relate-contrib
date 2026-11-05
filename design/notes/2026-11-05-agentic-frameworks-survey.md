# Survey: TypeScript and JavaScript agent frameworks

This note is about where an embedded graph (relate, the engine behind this repository's `@relate/web-*` packages) could plug into the TypeScript and JavaScript agent frameworks, and which of them to look at first. It exists so the survey is not lost. It binds no decision; when it turns into a question that needs an answer, that is an RFC. Written 2026-11-05 from public documentation and announcements found that day, not from trying any framework. Treat details as a snapshot; most of these projects change monthly.

The web adapters so far (Astro, Next) are about a browser page. An agent integration is about a program in Node, a worker or a serverless function that uses a graph as a tool, as memory, or as retrieval. That mostly means the native Node package (`@neo4j-labs/cypherlite`) or Bolt and HTTP rather than the browser WASM build, which brings back RFC-001 §7.9 (the two JavaScript APIs differ in shape).

## What an integration would be made of

Across all the frameworks below, the same few seams repeat:

| Seam | What it would be for a graph |
|---|---|
| **Tool** | A typed function the model can call: run a read-only Cypher query, describe the schema, expand the neighbourhood of a node. Nearly every framework defines tools with a Zod input schema, so one tool definition ports with little change. |
| **MCP server** | The lowest common denominator. Every framework below that is not tied to one vendor can consume MCP servers, so one graph MCP server covers all of them at once, at the price of a process boundary. |
| **Memory or vector store** | A provider that stores and recalls what an agent learned, and answers similarity queries. Only some frameworks define an interface for it (Mastra most clearly). The engine's flat vector scan fits small corpora. |
| **State and durability** | Where an agent's run state lives between steps. A graph is not the right place for the framework's own run state; it is the place for what the agent knows. |
| **Runtime** | Node, edge, Lambda, a vendor sandbox. It decides whether the native package can run at all (native binaries are platform-specific) or only the WASM build can. |

One naming trap: several of these frameworks already have a "graph" that means a workflow of steps (LangGraph, Strands' Graph pattern) or a data structure with algorithms (Effect's `Graph`). None of them is a property graph with a query language. Documents here should say "workflow graph" or "knowledge graph" and never bare "graph".

## The frameworks

| Framework | What it is | Tools | MCP | Memory or retrieval | Runtime | Notes for us |
|---|---|---|---|---|---|---|
| **Vercel AI SDK** (`ai`, v6 has `ToolLoopAgent`) | The most widely used TypeScript toolkit; a model-calling loop with tools and an approval flag. | Zod input schema plus `execute` | Separate package (`@ai-sdk/mcp`) | None of its own | Anywhere JavaScript runs | The base layer under several others (Mastra builds on it; Strands accepts its providers). A tool written for it is the most portable form. |
| **Vercel eve** (`eve` on npm; public beta announced 2026-06-17, Apache-2.0) | An open-source framework where an agent is a directory: Markdown for instructions and skills, one TypeScript file per tool (`defineTool`, Zod). Durable execution, sandboxed compute, approvals and evals. | `agent/tools/*.ts` | Not confirmed in what was read | Not confirmed | A server built from the folder; deploys as a Vercel project. Third parties disagree on whether it can be self-hosted. | A graph integration would be a tool file plus a skill file explaining the schema. The file-per-tool shape makes a published "pack" of them natural. Vendor coupling to check. |
| **Mastra** | TypeScript framework for agents, workflows, tools, memory and MCP; MCP client and server. | Typed tools | Client and server | Storage providers (LibSQL, Postgres), semantic recall with a vector store and embedder, 12+ vector stores, a reranking step | Node; deploys to several platforms | Has the clearest memory and vector-store interface, so it is where a graph as memory is most direct. Core is Apache-2.0; code under `ee` directories is commercial. |
| **Google ADK for TypeScript** (`@google/adk`, announced 2025-12-17) | Code-first agents, instructions and tools; Gemini-first but model-agnostic; A2A for agent-to-agent calls; dev UI. | Functions with Zod | Not confirmed | None of its own | Local, container, Cloud Run | Early (0.1.0 at the snapshot; its own README said not yet for production). Watch, do not build on yet. |
| **Strands Agents SDK** (`@strands-agents/sdk`; preview in 2025-12, v1 since) | AWS's model-driven SDK; Bedrock default, other providers accepted; agent-as-tool, Graph and Swarm patterns. | Zod | MCP client | None of its own | Node 20+, browser, Lambda, Bedrock AgentCore | Interesting for the browser: it runs client-side, which is where the WASM build lives. |
| **LangGraph.js** (`@langchain/langgraph`) | Low-level orchestration of agents as workflow graphs, on LangChain.js. | LangChain tools | Via adapters | LangChain stores and retrievers | Node | Very widely used; its retriever and store interfaces are another seam. Its own "graph" is a workflow. |
| **OpenAI Agents SDK** (JavaScript) | Agents with tools, instructions, handoffs, optional output schemas. | Zod | Supported | None of its own | Node | Not researched beyond a comparison article. |
| **Claude Agent SDK** (TypeScript) | Claude's agent loop with file and shell primitives; Claude models only. | Custom tools and MCP | MCP first | None of its own | Node | Not researched beyond a comparison article. Natural fit for an MCP graph server. |
| **Cloudflare Agents SDK** | Agents as Durable Objects with per-agent state; positioned as a runtime other frameworks can target. | Framework's own | Supported | Durable Object state, plus Cloudflare's vector products | Cloudflare edge | A runtime question more than a framework one: the native package cannot run there, only WASM. |
| **Inngest AgentKit** | Agents and networks with durable, event-driven execution. | Typed tools | Supported | None of its own | Node, centralized | Durability layer; low priority. |
| **Effect** (`effect`, `Graph` module since 3.18, experimental) | Not an agent framework. A functional runtime with a graph data structure: directed and undirected graphs, mutable and immutable, with algorithms (A*, connected components, and others). | n/a | n/a | n/a | Anywhere | Different in kind: an integration is a `Layer` and service around an instance (scoped lifetime, typed errors) and conversion between an Effect `Graph` and the graph data format (ADR-002). Probably small. |

Not looked at: VoltAgent, Genkit, LlamaIndex.TS, Microsoft Agent Framework, Semantic Kernel. Add them if the first round leaves a gap.

## What this suggests (a lean, not a decision)

1. **A graph MCP server comes first**, because it serves every row above with one piece of work, and the agent frameworks are all converging on MCP. It also forces the decision about which runtime hosts the engine.
2. **Per-framework packages are thin Zod tool definitions over that same client**, so they are cheap once the first exists. The order would follow who we want to reach: Mastra (memory interface, most direct fit), then Vercel's AI SDK and eve (largest audience, one tool shape), then Strands (browser-capable).
3. **Effect is a separate, small adapter** and does not belong in the agent group.
4. **Memory is where a graph is different from a plain database tool.** Mastra's vector-store and memory interfaces and LangChain's retriever interfaces are the places an embedded graph with vector search could be a real provider, not only a tool. That overlaps the site-graph and navigation work (planned RFC-003 and RFC-004): both need embedding generation and a query-time strategy, and the answer should be shared.

## Questions this leaves

- Which runtime hosts the engine for an agent: the native Node package in the agent's process, a separate Bolt or HTTP server, or WASM in a worker? (RFC-001 §7.5 and §7.9 were left open for exactly this.)
- What may an agent do to the graph: read only, scoped writes, or full access? Cypher from a model is a safety question before it is a convenience.
- Who produces embeddings, and where do they live, so a Mastra memory provider, an MCP tool and the site's navigation element do not each invent their own?
- Does eve's self-hosting story, and whether it consumes MCP, change whether it is a first-round target?
- Is a "pack" (tools plus a skill that explains the schema to the model) a better unit to publish than a library?

## Sources

- Vercel: [Introducing eve](https://vercel.com/blog/introducing-eve), [changelog](https://vercel.com/changelog/introducing-eve-an-open-source-agent-framework), [eve](https://vercel.com/eve). Third-party views on lock-in: [Omnara](https://www.omnara.com/guides/vercel-eve), [Digital Applied](https://www.digitalapplied.com/blog/vercel-eve-open-source-typescript-agent-framework-launch). Some other articles give a different package name and should not be relied on.
- Mastra: [mastra.ai](https://mastra.ai/en/examples/memory/use-chat) and third-party summaries ([memU](https://memu.pro/blog/mastra-typescript-agent-framework-memory)).
- Google ADK: [google/adk-js](https://github.com/google/adk-js), [announcement](https://developers.googleblog.com/en/introducing-agent-development-kit-for-typescript-build-ai-agents-with-the-power-of-a-code-first-approach/). An unofficial port, `adk-typescript`, also exists and is a different project.
- Strands: [TypeScript SDK](https://github.com/strands-agents/sdk-typescript), [v1 post](https://strandsagents.com/blog/strands-agents-typescript-v1/).
- Effect: [Graph module](https://effect-ts.github.io/effect/effect/Graph.ts.html), [3.18 release](https://www.effect.website/blog/releases/effect/318).
- Vercel AI SDK: [Vercel Academy](https://vercel.com/academy/filesystem-agents/agent-skeleton) and third-party guides; the release date differs between sources.
- Cloudflare: [Agents SDK changelog](https://developers.cloudflare.com/changelog/2025-02-25-agents-sdk/); Inngest: [AgentKit](https://agentkit.inngest.com/reference/introduction). Rankings on the comparison site agentic-frameworks.pages.dev are one author's rubric.
- LangGraph.js, the OpenAI Agents SDK and the Claude Agent SDK were found only through comparison articles; verify against their own documentation before relying on any detail.
