---
id: ADR-013
title: The release process for the packages, and how they stay in step with the engine
status: accepted
rfcs: [RFC-009]
specs: [specs/010-release-workflows]
created: 2026-11-19
---

# ADR-013: The release process for the packages, and how they stay in step with the engine

## 1. Context

Seven packages in this workspace are candidates for the public registry: the core `@relate/web` (hosts the engine in a worker and gives a page asynchronous queries), the framework adapters `@relate/astro`, `@relate/nextjs`, `@relate/observable` and `@relate/sveltekit`, the data provider `@relate/react-admin`, and the Phaser helper `@relate/relate-phaser`. Their manifests say what is missing:

- All seven have `"private": true`, and none has a license, a repository address or publish settings.
- The engine's WebAssembly package, `@relate/relate-wasm`, is a peer at `"*"` in the core and in the four adapters; the data provider and the Phaser helper reach it through the core. The workspace builds the engine from a git submodule (`vendor/relate`, pinned to one commit, on an upstream feature branch at the time of writing) and links it with a package-manager override. It is not on the registry, so no consumer could install what the peers ask for.
- The core also lists `@playwright/test` as an optional peer, though nothing it ships uses it (it is already a development dependency for the browser tests). The Observable adapter has one runtime dependency, `esbuild`, which its loader imports to bundle at the consumer's build.
- Two scheduled workflows exist. `drift` runs nightly, builds every package and checks that adapters agree with the core, and opens or comments on a GitHub issue when it fails. `full` runs on `main` and nightly. Neither runs against an engine other than the pinned one, so an upstream change is found only when someone moves the pin.
- The engine is before 1.0, so any minor release can break callers. One engine change reaches every package that peers on it, through the core.
- One package already tests the engine assumptions it relies on: `packages/react-admin/tests/unit/engine-assumptions.test.ts` runs the statements the provider depends on (uniqueness constraints, parameter handling) against the real engine, so an engine change that breaks the provider fails a named test.

RFC-009 poses the problem: how versions relate to the engine's, how a release is made and shown to be sound, and how an upstream change is noticed before a release depends on it. The sections below recommend a decision for each, and record the maintainers' decisions (2.10): the license is Apache 2.0, as for every project of the organisation; the `@relate` scope belongs to Neo4j and its administrators can publish under it; releases start only from a version tag on a protected branch, with the first release of each package by hand; and every engine release is tested and then, behind an approval gate, proposes a release or reports an issue. When a package moves to 1.0 is the maintainers' judgement and is not decided here (2.7).

## 2. Decision

### 2.1 Independent versions, and a range that follows the engine

Each package keeps its own version, below 1.0 until the maintainers decide otherwise (2.7). A package declares the engine versions it supports as its peer range on `@relate/relate-wasm`, never `"*"`, and the peer range is the one place a package states its engine support. The range spans from the oldest engine release the package supports to the newest release that has been tested with it (`>=OLDEST <=NEWEST`), because an ordinary caret range would cover only patch releases of a pre-1.0 engine and would hide a minor release that was never tested.

The range changes only by the engine-release run (2.3): a passing release moves `NEWEST` up to it, and a failing release is left out, so the range never includes an untested or a failing engine release. Raising `OLDEST` (dropping an old engine) is a reviewed change made by hand.

Amended 2026-11-23: the range may also end at a minor boundary, `>=OLDEST <NEXT` with `NEXT` of the form `X.Y.0` (for example `>=1.2.0 <1.3.0`), which supports every patch release below the boundary, including ones published after the range was written. The first minor above the boundary stays untested and so excluded, which is the property the rule above protects. A passing engine release below the boundary changes nothing; a passing release at or above it moves the boundary to the next minor above that release. The engine is at 1.x, where a minor release is not expected to break, but the range still records only what was tested, one minor at a time.

One entry in the workspace's catalog (the package manager's shared version table) names the engine version the workspace is built and tested on. A script checks that every package's peer range includes that version and fails the build if one does not. A package is released when its own code changes or when its range moves, and not otherwise.

### 2.2 Order of release, and the gate

