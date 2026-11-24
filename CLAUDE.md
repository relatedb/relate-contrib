# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

`relate-contrib` is the planning home for **RelateDB integrations**: web frameworks first, including static site generators, with agent frameworks considered next (`design/notes/2026-11-05-agentic-frameworks-survey.md`). The engine, RelateDB (`relate`, formerly CypherLite), is an embedded, in-memory property graph engine (openCypher), shipped for the browser as a WASM library. The integrations showcase the database and are meant to run on the dedicated website first (the separate `relatedb/relate-web` repository).

Three uses of the embedded graph drive the work:

1. **Per page** — a graph (almost notebook-like) embedded in an individual page, queried with Cypher.
2. **Site-wide** — one shared graph across the whole website, with vector embeddings, powering a navigation element. The element is primarily visual with a minimal natural-language interface: language-driven navigation and search, **not a chatbot**.
3. **Application** — one durable graph in the visitor's browser, shared by the pages of an application, holding data the visitor writes. Persistence is assumed (RFC-006); the site-graph cache of ADR-001 is a cache of shipped content and is wiped on a new revision, so it is not this.

Planned integration order (subject to change as ADRs land): ObservableHQ, Astro, Next and SvelteKit (done) → Nuxt. Nuxt is deferred in favour of the community demos in RFC-005 (first: a react-admin data provider). Docs-oriented generators (Starlight, VitePress, Docusaurus) may jump the queue depending on what the relate website is built on.

## Project state

The first package, `packages/web` (`@relate/contrib-web`), is implemented from `specs/001-core-package/`
(see its `tasks.md`). The Astro adapter, `packages/astro` (`@relate/contrib-astro`), is implemented from `specs/002-astro-adapter/`
(ADR-004). The Next adapter, `packages/nextjs` (`@relate/contrib-nextjs`), is implemented from `specs/003-next-adapter/` (ADR-005) under the `@relate` namespace, like the core and the Astro adapter (all three renamed on 2026-11-08, see `design/notes/2026-11-08-relate-contrib-rename.md`). The Observable Framework adapter, `packages/observable` (`@relate/contrib-observable`), is implemented from `specs/004-observable-adapter/` (ADR-006). The SvelteKit adapter, `packages/sveltekit` (`@relate/contrib-sveltekit`), is implemented from `specs/005-sveltekit-adapter/` (ADR-007). Application mode of the core, an application graph in `createClient` (`application` option: named durable store `app-<name>`, schema version, migrations, storage status, export and import), is implemented from `specs/006-application-graphs/` (ADR-009). The graph catalog, one file (`relate-web/catalog.json`, under the Web Lock `relate-web:catalog`) that records every persisted graph and replaced the marker node of application graphs and the stored-copy file of content caches, with `listGraphs`, `removeGraph` and `resetCatalog`, is implemented from `specs/007-graph-catalog/` (ADR-010, RFC-007). The react-admin data provider, `packages/react-admin` (`@relate/contrib-react-admin`), and its demo, `demos/react-admin` (a Vite and React application over an application graph that keeps what the visitor writes), are implemented from `specs/008-react-admin-provider/` (ADR-008). Design documents are in `design/`. The path explorer demo, `demos/phaser-path-explorer` (ADR-011), is under way: slice 0 of the plan in `design/notes/2026-11-10-phaser-path-explorer.md` draws a seeded hex world read from an application graph. Its engine-facing building blocks are extracted into `packages/phaser` (`@relate/contrib-phaser`), implemented from `specs/009-relate-phaser-package/` (ADR-012), and the demo runs on them. Every package takes the prefix `@relate/contrib-` when it is published (renamed on 2026-11-19, ADR-013 2.9); the directories keep their names. The release tooling, `scripts/release` (checks, the release gate, the release plan, the engine-release lane), its workflows in `.github/workflows` (`release-checks`, `release`, `engine-release`), and `docs/releasing.md` are implemented from `specs/010-release-workflows/` (ADR-013). All seven packages were first published by hand at 0.1.0 on 2026-11-23; automated publishing stays off until `PUBLISHING_ENABLED` is set (`docs/releasing.md`). Further adapters come next.

