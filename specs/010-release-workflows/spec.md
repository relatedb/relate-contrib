# Feature Specification: Publishing Workflows for the Packages

**Feature Branch**: `spec/010-release-workflows` (spec directory `010-release-workflows`)

**Created**: 2026-11-19

**Derived From**: ADR-013 (design/adr/ADR-013-release-process-and-engine-sync.md)

**Status**: Draft

**Input**: User description: "Implement ADR-013: make the seven packages publishable and put the publishing workflows in place, as far as can be built and proven before the engine is published and before Neo4j grants permission to publish under the @relate scope."

## Overview

Seven packages in this workspace are meant for the public registry: the core (`@relate/contrib-web`), four framework adapters (`-astro`, `-nextjs`, `-observable`, `-sveltekit`), a data provider (`-react-admin`) and a Phaser helper (`-phaser`). None can be published today: each is marked private, has no license or repository metadata, declares the engine as a peer at any version, and there is no release process. The engine they all need is itself not yet published. The `@relate` scope belongs to Neo4j, and its administrators can publish under it.

This feature builds the process ADR-013 decided, in the part that can be built and shown to work now: checks that make a package fit to publish, one place that says which engine versions a package supports, a gate that refuses an unsafe release, versioning and changelogs, a release workflow that can be rehearsed without publishing, a run that tests each new engine release and either proposes a release or reports an issue, and a test file per package that pins the engine behaviours it relies on. The parts that need the published engine run against stand-ins until it exists, and the release runs in a rehearsal mode until the maintainers switch publishing on after the first, manual, releases.

Three kinds of people depend on it:

- **Maintainers** want a release to be a repeatable, checked job, and an engine change to arrive as a result they can read, not a surprise.
- **Package consumers** (game authors, site builders, hackathon participants) want a package they can install, with a stated engine it works with.
- **The engine's maintainers** want to know that an engine release is tested by the packages that depend on it, and to hear when it breaks one.

Terms: the *engine* is the WebAssembly package `@relate/relate-wasm`, which is upstream and not published from here. An *engine range* is the `>=OLDEST <=NEWEST` range of engine versions a package declares as its peer. The *supported engine* is the one engine version the workspace is built and tested on, named once in the workspace's shared version table (its *catalog*). A *changeset* is a small file recording which packages change and how, from which versions and changelogs are made. A *rehearsal* is a run that does everything a release does except publish.

The specification implements ADR-013 and does not restate its decisions where an ADR section carries them; the requirements name the section. It builds on RFC-009 (the problem) and the existing nightly drift check (the issue mechanism it reuses). It does not change any package's interface.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A package can be checked for fitness to publish (Priority: P1)

A maintainer runs one check over the packages that are to be released. It fails and names the missing item for any package that lacks a license identifier or file, repository address with its folder, homepage, keywords or public publish setting, that still declares a development-only peer, or whose files include more than the build output.

**Why this priority**: it is the first thing every later step depends on, and it can be proven now on the real manifests.

**Independent Test**: run the check on the real packages and on fixture manifests, each missing one item, and compare the results.

**Acceptance Scenarios**:

1. **Given** a package with every required item, **When** the check runs, **Then** it passes.
2. **Given** a package missing the license, **When** the check runs, **Then** it fails and the message names the package and the missing license.
3. **Given** each of the other required items missing in turn (repository with folder, homepage, keywords, public publish setting), **When** the check runs, **Then** it fails and names that item.
4. **Given** the core's optional test-tool peer, **When** the check runs, **Then** it fails until the peer is removed, and passes afterwards.
5. **Given** a package that is still marked private, **When** the check runs for a release, **Then** it fails; **When** it runs as a general check of the workspace, **Then** it reports the package as not yet released and does not fail.
6. **Given** a LICENSE file with the license text at the repository root and in each released package's folder, **When** the check runs, **Then** it passes; **When** a package's folder has none, **Then** it fails.

---

### User Story 2 - Each package states the engine it supports, in one place (Priority: P1)

A maintainer finds, for each package, one declared engine range, and finds the one engine version the workspace is built and tested on. A check fails if a package's range does not include that version, or if a range is "any version", or if two places disagree.

**Why this priority**: the whole process hangs on a stated engine range, and it is a precondition of the gate.

**Independent Test**: run the range check on the real packages and on fixtures (a range that omits the supported engine, an "any version" range, a malformed range).

**Acceptance Scenarios**:

