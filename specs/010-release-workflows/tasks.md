---
description: "Task list for the publishing workflows (ADR-013)"
---

# Tasks: Publishing Workflows for the Packages

**Input**: Design documents from `/specs/010-release-workflows/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scripts.md, contracts/workflows.md, quickstart.md. Implements ADR-013 (accepted 2026-11-19, parent RFC-009). Decisions R1 to R12 are in research.md.

**Tests**: Required. The specification and the constitution (principle V) require an automated test for every MUST, so each story starts with tests that fail before the implementation. Tag every test with a `// covers-rel: FR-…, SC-…` comment naming the requirements it checks.

**Organization**: Tasks are grouped by user story. US1 to US3 are P1 and are the scripts the rest depend on; US4 to US7 are P2; US8 is P3. The release scripts are in `scripts/release/`; the workflows are thin and call them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story (US1 to US8) from spec.md
- Paths are relative to the repository root. No task changes a package's interface or behaviour (FR-025): package changes are limited to manifests, LICENSE files and test files.
- Use `bash` for `.specify` scripts; they fail under `sh`.
- Citations such as "data-model.md `Engine range`" point at the entity whose rules the task implements.
- A finding that changes ADR-013 is written into it as a dated amendment in the task that finds it.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The scripts' project, its dependencies, its test setup and its trace check