Releases go in dependency order: the engine (upstream), then `@relate/web`, then the adapters, the data provider and the Phaser helper in any order. A release gate script refuses to publish a package unless every `@relate` package it peers on is already on the registry at a version its peer range accepts, and its engine range is not `"*"`.

### 2.3 Two lanes: the repository's, and every engine release

- **The supported lane** runs every package against the catalog's engine version. It gates merges and releases (the existing `full` workflow, with the engine taken from the registry once it is published).
- **The engine-release lane** runs for every release of the engine, as soon as it is published: a workflow started by the engine repository's own release (a repository dispatch event), with a scheduled poll of the registry as a fallback so a missed event is still found within the hour. It installs that release, runs every package's unit tests, the canary tests (2.5), the conformance checks and the drift check against it, and then:
  - **If it passes**, the workflow raises `NEWEST` to that release in every package whose tests passed (a changeset for each, 2.6) and proposes the release (2.6), behind an approval gate: a protected environment with required reviewers holds the step until a person approves it. Packages whose range does not move are not released.
  - **If it fails**, the workflow opens or comments on a GitHub issue, using the mechanism `drift` already has, under its own title and label, naming the engine release and the failing tests. No range changes, so installed packages keep working with the releases already supported.

Until the engine is published, the supported lane builds it from the submodule as today. After that the submodule is kept only to try unreleased engine work, which runs as a manually started lane and never gates or triggers a release.

### 2.4 No separate bump proposals

The engine-release lane replaces a bot that proposes engine bumps: the supported version in the catalog is the one the workspace builds on, and moving it is an ordinary reviewed change, made when the repository wants to build on a newer engine. A release does not wait for that change. It is driven by the lane's result for each engine release.

### 2.5 Canary tests

Each package that calls the engine through the core has a file, `tests/unit/engine-assumptions.test.ts`, that pins the engine behaviours it relies on and names them in test titles, as the data provider's does. The core's file covers the result envelope's shape, that engine errors arrive in the envelope and do not throw, how a trapped instance behaves, and support for the stores and constraints it uses. The Phaser helper's covers the envelope shape its queue depends on. An adapter that reaches the engine only through the core states in a short test that it relies on the core's file. A failure in the newest lane names the engine behaviour that changed.

### 2.6 How a release is made

A release is made by a workflow, not from a developer's machine. A changeset-style record (a small file per change naming the packages and the kind of bump, kept in the repository) feeds the changelog and the version bump. A release starts only from a version tag on a protected branch, and a branch protection rule on the repository host governs who can create one. The merge of the reviewed "version packages" change the changesets tool opens, and a passing engine-release run (2.3), prepare a release (the version change, and the tag to be made) but do not start one. It builds, runs each changed package's unit, clean-install package and traceability checks, runs the release gate (2.2), and publishes the changed packages in dependency order with a provenance statement tying the published files to the commit and the workflow run. It authenticates with the registry's trusted-publishing (OpenID Connect) mechanism, so no long-lived token is stored.

The first release of each package is made by hand, by an administrator of the `@relate` scope, following a written procedure, because the registry configures a package's trusted publisher on a package that already exists. After that first release the package's trusted publisher is configured for this repository, the release workflow and its environment, and every later release of it goes through the workflow. The workflow refuses to publish a package that is not yet on the registry, and says that its first release is manual.

### 2.7 Leaving 0.x

No rule and no tool decides when a package moves to 1.0. It is a judgement the maintainers make for each package. Versions stay below 1.0 until they decide, and each package's README says that it is unstable until then, as the Phaser helper's does. Nothing in the release process checks for or enforces a 1.0.

### 2.8 Manifest hygiene before the first release

For each package that is released: set `name` as in 2.9; remove `private`; add `license`, `repository` (with `directory` for its folder), `homepage`, `keywords` and `publishConfig` with `access` set to `public`; keep the published `files` to the build output; and make a check script fail the build if a non-private package lacks any of these. Remove the core's `@playwright/test` peer, which nothing it ships uses. Keep the Observable adapter's `esbuild` dependency while its loader imports it at the consumer's build; revisit it only if the framework's own bundler can do that work.

### 2.9 Package names