1. **Given** every package's range includes the supported engine, **When** the check runs, **Then** it passes.
2. **Given** a package whose range omits the supported engine, **When** the check runs, **Then** it fails and names the package, its range and the engine version.
3. **Given** a peer on the engine at "any version", **When** the check runs, **Then** it fails.
4. **Given** a range that is not of the form `>=OLDEST <=NEWEST`, **When** the check runs, **Then** it fails and says what form is expected.
5. **Given** the supported engine named in the shared table, **When** the engine's version is changed there, **Then** the workspace builds and tests against that version, and a package whose range excludes it is reported.

---

### User Story 3 - An unsafe release is refused (Priority: P1)

Before any package is published, a gate checks it: the `@relate` packages it peers on must already be on the registry at a version its range accepts, and its engine range must be real. The gate refuses, with a reason, and nothing is published.

**Why this priority**: it is the rule that stops a package going out that nobody can install, and it can be proven now with a stand-in for the registry.

**Independent Test**: run the gate against a recorded registry answer and fixtures: the core already published, the core absent, the core at the wrong version, a range of "any version".

**Acceptance Scenarios**:

1. **Given** the core is on the registry at a version the adapter's peer range accepts, **When** the gate runs for the adapter, **Then** it passes.
2. **Given** the core is not on the registry, **When** the gate runs for an adapter, **Then** it refuses, naming the missing package.
3. **Given** the core is on the registry only at versions the range rejects, **When** the gate runs, **Then** it refuses, naming the versions found.
4. **Given** a package whose engine range is "any version", **When** the gate runs, **Then** it refuses.
5. **Given** the registry cannot be reached, **When** the gate runs, **Then** it refuses and says the registry was unreachable, and does not treat the package as published or unpublished.
6. **Given** the core and the adapters in one release, **When** the gate runs in order, **Then** the core is judged first and the adapters are judged against what is published or about to be.

---

### User Story 4 - A release can be rehearsed from end to end (Priority: P2)

A maintainer starts the release workflow in rehearsal mode. It builds every package, runs the unit, package and traceability checks, runs the gate, packs each package that would be published in dependency order, and reports what it would publish, in what order, with what versions, and stops short of publishing and of signing.

**Why this priority**: it proves the workflow before publishing is permitted, and it is how every change to the workflow is tested later.

**Independent Test**: start the workflow in rehearsal mode on a branch and read its report; start it again after breaking one check and confirm it stops there.

**Acceptance Scenarios**:

1. **Given** a rehearsal start, **When** every check passes, **Then** the workflow reports the ordered list of packages and versions it would publish, and publishes nothing.
2. **Given** a failing unit, package or traceability check, **When** the workflow runs, **Then** it stops before the gate and names the check.
3. **Given** a failing gate, **When** the workflow runs, **Then** it stops and names the gate's reason.
4. **Given** a rehearsal, **When** it ends, **Then** no registry credential has been used and no package has been published.
5. **Given** a real (not rehearsal) start before publishing is permitted, **When** the workflow runs, **Then** it refuses to publish and says why, unless the maintainers have switched publishing on.
6. **Given** a real start, **When** it is not from a version tag on a protected branch, **Then** the workflow refuses to run a release, and the merge of a version change or a passing engine-release run does not start one.
7. **Given** a package that is not yet on the registry, **When** the release runs, **Then** the workflow refuses to publish it and says that its first release is made by hand.

---

### User Story 5 - Versions and changelogs come from recorded changes (Priority: P2)

A contributor records, in a small file, which packages a change affects and whether the change is a fix, a feature or a break. A version change is proposed from the recorded changes: each package's version moves and its changelog gains an entry. A package with no recorded change is not released.

**Why this priority**: it makes versions independent per package, and it is what the engine-release run writes into.

**Independent Test**: record changes for two packages, propose the version change, and check the versions and changelogs; record none for a third and check it is untouched.

**Acceptance Scenarios**:

1. **Given** a recorded change naming two packages, **When** the version change is proposed, **Then** only those two packages' versions move and each changelog has an entry.
2. **Given** no recorded change for a package, **When** the version change is proposed, **Then** the package is not released.
3. **Given** a package that depends on another that moved, **When** the version change is proposed, **Then** its declared dependency on that package is updated to match.
4. **Given** a pull request that changes a package's published files and records no change, **When** the checks run, **Then** they warn that no change is recorded.

---

### User Story 6 - Every engine release is tested, and it releases or reports (Priority: P2)