- [X] T001 Add `semver`, `yaml` and `@changesets/cli` (with their types where needed) as root development dependencies in `package.json`, and run `pnpm install`
- [X] T002 Create `scripts/release/tsconfig.json` (extending `tsconfig.base.json`, Node types, `noEmit`) and `scripts/release/vitest.config.ts` (`include` `scripts/release/tests/**/*.test.ts`, Node environment, JSON report to `scripts/release/reports/vitest.json`)
- [X] T003 Add the root scripts to `package.json`: `release:check-publishable`, `release:check-engine-range`, `release:check-changes`, `release:gate`, `release:plan`, `test:release` (Vitest over `scripts/release`), `test:release-trace`, and `test:engine-assumptions` (each package's `engine-assumptions` test, filtered), each running the matching `tsx scripts/release/<name>.ts` (contracts/scripts.md)
- [X] T004 [P] Create `scripts/release/trace/check-trace.ts`, modelled on `packages/phaser/tests/trace/check-trace.ts`: read `specs/010-release-workflows/spec.md` for `**FR-nnn**` and `**SC-nnn**`, read `// covers-rel:` tags from `scripts/release/tests` and the packages' `tests/unit/engine-assumptions.test.ts` files, and require the tagged files to pass in `scripts/release/reports/vitest.json` and the packages' `reports/vitest.json` (FR-026)

---

## Phase 2: Foundational

**Purpose**: The shared library every script uses. **⚠️ CRITICAL**: no story work begins until it exists.

- [X] T005 Create `scripts/release/lib/workspace.ts`: read `pnpm-workspace.yaml` and the packages' manifests (the seven under `packages/` that are not conformance sites), return them with their folder and manifest, and order them for a release (the core, `@relate/contrib-web`, first, then the others by name) (FR-011; data-model.md `Release plan`)
- [X] T006 [P] Create `scripts/release/lib/ranges.ts`: parse a range of the form `>=OLDEST <=NEWEST`, test whether it includes a version, and report why a range is not of that form, using `semver` (data-model.md `Engine range`)
- [X] T007 [P] Create `scripts/release/lib/registry.ts`: ask a registry for a package's versions and report `unreachable` distinctly from `absent`, with the base address a parameter (default the public registry; research R3 and spec FR-010)
- [X] T008 Create `scripts/release/tests/helpers/stand-in-registry.ts`: a small local HTTP server that answers like the registry from a table of packages and versions, can be made to fail or be slow, and returns its address, for the gate and the lane tests
- [X] T009 [P] Create `scripts/release/tests/helpers/fixture-workspace.ts`: write a scratch workspace in a temporary folder (several packages with manifests, a catalog entry, a LICENSE) that a test can then break one item at a time

**Checkpoint**: the library and its test helpers exist; the story scripts can be built on them.

---

## Phase 3: User Story 1 - A package can be checked for fitness to publish (Priority: P1) 🎯 MVP

**Goal**: One check names what each package lacks before it can be published.

**Independent Test**: run the check on the real packages and on fixture manifests, each missing one item.

### Tests

- [X] T010 [US1] Create `scripts/release/tests/check-publishable.test.ts` (`// covers-rel: FR-001, FR-002, FR-003, FR-004, FR-005, SC-001`): a complete fixture package passes; each of the license, repository with folder, homepage, keywords and public publish setting missing in turn fails and the message names the package and the item; a `files` list with more than the build output, the README and the license fails; the core's optional test-tool peer fails; `private` fails with `--release` and is reported `unreleased` and passes without it; a missing root or package LICENSE fails; a name that is not `@relate/contrib-<project>` fails (data-model.md `Package manifest`; contracts/scripts.md `check-publishable`)

### Implementation

- [X] T011 [US1] Create `scripts/release/check-publishable.ts` implementing the rules of data-model.md `Package manifest` for each package from `lib/workspace.ts`, with `--release`, `--package` and `--json` (contracts/scripts.md `check-publishable`)
- [X] T012 [P] [US1] Create `LICENSE` at the repository root with the Apache License 2.0 text, and copy it to `packages/web/LICENSE`, `packages/astro/LICENSE`, `packages/nextjs/LICENSE`, `packages/observable/LICENSE`, `packages/sveltekit/LICENSE`, `packages/react-admin/LICENSE` and `packages/phaser/LICENSE` (FR-004)
- [X] T013 [US1] Edit the seven `packages/*/package.json` files: add `"license": "Apache-2.0"`, `repository` (`type` `git`, `url` `https://github.com/relatedb/relate-contrib`, `directory` the package's folder), `homepage` (the package's folder on the repository), `keywords`, `publishConfig` with `access` `public`, and `files` limited to `dist`, `README.md` and `LICENSE` (the Observable adapter and the SvelteKit package list their own build output as before); leave `private` true, since it is removed at release time (spec FR-003); remove the optional `@playwright/test` peer and its `peerDependenciesMeta` entry from `packages/web/package.json` (FR-002; data-model.md `Package manifest`)
- [X] T014 [US1] Run `pnpm release:check-publishable` and `pnpm release:check-publishable --release`: the first passes with every package reported `unreleased`, the second fails only on `private`; run `pnpm -r build` and `pnpm test:units` to confirm the manifest edits changed no behaviour

**Checkpoint**: the fitness check is proven on fixtures and passes on the real packages, which stay private.

---

## Phase 4: User Story 2 - Each package states the engine it supports, in one place (Priority: P1)

**Goal**: A declared engine range per package, one supported engine for the workspace, and a check that they agree.

**Independent Test**: run the range check on the real packages and on fixtures with a range that omits the supported engine, an "any version" range and a malformed range.

### Tests

- [X] T015 [US2] Create `scripts/release/tests/check-engine-range.test.ts` (`// covers-rel: FR-006, FR-007, FR-008, SC-002`): a consistent fixture passes; a range omitting the supported engine fails naming the package, its range and the engine version; a peer at `*` fails; a malformed range fails and says the expected form; an engine peer declared by a package that reaches the engine only through the core fails; a catalog version that differs from the vendored engine package's version fails (data-model.md `Engine range`, `Supported engine`; research R1, R2; contracts/scripts.md `check-engine-range`)

### Implementation

- [X] T016 [US2] Create `scripts/release/check-engine-range.ts` implementing the rules of data-model.md `Engine range` and `Supported engine` and the peer window rule of `Peer window on the core`, with the five packages that load the engine (the core and the four adapters) and the two that do not named in one list in the script (contracts/scripts.md `check-engine-range`)
- [X] T017 [US2] Add a `catalog:` section to `pnpm-workspace.yaml` with `"@relate/relate-wasm": 0.16.1` (the vendored engine package's version), keeping the override that links the vendored build, and make the five engine-loading packages' development dependency on the engine `catalog:` (research R1)
- [X] T018 [US2] In `packages/web/package.json`, `packages/astro/package.json`, `packages/nextjs/package.json`, `packages/observable/package.json` and `packages/sveltekit/package.json`, replace the `@relate/relate-wasm` peer `*` with `>=0.16.1 <=0.16.1`; in the six packages that peer on the core, replace the `@relate/contrib-web` peer `*` with `>=0.0.0 <1.0.0` and keep a `workspace:*` development dependency on it (research R2, R3; data-model.md `Engine range`, `Peer window on the core`)
- [X] T019 [US2] Run `pnpm install`, `pnpm release:check-engine-range`, `pnpm -r build` and `pnpm test:units`; then `pnpm pack` one dependent (for example `packages/phaser`) in a scratch folder and confirm the tarball's manifest carries the peer ranges as written, not `*` or a workspace marker (research R3)

**Checkpoint**: every package's engine support is one stated range, checked against one supported engine.

---

## Phase 5: User Story 3 - An unsafe release is refused (Priority: P1)

**Goal**: A gate that refuses a package whose peers are not published or whose range is not real.

**Independent Test**: run the gate against the stand-in registry and fixtures.

### Tests

- [X] T020 [US3] Create `scripts/release/tests/release-gate.test.ts` (`// covers-rel: FR-009, FR-010, FR-011, SC-003`): with the stand-in registry, a dependent passes when the core is published at a version its window accepts; refuses with `peer-not-published` naming the core when it is absent; refuses with `peer-out-of-range` naming the versions found; refuses with `engine-range-invalid` for `*`; refuses with `version-exists` when the version is already published; refuses with `registry-unreachable` when the registry fails, not treating the package as published or absent; refuses with `first-release-is-manual` for a package not on the registry; and for the core and its dependents in one plan the core is judged first (data-model.md `Gate verdict`; contracts/scripts.md `release-gate`)

### Implementation

- [X] T021 [US3] Create `scripts/release/release-gate.ts` implementing data-model.md `Gate verdict` for one package and planned version, using `lib/workspace.ts`, `lib/ranges.ts` and `lib/registry.ts`, with `--package`, `--registry`, `--version` and `--json` (contracts/scripts.md `release-gate`)
- [X] T022 [US3] Run `pnpm release:gate --package @relate/contrib-phaser --registry <stand-in address>` by hand against the stand-in registry from T008 (started by a small script in the test helper) and against the public registry: expect `peer-not-published` and `first-release-is-manual` today, since nothing is published

**Checkpoint**: the gate refuses the unsafe cases and passes the safe one, on a stand-in for the registry.

---

## Phase 6: User Story 4 - A release can be rehearsed from end to end (Priority: P2)

**Goal**: A release workflow that rehearses safely, starts a real release only from a protected version tag, and a written first-release procedure.

**Independent Test**: start the workflow in rehearsal mode on a branch and read its report; break one check and confirm it stops there.

### Tests

- [X] T023 [US4] Create `scripts/release/tests/plan-release.test.ts` (`// covers-rel: FR-011, FR-014, FR-016, SC-004`): the plan lists the packages whose version is not on the registry in dependency order with the core first; each carries its gate verdict; in rehearsal mode the plan states that no credential is used; a package already published is left out (data-model.md `Release plan`; contracts/scripts.md `plan-release`)
- [X] T024 [P] [US4] Create `scripts/release/tests/parse-tag.test.ts` (`// covers-rel: FR-015, FR-028`): `@relate/contrib-web@0.1.0` parses to the package and version; a tag naming a package that does not exist, a version that differs from the manifest at that commit, or a commit not on the given branch's history fails; a tag that does not match the `<package name>@<version>` form fails (data-model.md `Version tag`; research R7; contracts/scripts.md `parse-tag`)
- [X] T025 [US4] Create `scripts/release/tests/workflows.test.ts` (`// covers-rel: FR-014, FR-015, FR-016, FR-017, FR-027, FR-028`): parse `.github/workflows/release.yml` with the `yaml` package and assert that it starts only from a tag matching `@relate/contrib-*@*` or a manual start; the manual start path has no `id-token` permission and no environment; the `publish` job needs the `resolve`, `checks` and `gate` jobs, names the environment `npm-publish`, has `id-token: write` and no token secret, and runs only when `PUBLISHING_ENABLED` is `true`; concurrency does not cancel a running release (contracts/workflows.md `release`)

### Implementation

- [X] T026 [US4] Create `scripts/release/plan-release.ts` implementing data-model.md `Release plan` with `--package`, `--all`, `--registry`, `--rehearsal` and `--json`, using `release-gate` for each verdict (contracts/scripts.md `plan-release`)
- [X] T027 [P] [US4] Create `scripts/release/parse-tag.ts` implementing data-model.md `Version tag` with `--branch`, using `git merge-base --is-ancestor` for the branch check (contracts/scripts.md `parse-tag`)
- [X] T028 [US4] Create `.github/workflows/release.yml` per contracts/workflows.md `release`: the jobs `resolve`, `checks`, `gate` and `publish`; the tag trigger and the manual start; the rehearsal path; `concurrency` with `cancel-in-progress: false`; the npm version check (11.5.1 or later) before publishing; `pnpm pack` then `npm publish` of the tarball with public access and no token; a report of what was and was not published when a step fails (FR-014 to FR-017; research R6, R8)
- [X] T029 [US4] Create `docs/releasing.md`: the order of releases (the core first); the first release of a package by hand, step by step (the checks to run, building and packing, publishing as an administrator of the `@relate` scope, then adding the package's trusted publisher: this repository, the workflow file `release.yml`, the environment `npm-publish`); the later release by pushing the tag `<package name>@<version>` on a protected branch; and every setting that is not a file, with how to set each: the branch protection rule on the main branch, the tag ruleset on the `@relate/contrib-*@*` pattern, the environments `npm-publish` and `engine-release-approval` with their reviewers, and the repository variable `PUBLISHING_ENABLED` (FR-028, FR-029; contracts/workflows.md "Settings that are not files")
- [X] T030 [US4] Run `pnpm release:plan --all --rehearsal` and check that its output lists the seven packages with the core first and each dependent refused with `peer-not-published`; note in `docs/releasing.md` that the host-side rehearsal (starting `release` by hand for `all`) is run by a maintainer once the branch is pushed, and record its result under SC-004 in the pull request (still to be done by a maintainer: it needs the branch pushed to GitHub)

**Checkpoint**: a release can be rehearsed and cannot publish by accident; the procedure for the first releases is written.

---

## Phase 7: User Story 5 - Versions and changelogs come from recorded changes (Priority: P2)

**Goal**: Independent versions and changelogs from small recorded changes, with nothing reaching 1.0 by accident.

**Independent Test**: record changes for two packages and propose the version change; record none for a third.

### Tests

- [X] T031 [US5] Create `scripts/release/tests/check-changes.test.ts` (`// covers-rel: FR-012, FR-013`): in a scratch git repository from the fixture workspace, a change to a package's published files with no recorded change warns (and fails with `--strict`); a recorded change naming a package that does not exist fails; a recorded change or version change that would take a package to `1.0.0` fails unless the package is in the allow list of `.changeset/config.json` (data-model.md `Recorded change`; research R4; contracts/scripts.md `check-changes`)
- [X] T032 [US5] Create `scripts/release/tests/changesets.test.ts` (`// covers-rel: FR-012, SC-005`): in a scratch workspace of three packages (a core, a dependent with a peer window on it, and an unrelated one) with the repository's `.changeset/config.json`, record changes for two packages, run `changeset version`, and assert that exactly those two packages' versions move and each changelog has an entry, that the unrelated package is untouched, that the dependent's declared dependency on a moved package is updated, and that a core minor does not take the dependent to a new major (research R4)

### Implementation

- [X] T033 [US5] Create `.changeset/config.json` (access `public`, base branch `main`, updating internal dependencies at patch, the option to update peer dependents only when out of range turned on, private packages versioned; the allow list for a move to 1.0 is the separate file `.changeset/allow-1.0.json`, empty) and `.changeset/README.md` saying how to record a change and that a move to 1.0 is the maintainers' judgement (research R4; FR-012)
- [X] T034 [US5] Create `scripts/release/check-changes.ts` implementing data-model.md `Recorded change` with `--base`, `--strict` and `--json`, reading `.changeset/*.md` and `git diff` against the base (contracts/scripts.md `check-changes`)
- [X] T035 [US5] Add the root scripts `changeset` and `version-packages` (`changeset version`) to `package.json`, and run `pnpm changeset status` to confirm the setup reads; no first recorded change is written, since each package's first release is made by hand at the version in its manifest (docs/releasing.md)

**Checkpoint**: versions and changelogs come from recorded changes, and a core minor does not push a dependent to 1.0.

---

## Phase 8: User Story 6 - Every engine release is tested, and it releases or reports (Priority: P2)

**Goal**: A per-release run against a new engine release that, behind an approval gate, raises ranges and proposes a release, or reports an issue.

**Independent Test**: start the lane's logic with a recorded engine release whose tests pass, then one whose tests fail, then a release already tested.

### Tests

- [X] T036 [US6] Create `scripts/release/tests/engine-releases.test.ts` (`// covers-rel: FR-018, FR-021, SC-006`): from a table of registry versions and a list of `engine-tested/<version>` tags, the untested releases come out oldest first; a prerelease or deprecated release is left out; a release already tested is left out however many times it is signalled; two untested releases come out in order, each once (data-model.md `Engine release`; research R5; contracts/scripts.md `engine-releases`)
- [X] T037 [P] [US6] Create `scripts/release/tests/raise-engine-range.test.ts` (`// covers-rel: FR-019, FR-012, SC-006`): for a recorded release, each named package that declares an engine range has `NEWEST` raised and gets a recorded change (`patch`, "Supports engine <version>"); a package that failed is left alone; a package already at or above the version is reported and left alone; a prerelease, a version below `NEWEST` and a version that is not an engine release are refused (data-model.md `Engine range`, `Engine run result`; contracts/scripts.md `raise-engine-range`)
- [X] T038 [P] [US6] Create `scripts/release/tests/engine-run-report.test.ts` (`// covers-rel: FR-020, SC-006`): from a results file the title is `Engine release <version> breaks packages` and the body names the run's address, the engine release and each failing package's failing test titles; a run with no failure produces no report (data-model.md `Engine run result`; contracts/scripts.md `engine-run-report`)
- [X] T039 [US6] Create `scripts/release/tests/engine-lane.test.ts` (`// covers-rel: FR-018, FR-019, FR-020, FR-021, FR-027, SC-006`): drive `engine-releases`, `use-engine`, `raise-engine-range` and `engine-run-report` together over recorded engine releases (fixtures in `scripts/release/tests/fixtures/engine-releases/`) for a pass, a fail, a release already tested, two at once, a prerelease, and a package already at the release; and parse `.github/workflows/engine-release.yml` to assert it starts from a repository dispatch of type `engine-release`, an hourly schedule and a manual start, that its `propose` job names the environment `engine-release-approval` and needs the test job, and that its `report` job runs only on failure (data-model.md `Engine run result`; contracts/workflows.md `engine-release`)

### Implementation

- [X] T040 [US6] Create `scripts/release/engine-releases.ts` per contracts/scripts.md `engine-releases`: list the registry's engine versions, read the `engine-tested/*` tags from git or a file, and print the untested non-prerelease non-deprecated releases oldest first (data-model.md `Engine release`; research R5)
- [X] T041 [P] [US6] Create `scripts/release/use-engine.ts` per contracts/scripts.md `use-engine`: remove the override that links the vendored build from `pnpm-workspace.yaml` and set the catalog's `@relate/relate-wasm` to the version, in the working tree only (research R11)
- [X] T042 [P] [US6] Create `scripts/release/raise-engine-range.ts` per contracts/scripts.md `raise-engine-range`: raise `NEWEST` in the named packages' engine peer range and write a recorded change into `.changeset/` for each (data-model.md `Engine range`, `Recorded change`)
- [X] T043 [P] [US6] Create `scripts/release/engine-run-report.ts` per contracts/scripts.md `engine-run-report`
- [X] T044 [US6] Create `.github/actions/report-failure/action.yml` per contracts/workflows.md "The shared reporter": inputs `title`, `label`, `color`, `description` and `body`; create the label if missing, comment on the open issue with that label and title, or open one (moving the logic from the inline step of `.github/workflows/drift.yml`; research R10)
- [X] T045 [US6] Change `.github/workflows/drift.yml` to call `./.github/actions/report-failure` in place of its inline issue step, with the same title (`Drift check failed on main`), label and body, so its behaviour is unchanged (contracts/workflows.md `drift`)
- [X] T046 [US6] Change `.github/actions/setup/action.yml`: add an input `engine-source` (`submodule` by default, or `registry`); for `registry` skip the submodule, the Rust toolchain and the engine build, and run `use-engine <version>` before installing, with an input `engine-version` (research R11)
- [X] T047 [US6] Create `.github/workflows/engine-release.yml` per contracts/workflows.md `engine-release`: the dispatch, the hourly schedule and the manual start; the jobs `discover`, `test` (the setup action with the registry as the engine's source, then every package's unit tests, canary tests, conformance checks and the drift check, a results file, and the tag `engine-tested/<version>`), `report` (on failure, the shared reporter with the title and body of `engine-run-report`, under the label `engine-release`) and `propose` (environment `engine-release-approval`; `raise-engine-range`; a pull request with the recorded changes) (FR-018 to FR-021, FR-027)
- [X] T048 [US6] Add to `docs/releasing.md` the engine-release lane: the dispatch event the engine's release job should send (type `engine-release`, the version in its payload), that the hourly look is the fallback, how the approval environment is set, and what an issue titled `Engine release <version> breaks packages` means (FR-027; quickstart "When the engine is published")

**Checkpoint**: the lane's decisions are proven on recorded engine releases, and the workflow is wired to them and to the approval gate.

---

## Phase 9: User Story 7 - Each package pins the engine behaviours it relies on (Priority: P2)

**Goal**: A test file per package that names the engine behaviours it relies on.

**Independent Test**: run each package's file against the supported engine; simulate an engine change and see a test name the behaviour.

### Tests

- [X] T049 [US7] Create `packages/web/tests/unit/engine-assumptions.test.ts` (`// covers-rel: FR-023, FR-024, SC-007`): against the in-process engine in Node, with a title for each behaviour: the result envelope's shape (columns, rows, error); an engine error arrives in the envelope and does not throw; a trapped instance (a statement with about a thousand nested parentheses) is unusable afterwards and the trap is recognised; the constraints and parameter handling the core uses; and a title naming the existing application-graph browser tests as the check for the origin-private store (research R12)
- [X] T050 [P] [US7] Create `packages/phaser/tests/unit/engine-assumptions.test.ts` (`// covers-rel: FR-023, FR-024`): the result envelope shape the queue depends on (an engine error in `error`, rows as objects), against the in-process engine helper in `packages/phaser/tests/helpers/engine.ts`
- [X] T051 [P] [US7] Tag `packages/react-admin/tests/unit/engine-assumptions.test.ts` with `// covers-rel: FR-023` beside its existing tag, keeping its checks and its place, and confirm it names its behaviours in its test titles (FR-023)
- [X] T052 [P] [US7] Create `packages/astro/tests/unit/engine-assumptions.test.ts`, `packages/nextjs/tests/unit/engine-assumptions.test.ts`, `packages/observable/tests/unit/engine-assumptions.test.ts` and `packages/sveltekit/tests/unit/engine-assumptions.test.ts` (`// covers-rel: FR-023`), each stating in a test title that the adapter relies on the core's `engine-assumptions` file, checking that `packages/web/tests/unit/engine-assumptions.test.ts` exists and that its test titles name the behaviours the adapter relies on (the envelope shape, and engine errors in the result), as the Observable adapter's `scope.test.ts` checks its own scope (FR-023)

### Implementation

- [X] T053 [US7] Run `pnpm test:engine-assumptions` against the supported engine and confirm every file passes; then, in a scratch copy, change one fixture or assumption in the core's file to simulate an engine change and confirm the failing test's title names the behaviour, for each of three behaviours (SC-007)

**Checkpoint**: each package pins the engine behaviours it relies on, and a change to one names itself.

---

## Phase 10: User Story 8 - The repository's own checks gate merges and releases (Priority: P3)

**Goal**: The new checks run on every pull request and in the existing full run.

**Independent Test**: open a change that breaks one of the new checks and confirm the gate fails.

### Tests

- [X] T054 [US8] Create `scripts/release/tests/gate-wiring.test.ts` (`// covers-rel: FR-022`): parse `.github/workflows/release-checks.yml` and assert it starts on pull requests and pushes to the main branch, runs `check-publishable`, `check-engine-range`, `check-changes` and the scripts' unit tests, needs no engine, no browsers and no secrets and has read-only contents; parse `.github/workflows/full.yml` and assert it still runs on main and nightly and that `test:all` includes `test:release`; parse `engine-release.yml` and assert no workflow that gates merges depends on it (contracts/workflows.md `release-checks`, `full`)

### Implementation

- [X] T055 [US8] Create `.github/workflows/release-checks.yml` per contracts/workflows.md `release-checks`: pull requests and pushes to main; install, `release:check-publishable`, `release:check-engine-range`, `release:check-changes` and `test:release`; the release scripts' trace check on main (FR-022)
- [X] T056 [US8] Add `test:release` and `test:release-trace` to the aggregate scripts `test:units` and `test:traces-all` in `package.json`, so `.github/workflows/full.yml`'s `test:all` runs them; add the commands and the new folders to `CLAUDE.md` (FR-022, FR-026)

**Checkpoint**: the new checks run on every pull request and in the full run, and the engine-release lane gates nothing.

---

## Phase 11: Polish and Cross-Cutting Concerns

- [X] T057 [P] Add dated amendments to `design/adr/ADR-013-release-process-and-engine-sync.md` for anything the work finds (a research item that proved wrong, a command that behaved differently), or note in the pull request that there were none
- [X] T058 [P] Update `design/rfc/RFC-009-publishing-and-engine-sync.md` status note if the work settles any open question, and leave 7.1 and 7.2 open
- [X] T059 Run `pnpm test:release-trace` and fix any requirement or success criterion without a passing, tagged test (FR-026, SC-008)
- [X] T060 Run the whole set once: `pnpm -r build`, `pnpm test:release`, `pnpm test:units`, `pnpm release:check-publishable`, `pnpm release:check-engine-range`, `pnpm release:plan --all --rehearsal`, `pnpm test:engine-assumptions`; follow `quickstart.md`; and confirm the clean-install package checks still pass for all seven packages (`pnpm test:packages-all`), since the manifests changed
- [X] T061 Set the spec's `**Status**` to Implemented, and cite ADR-013 in the commit or pull request text

---

## Dependencies and Execution Order

- Phase 1 first, then Phase 2. US1, US2 and US3 each need Phase 2; US2 needs the manifests US1 edits to be settled (T013 before T018), and US3 needs US2's peer windows and ranges. US4 needs US3 (the gate) and US1 (`check-publishable --release`). US5 needs only Phase 2 and can run beside US1 to US3. US6 needs US2 (ranges) and US5 (recorded changes). US7 needs nothing but the engine and can run beside any story. US8 needs the scripts and workflows it wires. Polish last.
- [P] tasks within a phase touch different files: T006, T007 and T009 in Phase 2; T012 and T013's package files in US1; T024 and T027 in US4; T037, T038, T041, T042 and T043 in US6; T050, T051 and T052 in US7.

### Parallel example

After Phase 2: run T010 and T015 together (different test files), then T011 and T016 together, while T031 (US5 tests) and T049 to T052 (US7 canaries) proceed on their own.

## Implementation Strategy

- **MVP**: US1 to US3, which is the three checks and their proofs on stand-ins: fitness, the engine range and the gate. They make the packages ready to publish and refuse an unsafe release, and need no engine and no registry access.
- Then US4 (the rehearsal workflow and the first-release procedure, which an administrator can follow for the first manual releases), US5 (changesets), US6 and US7 (the engine-release lane and its canaries), then US8.
- Real publishing stays off throughout: nothing here sets `PUBLISHING_ENABLED`, removes `private` from a package, or publishes. The first releases are by hand, from `docs/releasing.md`, after this work merges.