## Commands

Workspace: pnpm. The database (`@relate/relate-wasm`, the engine) is installed from the npm registry at the version the workspace catalog names (`pnpm-workspace.yaml`); nothing is vendored or built from source.

```sh
pnpm install
pnpm -r build
pnpm test:unit                 # Vitest (Node)
pnpm test:browsers             # Playwright: Chromium, Firefox, WebKit
pnpm test:catalog-known       # the two catalog interruption tests tagged @engine-wal (relatedb/relate#576), run by the nightly engine-known workflow; no merge or release waits for them
pnpm test:perf                 # the core's load-time and restore-time tests (@perf), run by the nightly perf workflow; no merge or release waits for them
pnpm test:conformance          # the conformance check over the example site, both profiles
pnpm test:package              # packs the core, installs it in a clean project, bundles and runs a page
pnpm test:trace                # every requirement and success criterion has a passing, tagged test
pnpm test:application          # application graphs in the core: unit tests against the real engine in Node
pnpm test:application-browsers # application graphs in Chromium, Firefox, WebKit (durability, second tab, recovery, restore)
pnpm test:application-trace    # every requirement of specs/006 has a passing, tagged test (tags are `covers-app:`)
pnpm test:catalog              # the graph catalog (ADR-010): classification, intent-first lifecycle, caches, listing, removal; unit tests against the real engine in Node
pnpm test:catalog-browsers     # the catalog in Chromium, Firefox, WebKit (several tabs, the Web Lock, interrupted operations, caches, listing, removal)
pnpm test:catalog-trace        # every requirement of specs/007 has a passing, tagged test (tags are `covers-cat:`)
pnpm test:astro                # the Astro adapter: unit and build tests
pnpm test:astro-browsers       # the adapter in Chromium, Firefox, WebKit (lifecycle, store, inline graphs, profile check)
pnpm test:astro-conformance    # the core's conformance runner over packages/astro/conformance-site, both profiles
pnpm test:astro-package        # packs the adapter and core, installs them in a clean Astro project, builds and runs it
pnpm test:astro-trace          # every adapter requirement and success criterion has a passing, tagged test
pnpm test:next                 # the Next adapter: unit, build (next build under both bundlers) and development-server tests
pnpm test:next-browsers        # lifecycle, store, inline graphs, profile, hydration, direct lookup in Chromium, Firefox, WebKit
pnpm test:next-conformance     # the core's conformance runner over packages/nextjs/conformance-site (server and export, both profiles)
pnpm test:next-package         # packs the adapter and core, installs them in a clean Next project, builds under Turbopack and webpack, runs a page
pnpm test:next-trace           # every adapter requirement and success criterion has a passing, tagged test
pnpm test:observable           # the Observable adapter: results against the real engine, loaders, build, freshness and preview-server tests
pnpm test:observable-browsers  # the adapter in Chromium, Firefox, WebKit (lifetime, several graphs, components, descriptor restore)
pnpm test:observable-conformance # the core's conformance runner over packages/observable/conformance-site (per-page profile)
pnpm test:observable-package   # packs the adapter, core and engine, installs them in a clean Framework project, builds and runs a page
pnpm test:observable-trace     # every adapter requirement and success criterion has a passing, tagged test
pnpm test:sveltekit            # the SvelteKit adapter: route builder, registry, inline lookup, build failures and development-server tests
pnpm test:sveltekit-browsers   # lifetimes, consecutive pages, inline graphs, direct lookup, hydration, on-demand rendering in Chromium, Firefox, WebKit
pnpm test:sveltekit-conformance # the core's conformance runner over packages/sveltekit/conformance-site (both profiles, static and Node outputs)
pnpm test:sveltekit-package    # packs the adapter, core and engine, installs them in a clean SvelteKit 3 project, builds with each adapter, runs a page
pnpm test:sveltekit-trace      # every adapter requirement and success criterion has a passing, tagged test
pnpm test:react-admin          # the react-admin provider against the real engine (Node), and the demo's unit tests
pnpm test:react-admin-browsers # the demo in Chromium, Firefox, WebKit (lists, forms, storage, failures, reset)
pnpm test:react-admin-package  # packs the provider, core and engine, installs them in a clean project, runs a list call
pnpm test:react-admin-trace    # every requirement and success criterion of specs/008 has a passing, tagged test (tags are `covers-ra:`)
pnpm test:phaser               # the Phaser package (queue, cache, throwaway client, watcher) against the real engine (Node), and the path explorer's unit tests
pnpm test:phaser-browsers      # the path explorer in Chromium, Firefox, WebKit (a trapped engine is replaced and the board rebuilt; the throwaway world leaves the saved game alone)
pnpm test:phaser-package       # packs the package and the core, installs them in a clean project, runs the README's example
pnpm test:phaser-trace         # every requirement and success criterion of specs/009 has a passing, tagged test (tags are `covers-ph:`)
pnpm release:check             # the fast release checks: fit to publish, engine ranges against the supported engine, recorded changes
pnpm release:plan --all --rehearsal # what a release would publish, in dependency order, with each gate verdict (nothing is published)
pnpm test:release              # the release scripts' unit tests (fixtures and a stand-in registry; no engine, no network)
pnpm test:release-trace        # every requirement and success criterion of specs/010 has a passing, tagged test (tags are `covers-rel:`)
pnpm test:engine-assumptions   # each package's engine-assumptions test (the engine behaviours it relies on) against the supported engine
```

