# Releasing the packages

For maintainers. The decisions behind this are in ADR-013 (the release process) and RFC-009 (the problem); how the checks and
workflows are built is in `specs/010-release-workflows/`.

Seven packages are released from this repository, each under the `@relate` scope, which belongs to Neo4j:
`@relate/contrib-web` (the core), `-astro`, `-nextjs`, `-observable`, `-sveltekit`, `-react-admin` and `-phaser`.
Each has its own version. A move to 1.0 is the maintainers' judgement for each package; nothing here checks for it.

## The order

The core, `@relate/contrib-web`, goes first. Every other package peers on it, and the release gate refuses a package whose peers are
not yet on the registry. They all also need the engine, `@relate/relate-wasm`, to be on the registry. The other six can follow in any order.

## Before any release: run the checks

```sh
pnpm release:check-publishable --release --package <name>   # the package is fit to publish (private removed, license, repository, ...)
pnpm release:check-engine-range                             # engine ranges agree with the supported engine
pnpm release:plan --all --rehearsal                         # what would be published, in order, with each gate verdict
pnpm -r build
pnpm run test:units && pnpm run test:packages-all && pnpm run test:traces-all
```

A rehearsal on the host runs the same: start the **release** workflow by hand from the Actions tab with a package name, or `all`.
It uses no registry credential and publishes nothing.

## Every later release: a version tag

1. Record the changes (`pnpm changeset`), merge them, and merge the "version packages" change the tooling proposes. That raises each package's version and writes its changelog.
2. On the main branch, create the tag `<package name>@<version>`, for example `@relate/contrib-web@0.1.1`. Only the main branch's history may carry such a tag (see the settings below).
3. The **release** workflow resolves the tag, builds, runs the package's unit and clean-install package checks, checks that the `full` workflow passed on this exact commit (it runs the browser, conformance and traceability checks, so wait for it on `main` before tagging), runs the gate, and then, if `PUBLISHING_ENABLED` is `true`, publishes the tarball by the registry's trusted publishing with provenance. No token is stored anywhere.

One tag releases one package. If a dependent and the core both change, tag the core first and wait for it to appear on the registry.

## Settings that are not files

An administrator of the repository sets these on GitHub and on the registry. Nothing in the repository can set them.

- **Branch protection on `main`**: pull requests with review, the required checks passing (the `release-checks` workflow and the existing ones), no force pushes.
- **A tag ruleset on the pattern `@relate/contrib-*@*`**: only an administrator may create these tags, and a tag may only be created on a commit that is on the main branch.
- **Environment `npm-publish`**: no secrets; optionally required reviewers. The package's trusted publisher names it.
- **Environment `engine-release-approval`**: required reviewers (see below).
- **Repository variable `PUBLISHING_ENABLED`**: `true` once the first releases are done and the maintainers want tag pushes to publish. Unset or any other value makes every run a rehearsal.
- **Each package's trusted publisher on the registry**: repository `relatedb/relate-contrib`, workflow `release.yml`, environment `npm-publish`. Every package was first published by hand, at 0.1.0 on 2026-11-23, because the registry offers this setting only for a package that exists.

## Every engine release is tested

The engine is released from its own repository. When it publishes a release, the **engine-release** workflow runs against it, started by a
`repository_dispatch` event of type `engine-release` with the version in its payload, or, if that event is missed, by an hourly look at the
registry that finds engine releases not yet tested. Each engine release is tested once; its result is recorded as the tag `engine-tested/<version>`.

The run installs that engine release and runs every package's unit tests, its engine-assumptions (canary) tests, the conformance checks and the drift check.

- **If everything passes**, the run waits at the **engine-release-approval** environment. When a reviewer approves, it raises the newest supported engine in each engine-loading package's range and opens a pull request with a recorded change for each. Merging it and tagging the packages is an ordinary release.
- **If anything fails**, an issue titled `Engine release <version> breaks packages` is opened (or commented on, if one is open) naming the engine release and the failing tests. No range changes, so installed packages keep working with the engine releases already supported.

The engine's release job should send the dispatch event when it publishes: from the engine repository, `gh api repos/relatedb/relate-contrib/dispatches -f event_type=engine-release -f 'client_payload[version]=<version>'` with a token that may do so. Until it does, the hourly look finds each release within the hour.

When the engine is published, remove the override that links the vendored engine from `pnpm-workspace.yaml`, keep the catalog entry (`@relate/relate-wasm`) that names the supported engine, and stop building the engine from the submodule in the supported lane.
