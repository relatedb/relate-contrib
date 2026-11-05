# Survey: agent frameworks and coding agents

This note is about where an embedded graph (relate, the engine behind this repository's `@relate/web-*` packages) could plug into agents, in two groups: the TypeScript and JavaScript frameworks people build agents with, and the coding agents (Claude Code and its peers) that people work with. It says which to look at first. It exists so the survey is not lost. It binds no decision; when it turns into a question that needs an answer, that is an RFC. Written 2026-11-05 from public documentation and announcements found that day, not from trying any framework. Treat details as a snapshot; most of these projects change monthly.

The web adapters so far (Astro, Next) are about a browser page. An agent integration is about a program in Node, a worker or a serverless function that uses a graph as a tool, as memory, or as retrieval. That mostly means the native Node package (`@neo4j-labs/cypherlite`) or Bolt and HTTP rather than the browser WASM build, which brings back RFC-001 §7.9 (the two JavaScript APIs differ in shape).

## What relate already provides

The engine is now `relate` (RelateDB; this repository's vendored copy still carries the old name `cypherlite` in places), and its command-line tool already covers much of the agent side. Read from its repository's documentation (`docs/api/cli`, `docs/api/mcp`, `docs/api/extensions`, at commit `0b596fd8`); the CLI was not run for this note and is not installed on this machine, so check behavior against a release before relying on it.

- **MCP server:** `relate serve --database PATH --mcp PORT|stdio` hosts one store over streamable HTTP or stdio, with optional `--read-only`, `--auth`, and a tool-name namespace. Three tools today: `get_schema`, `read_cypher`, `write_cypher` (Neo4j's reference MCP server's vocabulary under Relate names). Results come in the canonical result envelope with plan notifications. Write detection uses `EXPLAIN`.
- **Skill installation:** `relate skill install|remove|list|check [--agent NAME]` writes a bundle (`<skills dir>/relate`, marked and version-stamped) into the skill directories of the agents it detects, and `check` reports drift against the binary's own bundle.
- **Agent briefing and agent mode:** `relate agent-context [COMMAND]` prints a compact briefing for agent harnesses, generated from the same command table as `--help`; piped output defaults to a compact format and a row cap; an `agent` build of the CLI exists for sandbox and Docker images (one-shot queries, JSON output, load from a URL, no self-update, no telemetry).
- **Extensions:** `relate extension init|install|list|remove|check` and `relate run <name>` mount userland commands as MCP stdio children of a host that owns the store. The host keeps the flag grammar, the store, commit policy, caps and trust (first-party channel, GitHub pin, URL, local directory). Authoring is in `sh`, `py`, `ts` or `rust`, or any language that speaks JSON-RPC. First-party examples are `fs-to-graph` and `git-to-graph`. The docs name later strata (callables, starters, engine plugins) that are not built.
- **Other doors:** Bolt, HTTP, Python and JavaScript clients, JSON snapshots, `--load` from a source.

So the working principle for this repository is to augment these, not to build parallel ones. Anything an agent or a coding agent needs that is generic (run a query, serve MCP, install a skill, see the schema) is relate's to provide, and gaps are raised upstream as RFCs or ADRs here (the project rule), not patched around.

## What an integration would be made of

Across all the frameworks below, the same few seams repeat:

| Seam | What it would be for a graph |
|---|---|
| **Tool** | A typed function the model can call: run a read-only Cypher query, describe the schema, expand the neighbourhood of a node. Nearly every framework defines tools with a Zod input schema, so one tool definition ports with little change. |
| **MCP server** | The lowest common denominator. Every framework below that is not tied to one vendor can consume MCP servers, so relate's MCP server covers all of them at once, at the price of a process boundary. |
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

## Coding agents

A coding agent is a different kind of host: the user runs it on their own machine or in their own repository, and it is extended with files and commands more than with code against an SDK. Three delivery routes cover them all, and the coding agents have largely converged on the same pieces:

| Route | What it is | Cost to the user |
|---|---|---|
| **MCP server** | The graph as a tool server the agent connects to (relate's `relate serve --mcp`). Every coding agent below supports MCP. | A process to run and a config entry; the tool descriptions are always in the model's context. |
| **CLI plus a skill** | A command-line tool (relate's `relate query ...`, with `relate agent-context` for the briefing) and a `SKILL.md` (relate's `relate skill install`) that tells the agent when and how to run it. The agent uses its shell. | Nothing running between uses; the skill's text loads only when relevant, so it costs less context than MCP. Needs the binary installed. |
| **Direct code** | Plugin code, hooks that run on agent events, or a language-server style integration. | Per-agent and the most coupled; worth it only for something MCP and a CLI cannot do, such as acting on every file edit. |

What is common across agents: a **skill** is a folder with a `SKILL.md`, an open format that Anthropic created and that more than 40 agents are reported to read (the specification is hosted at agentskills.io; the format is the file, and each agent decides how it runs it). **`AGENTS.md`** is a shared file of standing project instructions. A **plugin** is the installable bundle of skills, MCP configuration and sometimes hooks and agents. This repository already follows the shared layout: its skills live in `.agents/skills/` and are linked from `.claude/skills/`.

The five most used, by 2026 usage surveys (Stack Overflow's measures any use in the past year; JetBrains' measures primary use at work among professionals, so the two disagree on size but agree on order at the top):

| Agent | Usage (survey) | Extension surfaces | How a graph integration would arrive |
|---|---|---|---|
| **Claude Code** (Anthropic) | 66% (Stack Overflow), 39% (JetBrains) | Skills, plugins (bundles of skills, agents, hooks, MCP servers, language servers), marketplaces, subagents, hooks, MCP, `CLAUDE.md` | All three routes. A plugin is the unit to publish: skill, CLI instructions and MCP configuration together. Marketplaces make installation one command. |
| **GitHub Copilot** (GitHub, Microsoft) | 59%, 21% | Custom instructions, agent skills (`.github/skills`), custom agents (`.github/agents`), MCP servers, extensions that bundle them, hooks; agent mode in the IDE and a cloud coding agent that runs in GitHub Actions | MCP and skills. The cloud agent runs in Actions, so anything it uses must be installable in that environment, which favors a CLI or MCP server that runs from a package. |
| **OpenAI Codex** (CLI, IDE and cloud) | 30%, 16%; reported as the fastest-growing in business spend | `AGENTS.md`, skills (`.agents/skills`, with an `agents/openai.yaml` that can declare an MCP dependency), MCP, plugins as the distribution unit, subagents | Skills plus MCP. OpenAI recommends building up in that order, and a skill can declare the MCP server it needs, so one skill can install both. |
| **Cursor** | 26%, 12% | Rules (`.mdc` files with glob targeting), skills, agents, commands, hooks, MCP, plugins in two formats (a portable "agent plugin" with a `plugin.json` that packs skills and MCP servers, and a Cursor-specific one), a reviewed marketplace, team marketplaces | The portable plugin format, so one package works there and elsewhere; Cursor-specific rules only if needed. Submission to its marketplace is manually reviewed. |
| **Google Gemini CLI** (with Antigravity and Gemini Code Assist alongside) | Not separately measured; the surveys track Gemini Code Assist (about 15%) and Antigravity (16% in one) | Extensions that bundle MCP servers, `GEMINI.md` context, custom commands, hooks, sub-agents and skills (read from `.gemini/skills` or `.agents/skills`), installed from GitHub | MCP and skills, packaged as an extension. Antigravity's extension model was not researched. |

The fifth place is the least certain. Surveys disagree on who holds it, and Gemini CLI itself is not measured on its own; it is chosen here because it is Google's counterpart of the other terminal agents and has the same extension pieces. Also widely used and not researched: Cline, Roo Code, opencode, Windsurf, Amp, Kiro, Zed and Goose. Of those, Amp, Roo Code and Goose are named among the agents that read `SKILL.md`; for the others it was not checked.

Two different things an integration could give a coding agent, and they should not be mixed up:

- **Help adopting the web adapters.** A skill that teaches an agent to add `@relate/web-astro` or `@relate/web-next` to a site correctly: the route file, the provider placement, the rules about inline graphs. This is documentation as a skill, needs no running process, and works in every agent above. It is the cheapest first step.
- **A graph the agent works with.** The agent queries a graph about the user's project (the site's content, a codebase, notes) or keeps its own memory in one. This is the MCP or CLI route, and it needs the engine to run somewhere the agent can reach, which `relate serve` already does (not a browser).

## What this suggests (a lean, not a decision)

Relate already ships an MCP server, a CLI and a skill installer, so this repository does not build those. What is left for it is what relate does not do, which is mostly about the web and about content.

1. **Use relate's MCP server and CLI as they are**, and make the agent frameworks and coding agents consume them: Mastra, the Vercel AI SDK (`@ai-sdk/mcp`), Strands and the other frameworks that act as MCP clients need configuration and a recipe, not new code. For these, the work here is documentation and tested examples.
2. **A site-content-to-graph extractor as a relate extension** (`relate run site-to-graph`, authored in TypeScript, which the extension system supports). That is the same job as the planned RFC-003 (how content becomes a site graph). Written as an extension, one implementation serves a build step (producing the graph document an adapter's `source` returns), an agent (who can run it and then query the result) and CI. Its first-party siblings, `fs-to-graph` and `git-to-graph`, show the shape.
3. **A skill for adopting the web adapters** (`@relate/web-astro`, `@relate/web-next`): documentation as a `SKILL.md`, with nothing running. `relate skill install` installs relate's own bundle for the agents it detects; whether it can carry a second, third-party bundle, or whether the adapters' skill should be a section of relate's, is a question for upstream (see below). Until then it can ship as a plain skill folder, since the format is shared across the coding agents.
4. **Adapters where MCP is the wrong seam.** Mastra's memory and vector-store interfaces and LangChain's retriever and store interfaces want a provider object, not a tool. Those would be thin packages over relate's JavaScript client or Bolt, and only where there is a real interface to implement. Effect is a separate, small adapter (a `Layer` and a conversion between `Graph` and the graph data format) and does not belong in the agent group.
5. **Memory is where a graph differs from a plain database tool**, and it overlaps the navigation work (planned RFC-004): both need embedding generation and a query-time strategy, which should be decided once and ideally in relate.

## Questions this leaves

- Which runtime hosts the engine for an agent? Relate's answer is a process (`relate serve`, stdio or HTTP), which fits agents and coding agents. The browser WASM build and Cloudflare-style runtimes are the cases that process model does not reach. (RFC-001 §7.5 and §7.9 were left open for exactly this.)
- What may an agent do to the graph? Relate offers `--read-only`, `--auth` and a separate `write_cypher` tool, so the policy knob exists; what is open is the default recommendation for a site's graph, since Cypher from a model is a safety question before it is a convenience.
- Who produces embeddings, and where do they live, so a Mastra memory provider, an MCP tool and the site's navigation element do not each invent their own?
- Does eve's self-hosting story, and whether it consumes MCP, change whether it is a first-round target?
- Is a "pack" (tools plus a skill that explains the schema to the model) a better unit to publish than a library? For coding agents the equivalent is one portable plugin; does it stay portable once hooks are involved?
- For coding agents, the CLI and MCP routes are relate's; is the first deliverable here the adoption skill, the site-to-graph extension, or both?
- A coding agent's cloud form (Copilot's coding agent in Actions, Codex's cloud tasks) runs in a sandbox; relate's `agent` build and `--load` from a URL look aimed at that. Is it enough, and how does a site's graph get into it?
- Upstream, to check with the relate repository's owners: can `relate skill install` carry additional bundles; are vector search and neighbourhood expansion meant to be MCP tools (today the three tools are schema, read and write); who generates embeddings; and are the planned extension strata (callables, starters, engine plugins) the home for a content extractor with its own schema?

## Sources

- Vercel: [Introducing eve](https://vercel.com/blog/introducing-eve), [changelog](https://vercel.com/changelog/introducing-eve-an-open-source-agent-framework), [eve](https://vercel.com/eve). Third-party views on lock-in: [Omnara](https://www.omnara.com/guides/vercel-eve), [Digital Applied](https://www.digitalapplied.com/blog/vercel-eve-open-source-typescript-agent-framework-launch). Some other articles give a different package name and should not be relied on.
- Mastra: [mastra.ai](https://mastra.ai/en/examples/memory/use-chat) and third-party summaries ([memU](https://memu.pro/blog/mastra-typescript-agent-framework-memory)).
- Google ADK: [google/adk-js](https://github.com/google/adk-js), [announcement](https://developers.googleblog.com/en/introducing-agent-development-kit-for-typescript-build-ai-agents-with-the-power-of-a-code-first-approach/). An unofficial port, `adk-typescript`, also exists and is a different project.
- Strands: [TypeScript SDK](https://github.com/strands-agents/sdk-typescript), [v1 post](https://strandsagents.com/blog/strands-agents-typescript-v1/).
- Effect: [Graph module](https://effect-ts.github.io/effect/effect/Graph.ts.html), [3.18 release](https://www.effect.website/blog/releases/effect/318).
- Vercel AI SDK: [Vercel Academy](https://vercel.com/academy/filesystem-agents/agent-skeleton) and third-party guides; the release date differs between sources.
- Cloudflare: [Agents SDK changelog](https://developers.cloudflare.com/changelog/2025-02-25-agents-sdk/); Inngest: [AgentKit](https://agentkit.inngest.com/reference/introduction). Rankings on the comparison site agentic-frameworks.pages.dev are one author's rubric.
- Coding agents: usage from the [Stack Overflow 2026 survey](https://survey.stackoverflow.co/2026/ai/data/ai-code-agent) and [JetBrains Research](https://dev.to/jangwook_kim_e31e7291ad98/ai-coding-market-share-2026-whos-winning-34nc) as reported by a summary article; other market-share pages contradict each other and were not used. Claude Code: [plugins overview](https://code.claude.com/docs/en/plugins/overview), [plugins reference](https://code.claude.com/docs/en/plugins-reference?m=1). Codex: [customization](https://developers.openai.com/codex/concepts/customization.md) and community guides. Cursor: [plugins](https://cursor.com/docs/plugins), [customize](https://cursor.com/docs/customize-cursor). Copilot: [comparing customizations](https://docs.github.com/en/copilot/concepts/customizations/comparing-customizations). Gemini CLI: [writing extensions](https://geminicli.com/docs/extensions/writing-extensions). Agent Skills: [agentskills.io](https://agentskills.io/); the count of supporting agents differs between sources (27+ to 40+).
- LangGraph.js, the OpenAI Agents SDK and the Claude Agent SDK were found only through comparison articles; verify against their own documentation before relying on any detail.
