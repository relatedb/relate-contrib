# relate-contrib Constitution

## Core Principles

### I. Decisions Before Code
Architecture is decided in a written, reviewed decision before it is implemented. A new capability
starts as an RFC (the problem), is settled by an ADR (one decision) and is implemented from an
accepted ADR; an open empirical question is answered by a spike. Every specification, plan and task
MUST name the accepted ADRs it implements, and MUST stop and propose an RFC or ADR when it needs an
architectural decision that none provides. A commit or pull request that implements a decision MUST
cite its ADR number.

Rationale: the hosting model, the data format and the fault rules each took a spike to learn, and a
feature branch is the wrong place to decide them again.

### II. Core First, Thin Adapters
Behavior that does not depend on a particular framework lives in the shared core package: instance
hosting, fault handling, graph loading and data validation. A framework adapter only wires the core
into that framework's build and rendering, and MUST NOT make its own decisions about instance
lifetime, fault handling or data delivery. The core MUST be independently publishable and MUST NOT
depend on this repository's layout. Every adapter MUST pass the same conformance check against the
shared example site.

Rationale: with five target frameworks, behavior that lives in an adapter diverges.

### III. The Page Works Without the Graph
A page's first render MUST NOT depend on the database instance. Navigation MUST be real links that
work from the keyboard and with scripts disabled. While the instance is loading, recovering or has
failed, the page's text and links MUST remain usable and any graph-driven region MUST show a
placeholder or a message, never a blank or broken region. Graph and natural-language features
enhance deterministic navigation; a generative model MUST NOT be required for any feature.

Rationale: the navigation element is search and navigation, not a chatbot, and a component that
read the instance during its first render produced a measured hydration mismatch.

### IV. Faults Are Contained
Instances run in a dedicated worker driven by the core's client, unless an accepted ADR allows an
exception; an instance on the main thread MUST NOT run visitor-supplied statements. A trapped
instance, a timed-out statement or a worker error is handled by replacing the instance, not by
reloading the page. Every visitor-supplied statement MUST have a timeout or a visible stop control.

Rationale: a trapped browser instance is unusable afterwards, and a runaway statement can only be
stopped by terminating the worker that runs it.

### V. Specified Behavior Is Tested and Measured
Every behavior that an accepted ADR or a specification states with MUST has an automated test,
including the fault and recovery paths (a trap, a timeout, a locked store, a stale store). A claim
about speed, size, memory or browser support MUST carry a recorded measurement (method, environment
and figures) or be labeled unmeasured wherever it appears. Figures from a single run in one
environment MUST be labeled as such.

Rationale: the staleness check, the start-up sweep and the bounded retry are specified and not yet
measured, and vector search cost grows with corpus size and dimensions.

### VI. The Engine Stays Upstream
The engine (relate) is used through its package interface. When it lacks something an integration needs (a
new API, snapshot import), the need is recorded as an RFC or ADR here and raised with its
maintainers; the repository MUST NOT patch around it by copying engine internals. The engine's name
is not settled, so documents say "the engine" or "the embedded graph" and use its current name only
where it names a real identifier (a package, an API, a path).

Rationale: the engine has its own contribution rules, and a rename should stay a global replace.

## Technical Constraints

- The repository is a pnpm workspace; the core package is its first module.
- The project is `relate-contrib` and the packages are `@relate/contrib-web`, `@relate/contrib-astro` and `@relate/contrib-nextjs` (renamed 2026-11-08; earlier `relate-web` with `@relate/web-core`, `@relate/web-astro` and `@relate/web-next`, and before that `related-web`), chosen to match the engine's
  announced new name, `relate` (see `design/notes/2026-11-02-project-name.md`). The internal prefix is `rel-`
  (`data-rel-*` attributes, `rel-<id>` store names, `REL_*` environment values), adopted 2026-11-05 in place of
  `gw-`.
- The browser engine is consumed as `@relate/relate-wasm`. Until it is published, a build
  from a pinned checkout is vendored in; the core declares the package as a peer dependency and
  MUST NOT reference the vendored path.
- Query results are passed through as the engine's JSON envelope, unaltered, until a decision on
  result shape replaces this.
- Graph data enters as a node-link JSON document as defined in ADR-002.
- A graph may carry a descriptor as defined in ADR-003; using a store requires one.
- Hosting follows ADR-001: a dedicated worker with two configurable navigation profiles,
  `client-routing` and `multi-page`.
- Adapters are packages in the same workspace. An adapter moves to its own repository, as a git
  submodule, only when it needs its own release cadence.

## Development Workflow

- All work happens on a branch; `main` receives reviewed work only.
- `/rfc-review` MUST be run before an RFC is accepted and `/adr-review` before an ADR is accepted.
- Implementation features follow Spec Kit: specify, plan, tasks, implement. These artifacts
  implement accepted ADRs and do not restate them; where they differ from an accepted ADR, the ADR
  wins until it is amended.
- Design documents and specifications are written for an engineer new to the repository: name an
  artifact on first use, argue from evidence, and state trade-offs plainly.
- A spike's code and fixtures are kept after it concludes, and its findings are cited into the RFC
  by hand.

## Governance

This constitution governs how decisions are made and which principles bind them, and it supersedes
plans, specifications and tasks. Accepted ADRs govern the technical decisions inside it; a conflict
between the two is resolved by amending one of them in an explicit change.

Amendments are proposed on a branch, include an updated version line and Sync Impact Report, and are
reviewed before merging. The version follows semantic versioning: MAJOR for removing or redefining a
principle in a backward-incompatible way, MINOR for adding a principle or materially expanding one,
PATCH for clarifications and wording.

Every plan MUST include a Constitution Check against principles I to VI, and a violation MUST be
justified in writing in the plan. Reviewers verify compliance. Runtime guidance for agents is in
`CLAUDE.md`.

**Version**: 1.1.3 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-03
