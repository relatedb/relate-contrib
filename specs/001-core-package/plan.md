# Implementation Plan: Core Package for Embedding the Graph Database in Web Pages

**Branch**: `001-core-package` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-core-package/spec.md`

## Summary

`related-web-core` is a framework-agnostic TypeScript library that hosts a CypherLite browser database in
a dedicated worker behind a small client. It loads graph data from the node-link document of ADR-002,
with the optional descriptor of ADR-003 that lets a page restore a stored graph without fetching the data;
it contains faults by replacing the worker (and stops after three failed attempts); and it provides the two
navigation profiles of ADR-001. It ships with validators for the document and the descriptor (usable in
Node), an example site with a conformance check, and an automated suite that runs in Chromium, Firefox and
WebKit. The approach follows the accepted ADRs; [research.md](research.md) verified the loader's mechanism
in the engine and found one point that changed ADR-002 (arrays of mixed whole and fractional numbers).

## Technical Context

**Language/Version**: TypeScript 5 (strict), ES2022 modules; Node 22 or newer for the validators and tooling (24.14.1 and pnpm 11.7.0 are installed here)

**Primary Dependencies**: none at run time. Peer dependency: `@neo4j-labs/cypherlite-wasm`. Dev dependencies: `typescript`, `vitest`, `@playwright/test`, `vite` (serves the example site), `ajv` (checks the validators against the JSON Schemas)

**Storage**: the browser's origin-private store through the engine's `opfs://` URI, one store per descriptor `id`, plus one small file per graph holding the stored copy of the descriptor (outside the engine's directory); no other persistence

**Testing**: Vitest for unit tests in Node; Playwright test runner in Chromium, Firefox and WebKit for browser tests and the conformance check; load-time baselines kept in the repository (research R4)

**Target Platform**: current desktop Chromium, Firefox and WebKit browsers; Node for `related-web-core/validate`

**Project Type**: library in a pnpm workspace, with an example site inside it for the conformance check

**Performance Goals**: spec SC-001 to SC-004 and SC-013 (main-thread stall under 50 ms during load; 5,000 pages ready in 2.1 s and 20,000 in 9.5 s; restore of 5,000 pages in 0.55 s with no request for the data; recovery within load or restore time plus 1 s)

