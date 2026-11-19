---
id: RFC-009
title: Publishing the Packages and Keeping Them in Step with the Engine
status: draft
created: 2026-11-19
adrs: [ADR-013]
---

# RFC-009: Publishing the Packages and Keeping Them in Step with the Engine

## 1. Summary

RelateDB is an embedded property graph engine that runs in the browser as a WebAssembly module. The libraries built on it (a core package that hosts the engine in a worker, adapters for web frameworks, a data provider for an admin framework, and a helper for Phaser games) each need that one engine to run. They are developed in a single workspace and none has been published. They exist so that community and hackathon projects can start from them, which makes installing them from the public registry the whole point. A published package makes two promises that an unpublished one does not: that a stranger can install it, and that it works with the engine versions it says it supports.

Keeping those promises is harder here than for an ordinary library, because the engine is an upstream project that is still before version 1.0 and can change incompatibly in any minor release, and because the libraries share it as a peer, so one engine change reaches all of them at once. This RFC sets out the problem and the candidate directions for three questions: how the packages are versioned against the engine, how a release is made and shown to be sound, and how an upstream engine change is noticed before a release depends on it. Technical decisions are left to ADRs.

## 2. Problem / Motivation

Seven packages are candidates for publishing (the core's way of hosting and consuming the engine is the subject of RFC-001): the core (`@relate/web`), four framework adapters (`@relate/astro`, `@relate/nextjs`, `@relate/observable`, `@relate/sveltekit`), a data provider (`@relate/react-admin`) and the Phaser helper (`@relate/relate-phaser`). Their manifests show what stands between them and a first release:

- **They cannot be published.** Every manifest has `"private": true`. None has a license, a repository address or publish settings, and there is no release process or release tooling in the repository, only two scheduled and on-demand checks.
- **Their engine peer is unpinned and not published.** Every package except the data provider and the Phaser helper declares the engine as a peer at `"*"`, any version, and those two inherit it through the core. The engine package is not on the public registry: the workspace builds it from one pinned commit of a git submodule, which at the time of writing sits on an upstream feature branch. A consumer cannot install it, and no published package could say which engine it was tested with.
- **One package advertises a test tool.** The core lists a browser test runner as an optional peer, although nothing it ships uses it. It is in the published manifest as noise that suggests a requirement that does not exist.
- **The only drift check does not cover the engine.** The nightly check confirms that the adapters still agree with the core. It does not run against a newer engine, so an upstream change is found when a developer next updates the pin.

The cost of leaving these open is concrete. A game author cannot install the Phaser helper today, because it needs the core, and the core needs an engine that is not published. A package published against an unpinned peer would claim to work with engine versions nobody has tested, and the first incompatible engine release would break every installed copy at once. Every adapter depends on the core, so the core has to be released first, and anything wrong with its engine range propagates.

## 3. Goals

- Make each package installable by a stranger: a license, repository metadata, and a published engine to depend on.
- Tie each release to a stated range of engine versions that has been tested, and refuse to release a package that no supported engine can run.
- Learn of each upstream engine release within hours, with the test results attached, before it reaches a release.
- Make the release path repeatable: who may publish, what is checked first, and how a published version can be traced to the source it came from.
- State, per package, the condition for leaving its early, unstable versions.
- Name the published packages so that they are recognisable as this repository's, apart from the engine's own packages in the same scope.

## 4. Non-Goals

- Publishing the engine itself. That is upstream's work; this repository only depends on it.
- Changing any package's interface or behaviour for the sake of publishing.
- Moving a package to its own repository. That has its own trigger (RFC-008) and is independent of publishing from here.
- A policy for third-party contributions, support or deprecation beyond what a first release needs.

## 5. Proposed Approach (high-level)

### 5.1 What gates the first release

Releases follow the dependency order: the engine, then the core, then everything that peers on the core. Three things must exist before the core can go out: a published engine to depend on, a license, and the right to publish under the package scope. The license is Apache 2.0, as for every project of the organisation. The scope, `@relate`, belongs to Neo4j, and publishing permission under it is being arranged. The other packages are held only by the core, and can follow it in any order.

### 5.2 How versions relate to the engine's

Two shapes are candidates. **Lockstep**: the packages move to a new version whenever the supported engine range moves, giving a user one number to check. **Independent versions with a declared range**: each package keeps its own version and states the engine versions it supports, so a package that did not change need not be re-released when the engine moves. Either way the declared range is a real range, never "any version". It follows the engine: a range covers the engine releases that have been tested, so it grows when a new release passes and does not when one fails.

### 5.3 Staying in step with the engine

Four mechanisms work together:

- **Every engine release is tested.** A new engine release starts a run of every package against it. If the run passes, the supported range grows to include the release and a release of the affected packages is proposed; whether it then proceeds on its own or waits for a person's approval is open (7.2). If it fails, an issue names the engine release and the failing tests, the range does not grow, and the packages keep working with the engines already supported.
- **A supported lane gates the repository.** Merges and releases are tested against the engine version the workspace is built on, so a change here is never held up by an upstream release that has not been adopted.
- **Canary tests.** Each package pins the engine behaviours it relies on as small tests (the shape of a result, how a trapped instance behaves, support for the stores and constraints it uses). A failure names the engine change that caused it. One package already does this for its own assumptions.
- **Gaps raised upstream.** When the engine lacks something a package needs, that is recorded here and raised with its maintainers, not patched around.

### 5.4 Making and proving a release

A release is made by an automated job, not from a developer's machine, whether a person starts it or a passing engine release proposes it. The job builds, runs the unit, package and trace checks, and publishes with a provenance statement that ties the published files to the commit and the job that made them. Which people can trigger a release, and with what credentials, is a decision for the maintainers; the approach prefers short-lived, job-scoped credentials over long-lived ones held by a person.

### 5.5 Leaving the early versions

While the engine is before 1.0, each package stays below 1.0 and says in its README that it is unstable. One candidate rule for reaching 1.0 is that a package's interface has been stable across a second consumer and the engine range it needs has stopped moving; whether one rule serves every package is open (7.3). The first package to publish is the core, and it states the unstable status first.

### 5.6 Naming

Packages published from this repository are named `@relate/contrib-<project>`, where the project is the integration, for example `@relate/contrib-astro`. The `@relate` scope is shared with the engine's own packages (such as `@relate/relate-wasm`), and the prefix tells a package from this repository apart from an upstream one. The names are chosen before the first release, while a rename costs only a change in the workspace.

## 6. Alternatives Considered

- **Publish only the Phaser helper first.** Rejected: it peers on the core, which peers on the engine, so it cannot be installed until both are published.
- **Bundle the engine's WebAssembly module inside each package.** Rejected: the module is about 6 MB uncompressed, so every adapter would carry its own copy and a page using two would load two. It also removes the one place where the engine version is stated.
- **Make the engine a direct dependency of the core, not a peer.** Rejected: an application passes the engine's file location to the core, because bundlers move the file, and a page that uses the core and an adapter must share one copy of the engine. A peer lets the application own that single copy.
- **Keep the engine peer unpinned and rely on users to match versions.** Rejected: a pre-1.0 engine breaks on minor releases, so an unpinned peer turns an upstream change into an installed-base failure with no warning.
- **Release by hand from a developer's machine.** Rejected for repeatability: nothing ties the published files to a checked source, and the checks that gate a release are easy to skip.

## 7. Open Questions

7.1. Lockstep versions with the engine, or independent versions with a stated engine range? The first is simpler to explain, the second avoids re-releasing a package that did not change.

7.2. Who may trigger a release by hand, and may a passing engine release proceed without a person approving it? The `@relate` scope belongs to Neo4j and permission to publish under it is being arranged; what the credentials are, and how they are kept off developers' machines, follows from that.

7.3. When does each package leave 0.x? One rule for all of them, or per package?

7.4. What does a run against a new engine release cost, given the full check takes about 45 minutes, and which subset is enough to catch a break?

## 8. ADRs

- ADR-013: the release process, and how the packages stay in step with the engine