Release tooling: `scripts/release/` (one script per check, `lib/`, `tests/` with fixtures and a stand-in registry, `trace/`), `.github/workflows/{release-checks,release,engine-release}.yml`, `.github/actions/report-failure`, `.changeset/` (recorded changes and the maintainers' allow list for 1.0), and `docs/releasing.md`. Layout: `packages/web/src` (client, worker, data validators, profiles), `tests/` (unit, browser, package,
fixtures, load-time baselines), `conformance/` (example site, scenarios, runner). Read
`packages/web/README.md` for the API. The adapter: `packages/astro/src` (integration, injected route, component, client
module), `tests/`, `conformance-site/` (an unpublished Astro site built once per profile); read `packages/astro/README.md`. The Next adapter: `packages/nextjs/src` (config wrapper, server entry, client entry), `tests/`, `conformance-site/` (an unpublished Next app); read `packages/nextjs/README.md`. The Observable adapter: `packages/observable/src` (loader, browser and results entries), `tests/`, `conformance-site/` (an unpublished Framework project); read `packages/observable/README.md`. The SvelteKit adapter: `packages/sveltekit/src` (a Svelte-source main entry and a `server` entry), `tests/`, `conformance-site/` (an unpublished SvelteKit app); read `packages/sveltekit/README.md`. The react-admin provider: `packages/react-admin/src` (schema, filter and sort translation, statements, records, errors, the provider), `tests/` (unit tests against the real engine through an in-process client, package, trace), `figures.json`; read `packages/react-admin/README.md`. The Phaser package: `packages/phaser/src` (the statement queue, the reply cache, the throwaway client, the version watcher), `tests/` (unit tests against the real engine, package, trace); read `packages/phaser/README.md`. Its demo: `demos/react-admin/src` (the client, the schema, the resources, the failure screens, the reset control), `scripts/make-seed.ts`, `tests/` (unit, browser); read `demos/react-admin/README.md`.

## Intended architecture (working assumptions, not yet decided by ADRs)

- **Framework-agnostic core first, thin adapters second.** The hard, valuable parts are the content → graph ingestion, embedding generation, snapshot format, and the navigation element. Each framework integration should be an adapter over that core plus a conformance check, not a reimplementation.
- **One model for both graph uses.** A read-only shared *site graph snapshot* (delivered as data and replayed into the instance; see RFC-001 §7.3) plus an ephemeral per-page overlay graph; page cells query both.
- **Navigation stays deterministic first.** Natural language → embedding search → graph expansion → focused subgraph view. A generative model is an optional layer, never required. Navigation must still expose real `<a>` links, keyboard access, and a no-JS fallback.
- **Workspace packages.** The core and each integration are packages in the pnpm workspace. An integration moves out to its own repository, as a git submodule, only when it needs its own release cadence; the engine, relate, is a published package and is no longer vendored. The core is a first-class module that adapters depend on, and a shared example site is what every adapter is checked against.