The published packages are named `@relate/contrib-<project>` (RFC-009 5.6), so that a package from this repository is told apart from the engine's own packages in the shared `@relate` scope. The engine's `@relate/relate-wasm` keeps its name, as it is upstream's. The names change before the first release:

| Workspace name now | Published name |
|---|---|
| `@relate/web` (the core) | `@relate/contrib-web` |
| `@relate/astro` | `@relate/contrib-astro` |
| `@relate/nextjs` | `@relate/contrib-nextjs` |
| `@relate/observable` | `@relate/contrib-observable` |
| `@relate/sveltekit` | `@relate/contrib-sveltekit` |
| `@relate/react-admin` | `@relate/contrib-react-admin` |
| `@relate/relate-phaser` | `@relate/contrib-phaser` |

The rename is one mechanical change across the workspace: every manifest, import, script filter and document that names a package. It is made before anything is published, since a name is cheap to change until then and cannot be unpublished and reused afterwards.

### 2.10 Decided by the maintainers

Decided: releases start only from a version tag on a protected branch, governed by a branch protection rule, with the first release of each package made by hand and every later one by the trusted-publisher workflow (2.6); a passing engine release is subject to an approval gate (2.3); the package names follow `@relate/contrib-<project>` (2.9); the license is Apache 2.0, so each released package carries the license text and `"license": "Apache-2.0"`; the `@relate` scope belongs to Neo4j; and the engine range follows the engine through the engine-release lane (2.1, 2.3).

Nothing is left open in this ADR. The moves to 1.0 are the maintainers' judgement and are not decided here (2.7).

## 3. Alternatives Considered

- **Lockstep versions with the engine.** Rejected: one number is easy to explain, but every package would be re-released whenever the engine moved, including the ones that did not change, and six unchanged packages would carry changelog entries with nothing in them. A declared range gives the same safety, since a package states the engine it supports.
- **Bundle the engine in each package.** Rejected: the module is about 6 MB uncompressed, so every package would carry a copy and a page using two would load two, and the engine version would no longer be stated in one place.
- **A peer at `"*"` with the engine checked at run time.** Rejected: an incompatible install would be found by a visitor, not by an install warning or a test.
- **Publish by hand from a developer's machine.** Rejected: nothing ties the published files to a checked commit, and the release gate and checks are easy to skip.
- **Test only the newest engine, on every merge.** Rejected: a change upstream would then fail every merge, so work would stop for something outside the repository. The supported lane gates the repository; the engine-release lane runs per release and does not hold up merges.
- **A nightly run against the newest engine instead of a run per release.** Rejected: a release could sit untested for up to a day, and a nightly run gives no event to hang a release on. A run per release answers each engine release once, with a result that either releases or reports.
- **A caret range on the engine.** Rejected: for a pre-1.0 engine it covers patch releases only, so a new minor would need a manual range change and the range would not record which releases were tested.

## 4. Consequences

- A package cannot be released until the engine is published, so the engine is the first dependency on the critical path. Until then nothing here can be exercised end to end.
- A run per engine release costs the check's time (about 45 minutes) for each release and an issue to triage when one fails. RFC-009 leaves open which subset is enough to catch a break (7.2).
- A passing engine release can release every package whose range moves, so the quality of the canary and conformance tests is what stands between an engine change and a published release. The approval gate (2.3) is what a person controls.
- The engine's own release job has to send the repository dispatch event, which is a change upstream; until it does, the scheduled poll finds the release within the hour.
- Declared ranges must be moved on purpose, so each new engine minor costs a reviewed change and, for the packages whose range moves, a release.
- The catalog entry, the range check and the release gate are new scripts and a workflow to maintain.
- Trusted publishing is configured per package, after its first release, and the first releases are manual. The `@relate` scope belongs to Neo4j, and its administrators make those first releases.
- Canary tests add a file per package that must be kept honest as the packages' use of the engine changes.
- The rename in 2.9 touches every import, filter and document, and the earlier decisions that name the Phaser helper `@relate/relate-phaser` (RFC-008 and ADR-012) get a dated note when it lands. Until it does, the workspace names and the published names differ.
- This ADR does not publish anything. Implementing it is a specification of its own, once the open items and the engine's publication are settled.