When the engine publishes a release, a run starts: by a signal from the engine's own release, or, if that is missed, by an hourly look at the registry. It installs that engine release and runs every package's unit tests, canary tests, conformance checks and drift check against it. For each package that passes, the newest engine in its range is raised to that release and a release is proposed. If anything fails, an issue is opened or commented on, naming the engine release and the failing tests, and no range changes.

**Why this priority**: it is the part that keeps the packages in step with the engine, and it can be proven now against a stand-in for the engine's releases.

**Independent Test**: start the run with a recorded "new engine release" event whose tests pass, then one whose tests fail, and check the outcomes; start it from the hourly look with a release already tested and check that nothing happens.

**Acceptance Scenarios**:

1. **Given** a new engine release and all tests passing, **When** the run completes, **Then** it holds at an approval gate; **When** a person approves, **Then** each package's newest engine is raised to that release by a recorded change and a release is proposed, and nothing is published by the run.
2. **Given** a new engine release and some package's tests failing, **When** the run completes, **Then** an issue names the engine release and the failing tests, no range changes for the failing package, and the other packages are handled by their own results.
3. **Given** an issue is already open for a failing engine release, **When** a later run for the same release fails again, **Then** it comments on that issue and does not open another.
4. **Given** the signal is missed, **When** the hourly look finds a release not yet tested, **Then** the run starts for it; **When** it finds only releases already tested, **Then** nothing runs.
5. **Given** two engine releases found together, **When** the runs start, **Then** each release is tested once, in order, and a result for one does not hide the other.
6. **Given** the engine is not yet published, **When** the lane is exercised, **Then** it runs against a recorded stand-in for a release and its own checks pass, and the lane does nothing in production until a release exists.
7. **Given** a package that does not use the engine's result shape directly, **When** the lane runs, **Then** its canary tests still run and it is raised only if they pass.

---

### User Story 7 - Each package pins the engine behaviours it relies on (Priority: P2)

Each package has a test file that names the engine behaviours it relies on and checks them against the engine, in the way the data provider's does. When an engine release changes one of them, the test that fails names it.

**Why this priority**: the engine-release run is only as good as these tests, and they can be written and run now against the pinned engine.

**Independent Test**: run each package's file against the supported engine and confirm it passes; change a fixture to simulate an engine change and confirm the failing test names the behaviour.

**Acceptance Scenarios**:

1. **Given** the core, **When** its file runs, **Then** it checks the result envelope's shape, that an engine error arrives in the result and does not throw, how a trapped instance behaves, and the stores and constraints the core uses.
2. **Given** the Phaser helper, **When** its file runs, **Then** it checks the envelope shape its queue depends on.
3. **Given** an adapter that reaches the engine only through the core, **When** its file runs, **Then** it states that it relies on the core's file and checks that the core's file exists and runs.
4. **Given** the data provider, **When** its existing file is brought into this pattern, **Then** it keeps its checks and its place.
5. **Given** a changed engine behaviour, **When** the file runs, **Then** the failing test's title names the behaviour that changed.

---

### User Story 8 - The repository's own checks gate merges and releases (Priority: P3)

Merges and releases are tested against the supported engine. The engine-release run does not hold up a merge, and a merge is not held up by an engine release that the workspace has not adopted.

**Why this priority**: it already exists in part (the `full` and drift workflows); this story makes the new checks part of it.

**Independent Test**: open a change that breaks a new check and confirm the gate fails; start an engine-release run and confirm no merge is affected.

**Acceptance Scenarios**:

1. **Given** a change that breaks the publishability, range or gate checks, **When** the supported lane runs, **Then** it fails.
2. **Given** an engine-release run in progress or failing, **When** a change is merged, **Then** the merge is not blocked by it.
3. **Given** a release, **When** it runs, **Then** it depends on the supported lane having passed for the commit being released.

### Edge Cases

- A package to be released declares a peer on a `@relate` package that is not in this workspace: the gate asks the registry and treats it like any other.
- The registry answers slowly or with an error mid-release: the release stops before publishing anything further and says which packages were and were not published.
- A package is published and a later one in the order fails: the report lists the published ones so that the release can be completed or corrected; nothing is unpublished.
- The version a release would publish already exists on the registry: the gate refuses for that package.
- The hourly look and the signal both find the same engine release: it is tested once.
- An engine release is a prerelease or a withdrawn version: it is not tested as a supported release and no range is raised to it.
- A recorded change names a package that does not exist: the version proposal fails and says so.
- A rehearsal is started from a fork: it runs without any credential and does not report as a real release.
- Two releases are started at once: the second waits or is refused, and never publishes the same version twice.
- A package's range already includes the newest engine release: the run for that release changes nothing for it and reports that.