Each of these is expected to be pinned down by an ADR before implementation; treat them as direction, and check `design/adr/` for what has actually been decided.

## The engine (relate) as a dependency

Reference repo (local, separate project, read-mostly): `/Users/abk/Developer/relatedb/relate`. Consult it rather than guessing at the API; when it and this file disagree, the repo wins.

Facts relevant to web integrations, verified against that repo's docs:

- **Distributions**: only the *browser* is WASM-only. relate also ships a native Node package, `@relate/relate` (koffi over the C ABI, in `clients/javascript/`, contract in `docs/api/javascript/`), with durable local storage (WAL plus Parquet or JSON checkpoints), and can be served over HTTP or Bolt. Build-time and server integrations can use the native package; only the browser needs WASM. Native binaries are platform-specific, which matters for serverless and edge runtimes. The native build can write Parquet or JSON checkpoints (which one depends on the build and configuration), and JSON is the codec the WASM build uses. The browser build has no snapshot import, so a native checkpoint cannot be loaded there; the working route is to ship the graph as JSON and replay it through fixed statements (RFC-001 §2, §5.1; measured in SPIKE-002). Whether a direct snapshot load is worth requesting upstream is RFC-001 §7.8. The two JS APIs also differ in shape (WASM returns a JSON result envelope; the Node package has a driver-style session/result API), which the shared core has to reconcile (RFC-001 §7.9).
- **WASM package**: `@relate/relate-wasm` on npm (`wasm-bindgen --target web`). Source in `surfaces/relate-wasm/`; npm README in `surfaces/relate-wasm/npm/README.md`; contract in `docs/api/wasm/spec.md` (+ `description.md`, `examples/`).
- **Usage shape**: `await init()` then `new RelateDb()` (in-memory). `execute(query, paramsJson)` returns a JSON wire envelope string (`columns`, `rows`, `stats`, `error`, `elapsed_ms`); engine errors arrive in `error`, they do not throw. `executeScript` runs multiple statements with the engine's own runner; `renderResult` renders a result as `table` or `gram` text.
- **Bundlers** move the `.wasm` file, so pass its URL to `init` explicitly (the npm README shows the Vite `?url` import). This matters for every framework adapter.
- **Traps**: a Rust panic traps the module and the instance is unusable afterwards. Use `isWasmTrap` (from the bundled `trap.js`) and replace the instance (new worker or reload). Run queries in a Web Worker so a runaway query can be terminated.
- **Persistence**: in-memory by default. `RelateDb.open("opfs://<name>")` works only in a dedicated worker (OPFS sync access handles); snapshots use the **JSON codec** because the wasm32 build has no Parquet codec. IndexedDB and native filesystem paths are not wasm stores.
- **Vector search**: built into the engine as an exact flat scan (ADR-0256; a binary-companion pruning decision, ADR-0424, is Proposed). Expect linear cost in corpus size × dimensions, which bounds how large a site graph is comfortable in the browser, so measure before assuming scale.
- **Size**: the wasm build is size-optimized (ADR-0100); check the current artifact size when budgeting page weight.
- **Reference consumers**: `examples/wasm-playground/` (Vite + React + NVL graph visualization, runs in a worker) and the cookbook pages (`scripts/cookbook/`).

relate's own contribution rules (ADR before architectural change, docs per public surface) live in that repo's `AGENTS.md`. They apply when changing relate, not this repo. If an integration needs a relate change (new WASM API, snapshot import/export, etc.), record it as an RFC/ADR here and raise it upstream rather than patching around it.

## Design process: RFC → ADR → implementation (with spikes)

Skills live in `.agents/skills/` and are symlinked from `.claude/skills/` (same layout as the sibling `zebra-space` project they were adapted from).