**Constraints**: no runtime dependencies; bundler-agnostic (the worker is a URL module, the engine binary's URL is an option); never run a statement on the main thread; no data leaves the page

**Scale/Scope**: documents up to 20,000 pages and 100,000 links measured; several independent clients per page supported, cost unmeasured

## Constitution Check

*GATE: passes before research; re-checked after design (below).*

| Principle | Status | Basis in this plan |
|---|---|---|
| I. Decisions Before Code | Pass | The plan implements the accepted ADR-001, ADR-002 and ADR-003 and names them. The points that needed decision records were recorded on 2026-11-02: amendments to ADR-001 and ADR-002, and ADR-003 itself (next section). |
| II. Core First, Thin Adapters | Pass | All behavior is in `packages/core`. No adapter code. The package is independently publishable (own `package.json`, peer dependency, no reference to `vendor/`). The conformance check ships as the `./conformance` export. |
| III. The Page Works Without the Graph | Pass | The client reports `loading`, `recovering` and `failed` as data; no render depends on the instance. The failure wording is text the page chooses where to show. |
| IV. Faults Are Contained | Pass | Every client owns a worker; no main-thread instance exists. Traps, timeouts and worker errors replace the worker; `run()` gives visitor statements a timeout and `stop()`. |
| V. Specified Behavior Is Tested and Measured | Pass | Test plan per behavior in [contracts/conformance.md](contracts/conformance.md); three browsers; baselines recorded; unmeasured items labeled. |
| VI. The Engine Stays Upstream | Pass | The engine is a peer dependency, built from a pinned submodule and not modified. The one engine behavior we work around (mixed number arrays) is handled in our own encoding, not by patching the engine. |

## Decision records behind this plan

Made on 2026-11-02 while planning. The amendments and ADR-003's acceptance have been reviewed by the person
who owns the decisions; the two amendments have not been through `/adr-review`.

1. **ADR-001 amended**: the `failed` status, the three-attempt rule and `retry`; the store's staleness
   check and name now come from the descriptor; endpoint resolution no longer needs an index.
2. **ADR-002 amended**: arrays of numbers load as floats when any item is fractional; `revision` in a data
   document is only a consistency check; the loading mechanism is recorded as checked.
3. **ADR-003 accepted**: the graph descriptor, the stored copy beside the store, and the start-up decision.

Spec FR-029 says the package includes the example site and the conformance check; the plan delivers them as
the `./conformance` export of `related-web-core` (fixtures and scenario definitions) with Playwright as an
optional peer dependency for the runner, so the published tarball stays small.

## Project Structure

### Documentation (this feature)

```text
specs/001-core-package/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── client-api.md
│   ├── worker-protocol.md
│   ├── graph-data.schema.json
│   ├── graph-descriptor.schema.json
│   └── conformance.md
├── checklists/requirements.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (repository root)

```text
pnpm-workspace.yaml
package.json                      # private root: scripts, pnpm override for the engine
.gitmodules                       # vendor/cypherlite
scripts/build-wasm.sh             # builds the pinned engine into vendor/cypherlite-wasm/pkg
vendor/
├── cypherlite/                   # git submodule, pinned commit
└── cypherlite-wasm/pkg/          # build output, gitignored

packages/core/                    # related-web-core (working name)
├── package.json                  # exports ".", "./validate", "./worker", "./conformance"
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── config.ts                 # options and defaults
│   ├── client/                   # client, status machine, failure counter, subscriptions, events, scope
│   ├── worker/                   # worker entry, protocol, engine wrapper, store, stored copy, loader, encoder, sweep
│   ├── data/                     # types, validators for the data document and the descriptor
│   └── profiles/                 # persistent and per-page helpers
├── tests/
│   ├── unit/
│   ├── browser/
│   └── baselines/
└── conformance/
    ├── example-site/             # plain pages, descriptor, graph document, Vite config
    ├── scenarios.ts
    └── run.ts
```

**Structure Decision**: one pnpm workspace with a single package, `packages/core`, as the constitution
requires (core first), plus the vendored engine outside it. Adapters are future sibling packages in
`packages/`. The example site lives inside the core package so adapters can run the same check.

## Phases

- **Phase 0 (done)**: [research.md](research.md) resolves the engine API, the loading mechanism, build
  and packaging, the test stack, the stored copy and staleness, the failure rule, vendoring, events and the
  client factory.
- **Phase 1 (done)**: [data-model.md](data-model.md), [contracts/](contracts/) and
  [quickstart.md](quickstart.md).
- **Phase 2**: `/speckit-tasks` creates `tasks.md`. Suggested order: repository scaffolding (workspace,
  submodule, build script) first; then the validators and encoder (pure, Node); the worker with the loader,
  store and stored copy; the client and failure rule; the profiles; the example site and conformance check;
  baselines and the traceability table last.

## Constitution Check after design

All six principles still pass. The design adds no adapter code, no runtime dependency and no main-thread
path. The two amendments should still be reviewed with `/adr-review` before the tasks that rely on them
start.

## Constitution Check after implementation

Checked on 2026-11-02, with all 86 tasks done.

| Principle | Result |
|---|---|
| I. Decisions Before Code | Pass for the design: everything implemented follows accepted ADR-001, ADR-002 and ADR-003. One miss: the commit messages name the user story and task numbers but not the ADR numbers, which principle I asks for. The merge commit or pull request for this branch must cite ADR-001, ADR-002 and ADR-003. |
| II. Core First, Thin Adapters | Pass. All behavior is in `packages/core`; there is no adapter code. `test:package` installs the packed core in a clean project outside the repository and runs it, and the conformance check ships as the `./conformance` export. |
| III. The Page Works Without the Graph | Pass. Tests show links and the first render working before and while the graph loads, and in the `failed` state. |
| IV. Faults Are Contained | Pass. Every instance is in a worker; the main thread never instantiates the engine (tested); a trap, a timeout and a worker error each replace the worker; `run()` has a timeout and `stop()`. |
| V. Specified Behavior Is Tested and Measured | Pass. `test:trace` finds all 52 requirement and success-criterion ids tagged in tests whose results passed, in Chromium, Firefox and WebKit. Load and restore times are recorded against per-browser baselines. Unmeasured and labeled: validation cost on large documents with embeddings, the cost of reading a descriptor on every page, mobile and older browsers. |
| VI. The Engine Stays Upstream | Pass. The submodule is unmodified (`git -C vendor/cypherlite status` is clean); the engine is a peer dependency; the one engine behavior worked around (mixed number arrays) is handled in the package's own encoding. |

## Complexity Tracking

No constitution violations to justify.