## 5. Related

- RFCs: RFC-009
- RFC-008: when a package moves to its own repository (5.3) is independent of publishing from here
- RFC-001: how the engine is hosted and consumed by the core

## 6. Amendments

### 2026-11-19: mechanics settled while building it (specs/010-release-workflows)

None of these changes a decision above; they fix details the sections left open.

- **2.1.** Only the packages that load the engine (the core and the four adapters) declare an engine range. The data provider and the Phaser helper reach it through the core and declare none; a check fails if they do. The supported engine is a catalog entry in `pnpm-workspace.yaml`, keyed `@relate/relate-wasm` (the key pnpm looks up for a `catalog:` dependency), equal to the vendored engine package's version while the engine is vendored.yaml`, equal to the vendored engine package's version while the engine is vendored. Each dependent's peer on the core is an explicit window, `>=<first core version> <1.0.0`, not a caret, which would leave range on every pre-1.0 core minor.
- **2.3.** An engine release tested by the engine-release lane is recorded as the git tag `engine-tested/<version>`, made with the workflow's own token, so nothing is pushed to the protected main branch.
- **2.6.** A version tag is `<package name>@<version>` and releases one package; the core's tag goes first. The changesets tool is configured to version packages that are still private and to update a peer dependent only when a peer falls out of range. The maintainers' allow list for a move to 1.0 is `.changeset/allow-1.0.json`, because the tool refuses config keys it does not know; the fast checks fail a package at 1.0.0 or above that is not on it, which prevents an accidental move and does not decide a deliberate one.
- **2.5.** Each adapter's canary file checks that the core's file exists and still names the behaviours the adapter relies on; the origin-private store's behaviour is pinned by the application-graph browser tests, since it needs a browser.
- **2.2.** The gate also refuses a package whose own version is already on the registry (`version-exists`), a package that is not on the registry (`first-release-is-manual`), and any case where the registry cannot be reached, which is never taken for an answer.

### 2026-11-19: a release verifies the full suite instead of running it (specs/010-release-workflows)

Amends 2.6. The release workflow no longer runs a package's browser, conformance and traceability checks. They take most of an hour for a package on a runner, and the `full` workflow already runs every one of them on each push to the main branch and nightly. The release builds and runs each package's unit and clean-install package checks, as before, and its gate gains one step: it asks the repository host whether `full` finished with success on the exact commit being released (a tag's commit is a commit on the protected branch). A missing, running, failed or cancelled run, or a failure to ask, stops the release; a maintainer then waits for the run on the branch or starts it by hand. The step uses the workflow's own read-only token, so no secret is added.

The trade-off: a release is only as proven as the `full` run on its commit, and `full` must be kept passing on the main branch. Rejected: rerunning the suites in the release (the same checks twice, in a job per package and browser to keep it bearable) and dropping the proof (a tag on a commit whose browser tests never ran). The core's browser tests retry once on a runner, because WebKit on Linux is slower than on a developer machine; a test that needed the retry is reported as flaky.

Performance tests do not gate. The core's load-time and restore-time tests (tagged `@perf`) leave the browser suite that `full` runs and move to their own nightly workflow, `perf`, which opens an issue when one fails. A time depends on the machine, and a runner is not the reference machine, so no merge or release waits for it. The traceability check still requires the performance tests to exist and be tagged, and does not require them to have passed.

Two catalog interruption tests do not gate while an engine defect stands (amended 2026-11-20). The core's tests "an application stopped during an import…" and "…during resetApplication…" (tagged `@engine-wal`) stop the worker while the engine creates a WAL segment. On the OPFS store the engine publishes the new segment's name before it writes the segment's header, and it refuses to open a store whose newest segment is empty ("truncated WAL magic"; relatedb/relate#576). The tests fail on a runner in a fraction of runs, in Firefox and WebKit. They leave the browser suite that `full` runs, run in their own nightly workflow, `engine-known`, and return to the gate when the engine accepts an empty newest segment. Until then a release does not prove that a worker stopped at that moment leaves a store that opens again; the other interruption tests (seeding, migrating, removal) still gate.