## Requirements *(mandatory)*

### Functional Requirements

**Fitness to publish (ADR-013 2.8, 2.9)**

- **FR-001**: A check MUST fail, naming the package and the item, for any package to be released that lacks any of: the `Apache-2.0` license identifier, a repository address with the package's folder, a homepage, keywords, or a public publish setting.
- **FR-002**: The check MUST fail for a package whose published files include more than its build output, its README and its license, and MUST fail while the core declares a development-only peer.
- **FR-003**: The check MUST distinguish a package that is still private from one that has been released: as a release check it MUST fail for a private package; as a workspace check it MUST report it as unreleased and pass.
- **FR-004**: The license text MUST be present at the repository root and in each released package's folder, and the check MUST fail when it is missing from either.
- **FR-005**: Each package's `name` MUST follow `@relate/contrib-<project>` (ADR-013 2.9), and the check MUST fail for a package that does not.

**The engine range (ADR-013 2.1)**

- **FR-006**: Each package that loads the engine (the core and the four adapters) MUST declare its engine support as one peer range of the form `>=OLDEST <=NEWEST`, never "any version", in one place. A package that reaches the engine only through the core (the data provider and the Phaser helper) MUST NOT declare the engine peer.
- **FR-007**: The workspace MUST name the supported engine version once, in its shared version table, and the workspace MUST build and test against that version.
- **FR-008**: A check MUST fail, naming the package, when a package's range does not include the supported engine, is not of the required form, or is "any version".

**The release gate (ADR-013 2.2)**

- **FR-009**: Before a package is published, a gate MUST refuse it, with a reason, unless every `@relate` package it peers on is on the registry at a version its peer range accepts and its engine range is valid (FR-008).
- **FR-010**: The gate MUST refuse a package whose version already exists on the registry, and MUST refuse, saying so, when the registry cannot be reached.
- **FR-011**: Packages MUST be judged and published in dependency order: the core first, then the others.

**Versions and changelogs (ADR-013 2.6)**

- **FR-012**: Versions and changelogs MUST come from recorded changes, one small file per change naming the packages and the kind of bump; a package with no recorded change MUST NOT be released, and a dependent's declared dependency MUST be updated when the package it depends on moves.
- **FR-013**: A change to a package's published files with no recorded change MUST produce a warning in the checks.

**The release workflow (ADR-013 2.6)**

- **FR-014**: A release workflow MUST build every package, run the unit, clean-install package and traceability checks of each package to be released, run the gate (FR-009 to FR-011), and publish in dependency order with a provenance statement tying each published file to the commit and the run, authenticating by the registry's trusted-publishing mechanism, not a stored token.
- **FR-015**: The workflow MUST start a release only from a version tag on a protected branch; the merge of the proposed version change and a passing engine-release run (FR-019) prepare a release and MUST NOT start one.
- **FR-016**: The workflow MUST have a rehearsal mode that does everything except publish and sign, uses no registry credential, and reports the packages, versions and order it would publish; and MUST NOT publish for real until the maintainers switch publishing on.
- **FR-017**: When a step fails, the workflow MUST stop and report which packages were and were not published, and MUST NOT publish a version twice.

**The engine-release lane (ADR-013 2.3)**

- **FR-018**: A run MUST start for each engine release, by a signal sent by the engine's own release or, as a fallback, by a look at the registry every hour that finds releases not yet tested; each engine release MUST be tested once.
- **FR-019**: The run MUST install that engine release and run every package's unit tests, canary tests (FR-023), conformance checks and the drift check against it. For each package that passes, and once a person has approved at an approval gate (FR-027), it MUST raise `NEWEST` to that release by a recorded change (FR-012) and propose a release; a package that fails MUST NOT have its range raised.
- **FR-020**: When any check fails, the run MUST open an issue, or comment on the open one for that engine release, naming the engine release and the failing tests, using the mechanism the drift workflow already has under its own title and label.
- **FR-021**: A prerelease or withdrawn engine release MUST NOT raise any range.
- **FR-022**: The supported lane MUST run every package against the supported engine, gate merges and releases, and MUST include the checks of FR-001 to FR-013; the engine-release run MUST NOT block a merge.

**Canary tests (ADR-013 2.5)**