- **RFC** (`design/rfc/RFC-NNN-*.md`, via `/rfc-create`; reviewed via `/rfc-review`) — the problem and why it matters, plus high-level candidate approaches. WHAT/WHY only, no implementation detail. Index and format: [design/rfc/README.md](design/rfc/README.md).
- **Spike** (`design/spikes/SPIKE-NNN-*/SPIKE.md`, via `/spike-create`) — a time-boxed, disposable investigation answering one empirical question left open by an RFC. Code and fixtures live alongside `SPIKE.md` and are kept after the spike concludes. Citing findings back into the RFC is a manual step. The existing ObservableHQ spike should be written up as `SPIKE-001` with a parent RFC. Index and format: [design/spikes/README.md](design/spikes/README.md).
- **ADR** (`design/adr/ADR-NNN-*.md`, via `/adr-create`; reviewed via `/adr-review`) — one technical decision, concrete enough to implement. Always requires at least one existing parent RFC (`rfcs:` front-matter list, set at creation and only ever grows). `/adr-create` never writes implementation code. Index and format: [design/adr/README.md](design/adr/README.md).

- **Notes** (`design/notes/YYYY-MM-DD-*.md`) — freeform, non-binding notes (explorations, naming) with no process or index. See [design/notes/README.md](design/notes/README.md). The project name is itself open; see the naming note there.

`/rfc-create` and `/adr-create` keep their `design/*/README.md` index tables in sync, and `/spike-create` does the same for spikes, so don't hand-edit those tables. Use the review skills before moving a draft toward `accepted`; they report findings and suggested revisions but don't edit the document themselves.

These skills were copied from `zebra-space`. Implementation runs through Spec Kit (`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, installed in `.specify/`). A Spec Kit specification, plan or task implements accepted ADRs, names them, and does not restate them; where they differ, the ADR wins until it is amended. Commits and PRs cite the ADR number. The project constitution is `.specify/memory/constitution.md`; every plan checks itself against it.

### First documents to write

RFCs always come first; no ADR is written until a parent RFC exists. Candidate RFCs, in order:

1. RFC-001 (drafted, [design/rfc/RFC-001-web-framework-embedding.md](design/rfc/RFC-001-web-framework-embedding.md)): embedding the engine in web frameworks — the shared core plus thin adapters, and which distribution (WASM, native Node, HTTP-served) runs in which runtime (build time, server, browser worker), including what that means for Next's serverless and edge runtimes.
2. RFC-002 (drafted, [design/rfc/RFC-002-page-graphs.md](design/rfc/RFC-002-page-graphs.md)): page graphs — per-page graphs unrelated to the site (cookbooks and notebooks, a page encoded as a graph, dashboards): where the data comes from, several graphs on a page, visitor edits and recovery, where small graphs run, and how a page graph relates to the site-wide graph.
3. RFC-003: the site graph — how content becomes a site-wide graph, and shipping it to the browser with vector embeddings (including how a user's query gets embedded).
4. RFC-004: the language-driven navigation element — primarily visual, minimal natural-language interface, not a chatbot.
5. RFC-005 (drafted, [design/rfc/RFC-005-community-integrations.md](design/rfc/RFC-005-community-integrations.md)): integrations for community projects and hackathons — runnable local-first demos by application type (admin tools, editors, visualization, games, maps), shared libraries extracted from them, slim ADRs per demo. Written before RFC-004, which keeps its number for the navigation element.
6. RFC-006 (drafted, [design/rfc/RFC-006-application-graphs.md](design/rfc/RFC-006-application-graphs.md)): application graphs — durable, visitor-written, one graph shared by a site's pages in the browser; lifecycle, migration, storage honesty, several tabs. Must come before ADR-008 (the react-admin provider) is accepted.

SPIKE-001 to SPIKE-005 (Observable, Astro build time, Astro navigation, worker hosting and faults, worker survival across navigation) are done and feed RFC-001; ADR-001 (the hosting model), ADR-002 (the graph data format) and ADR-003 (the graph descriptor) are accepted.

ADRs (snapshot format, embedding model and query-time strategy, runtime targets, and so on) follow once the relevant RFC is accepted.

## Conventions

- The repository is a pnpm workspace with the core package (`@relate/contrib-web`) as its first module, independently publishable. The core declares `@relate/relate-wasm` as a peer dependency.
- Keep documents in `design/` written for a newcomer to this repo: name project artifacts on first use rather than assuming the reader has seen sibling documents (the review skills check this).
