# Implementation Plan: Publishing Workflows for the Packages

**Branch**: `spec/010-release-workflows` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-release-workflows/spec.md`

## Summary

Build ADR-013 as a set of release scripts with unit tests, five GitHub workflows (a fast pull-request check, a release, an engine-release lane, and the drift check refactored onto a shared failure reporter), a recorded-change setup, a canary test file per package, and a written first-release procedure. The scripts do the thinking (fitness to publish, the engine range, the gate, the plan, the engine-release decisions); the workflows only call them, so everything but the registry and the runners is proven by unit tests in Node against fixtures.

Planning settled the open mechanics ([research.md](research.md)): how a version tag names a package, where the engine's tested releases are recorded, how the workspace names the supported engine while the engine is still vendored, how changesets behaves with pre-1.0 peers, and that packages reaching the engine only through the core do not declare an engine range (a one-sentence change to FR-006, made in the spec).

## Technical Context

**Language/Version**: TypeScript (ESM) run with `tsx`, Node 24; GitHub Actions workflows in YAML.

**Primary Dependencies**: `semver` (range checks), `@changesets/cli` (versions and changelogs), both as root dev dependencies; the GitHub CLI (`gh`) on the runners for issues and pull requests; npm 11.5.1 or later and Node 22.14 or later on the runner for trusted publishing (research R6).

**Storage**: none beyond the repository: recorded changes in `.changeset/`, the supported engine in the workspace catalog, and each tested engine release recorded as a git tag `engine-tested/<version>` (research R5).

**Testing**: Vitest in Node for the scripts (fixtures for manifests, a stand-in registry server, recorded engine releases); the packages' own unit, package and trace commands unchanged; a rehearsal run of the release workflow on a branch; a trace check tagged `covers-rel:`.

**Target Platform**: GitHub-hosted runners (Ubuntu), the public npm registry.

**Project Type**: release tooling and workflows in an existing pnpm workspace, plus test files in the existing packages.

**Performance Goals**: the pull-request check (publishability, range, tag, change-record checks and their unit tests) finishes in under two minutes and needs neither the engine nor browsers. No other figure is claimed.

**Constraints**: no change to a package's interface (FR-025); no registry credential in a rehearsal; no stored token (FR-014); a release starts only from a version tag on a protected branch (FR-015); real publishing is off until the maintainers set it on (FR-016).

**Scale/Scope**: seven packages, one core, six dependents; three workflows new, one refactored.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Decisions Before Code | ADR-013 is accepted (parent RFC-009; relates to RFC-008 and ADR-012 for the Phaser package's name and when a package moves out). The plan adds no decision the ADR lacks: where tested engine releases are recorded, the tag format and the changesets settings are mechanics inside 2.1 to 2.6, listed in research. One edit to the spec (FR-006) narrows a requirement to what the ADR says. | Pass |
| II. Core First, Thin Adapters | The release order puts the core first, and the gate enforces it. The adapters' canary files rely on the core's. | Pass |
| III. The Page Works Without the Graph | Not touched: no page behaviour changes. | Pass |
| IV. Faults Are Contained | The core's canary file pins the trap behaviour the containment depends on, so an engine change to it is caught before a release. | Pass |
| V. Specified Behavior Is Tested and Measured | Every MUST has a `covers-rel:` test (FR-026). The workflows are proven by a rehearsal run and the scripts by fixtures; no speed figure is claimed, and the two-minute target above is labelled a target. | Pass |
| VI. The Engine Stays Upstream | Nothing patches the engine. The engine's release job must send the dispatch event, which is a request to upstream, recorded here and in the quickstart; the hourly look covers it until then. | Pass |

No violations; the Complexity Tracking table is empty.

*Re-check after design*: the contracts add no dependency beyond the two dev dependencies and the runner's tools. Still a pass.

## Project Structure

### Documentation (this feature)

```text
specs/010-release-workflows/
├── plan.md              # This file
├── research.md          # Phase 0: facts found and the mechanics settled
├── data-model.md        # Phase 1: the entities and their rules
├── quickstart.md        # Phase 1: how to run each check and rehearse a release
├── contracts/
│   ├── scripts.md       # the command line of each release script
│   └── workflows.md     # triggers, inputs, jobs, secrets and environments of each workflow
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code

```text
scripts/release/                     # new: the release scripts (TypeScript, run with tsx)
├── lib/
│   ├── workspace.ts                 #   read the workspace's packages, in dependency order
│   ├── ranges.ts                    #   parse and compare engine and package ranges (semver)
│   └── registry.ts                  #   ask the registry (base address injectable)
├── check-publishable.ts             #   FR-001 to FR-005
├── check-engine-range.ts            #   FR-006 to FR-008
├── check-changes.ts                 #   FR-013, and no version reaching 1.0 by accident
├── release-gate.ts                  #   FR-009 to FR-011
├── plan-release.ts                  #   FR-011, FR-014, FR-016: the ordered list, in rehearsal or for real
├── parse-tag.ts                     #   FR-015, FR-028: a version tag to a package and a version
├── engine-releases.ts               #   FR-018, FR-021: which engine releases are untested
├── use-engine.ts                    #   point a checkout at an engine release from the registry
├── raise-engine-range.ts            #   FR-019: raise NEWEST, write the recorded change
├── engine-run-report.ts             #   FR-020: the issue text from a run's results
├── tests/                           #   unit tests, fixtures (manifests, a stand-in registry, recorded engine releases)
└── trace/check-trace.ts             #   covers-rel tags (FR-026)

.github/
├── actions/
│   ├── setup/action.yml             #   changed: a choice of engine from the submodule or the registry
│   └── report-failure/action.yml    #   new: the issue mechanism drift has, as a shared step (FR-020)
└── workflows/
    ├── release-checks.yml           #   new: the fast checks on pull requests and main (FR-022)
    ├── release.yml                  #   new: rehearsal, and release on a version tag (FR-014 to FR-017, FR-028)
    ├── engine-release.yml           #   new: the engine-release lane (FR-018 to FR-021, FR-027)
    ├── drift.yml                    #   changed: uses report-failure
    └── full.yml                     #   changed: adds the release checks to test:all

.changeset/                          # new: config.json, README.md, and the recorded changes
LICENSE                              # new: Apache-2.0
packages/*/LICENSE                   # new: a copy in each released package
packages/*/tests/unit/engine-assumptions.test.ts   # new in six packages (the data provider's exists), FR-023, FR-024
docs/releasing.md                    # new: the first-release procedure, the tag rule, the environments (FR-028, FR-029)
pnpm-workspace.yaml                  # changed: a catalog entry for the supported engine
package.json                         # changed: scripts release:*, test:release*, dev dependencies
CLAUDE.md                            # changed: commands and layout
```

**Structure Decision**: release tooling goes in a new top-level `scripts/release/` (the repository already keeps its build script in `scripts/`), tested with Vitest like the packages; workflows go in `.github/workflows` beside the existing two; documentation of the procedure goes in a new `docs/` folder, since it is for maintainers and is not a design document. Each package keeps its own canary test file in its own `tests/unit/`.

## Complexity Tracking

No violations to justify.