- **FR-023**: Each package that calls the engine through the core MUST have a file `tests/unit/engine-assumptions.test.ts` that pins the engine behaviours it relies on, with titles that name them; an adapter that reaches the engine only through the core MUST state that it relies on the core's file and check that file runs. Each file MUST pass against the supported engine.
- **FR-024**: The core's file MUST cover the result envelope's shape, that an engine error arrives in the result and does not throw, the behaviour of a trapped instance, and the stores and constraints the core uses; the Phaser helper's MUST cover the envelope shape its queue depends on.

**First releases, tags and approval (ADR-013 2.3, 2.6)**

- **FR-027**: The step of the engine-release run that raises ranges and proposes a release MUST wait at an approval gate (a protected environment with required reviewers) and MUST NOT proceed without a person's approval.
- **FR-028**: The first release of each package MUST be made by hand by an administrator of the `@relate` scope, following a written procedure in the repository (the order, the checks to run first, and how to configure the package's trusted publisher afterwards); the release workflow MUST refuse to publish a package that is not yet on the registry.
- **FR-029**: Version tags MUST be creatable only on a protected branch, enforced by a branch protection rule on the repository host, and the repository MUST document the rule that is expected.

**Scope and tracing**

- **FR-025**: This feature MUST NOT change any package's interface or behaviour, and MUST NOT publish the engine.
- **FR-026**: The checks and gate MUST have unit tests that run in Node, with fixtures for the registry and for the engine's releases; every requirement and success criterion MUST have a passing, tagged test (tags `covers-rel:`), checked by a trace command added to the project's guidance.

### Key Entities

- **Package manifest**: a package's name, version, license, repository with folder, homepage, keywords, publish setting, files and peers.
- **Engine range**: the `>=OLDEST <=NEWEST` peer range on the engine that a package declares.
- **Supported engine**: the one engine version named in the shared table that the workspace builds and tests on.
- **Recorded change**: a file naming packages and a kind of bump, from which versions and changelogs are made.
- **Gate verdict**: a pass, or a refusal with a reason, for a package in a release.
- **Release run**: one start of the release workflow, in rehearsal or real mode, with its ordered list of packages and results.
- **Engine release**: a version of the engine published upstream, tested once, with a result per package.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of the seven packages the fitness check reports pass or a named missing item, and a fixture manifest missing any one required item fails 100 % of the time, naming that item.
- **SC-002**: A range that omits the supported engine, an "any version" range, a malformed range, and an engine peer declared by a package that should not have one each fail the range check, and every real package's range passes.
- **SC-003**: The gate refuses 100 % of the fixture releases in which a peer `@relate` package is absent or at the wrong version from the registry, or a range is "any version", and passes the fixture in which everything is in place.
- **SC-004**: A rehearsal on the real workspace lists all seven packages in dependency order with the core first, uses no registry credential, and publishes nothing.
- **SC-005**: A recorded change for two packages moves exactly those two packages' versions and writes a changelog entry for each.
- **SC-006**: For a recorded engine release whose tests pass, every package's `NEWEST` is raised by one recorded change each; for one whose tests fail, an issue names the engine release and the failing tests and no range moves; the same release is tested once however many times it is signalled.
- **SC-007**: Each package's engine-assumptions file passes against the supported engine, and each of three simulated engine changes fails a test whose title names the changed behaviour.
- **SC-008**: Every requirement and success criterion has at least one passing, tagged test, checked by the trace command.

## Assumptions

- ADR-013 is accepted (2026-11-19); amendments go to the ADR first.
- The engine is not yet published, so the engine-release lane is built and proven against a recorded stand-in for an engine release and the gate against a recorded registry answer; the real engine release and the real registry exercise them once they exist.
- The `@relate` scope belongs to Neo4j, and an administrator of the scope can publish under it. Real publishing is switched on by the maintainers after the first releases; the rehearsal is the default until then.
- Decided by the maintainers: releases start only from a version tag on a protected branch; the first release of each package is by hand and later ones use the registry's trusted publishing from the workflow; a passing engine release waits for approval.
- A move to 1.0 is the maintainers' judgement and is not specified here: no requirement of this feature checks for or enforces it.
- The license is Apache 2.0, as for every project of the organisation.
- The repository host is GitHub and the registry is the public npm registry; the workflows run on the host's hosted runners, as the existing ones do.
- The package versions stay below 1.0 until the maintainers say otherwise, and each package keeps its own version.
- Packages are released independently, but all of them peer on the core, so the core goes first.
- The existing drift and full workflows stay, and this feature adds to them; the drift workflow's issue mechanism is reused and not reimplemented.
- The existing per-package unit, package and traceability commands are the checks the release runs.
