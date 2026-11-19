# Research: publishing workflows

What was found in the repository and outside it, and the mechanics settled for the plan. Each item states the finding, the decision and what was rejected. None changes a decision of ADR-013.

## R1. The engine is vendored, and its version is known

**Found**: the workspace links the engine from `vendor/relate-wasm/pkg` through a package-manager override (`pnpm-workspace.yaml`), and that package's own manifest says version `0.16.1`. Every adapter and the core declare the engine as a peer at `"*"`; `@relate/contrib-react-admin` and `@relate/contrib-phaser` do not declare it, because they reach it only through the core.

**Decision**: the workspace's shared version table (a pnpm catalog) gets one entry, `relate-wasm`, with the supported engine version (`0.16.1` today). The override that links the vendored build stays while the engine is unpublished, and the range check also compares the catalog's version with the vendored package's own manifest when it is present, so the two cannot drift. When the engine is published, the override is removed and the catalog entry alone names the version (quickstart, "when the engine is published").

**Rejected**: removing the override now. The engine is not on the registry, so nothing would install.

## R2. Only packages that load the engine declare a range

**Found**: five packages declare the engine as a peer (the core and the four adapters); the data provider and the Phaser helper do not.

**Decision**: the range check requires a real `>=OLDEST <=NEWEST` range of each package that declares the engine peer, and requires a package that does not to keep not declaring it. Spec FR-006 and SC-002 are worded to say so; the engine-release lane raises `NEWEST` in the five that declare it, and the other two follow through the core.

**Rejected**: making the data provider and the Phaser helper declare the engine too. They would then carry a second statement of support that the core already makes, and the one-place rule would be broken.

## R3. Peers on the core need real ranges

**Found**: every package peers on `@relate/contrib-web` at `"*"`, and the gate needs a range it can test against the registry. `pnpm pack` rewrites `workspace:^` in a peer range to `^<version>` (tried in a scratch workspace: a peer `workspace:^` on a package at 0.2.3 packed as `^0.2.3`, and a development dependency `workspace:*` packed as `0.2.3`).

**Decision**: each package declares its peer on the core as an explicit window, `>=<core version at its first release> <1.0.0`, and keeps a `workspace:*` development dependency on the core so the workspace still links it. An explicit window, not `workspace:^`, because a pre-1.0 caret covers one minor only (`^0.1.0` is `>=0.1.0 <0.2.0`), and a core minor would then fall outside every dependent's range.

**Rejected**: `workspace:^` on the peer. It would be rewritten to a caret that a core minor leaves.

## R4. Changesets with pre-1.0 packages

**Found**: the changesets tool bumps a dependent's major version when a package it peers on moves out of the peer range; for a pre-1.0 caret that happens on every core minor. A major bump of a `0.x` package is `1.0.0`, which would be the accidental move to 1.0 that ADR-013 2.7 leaves to the maintainers.

**Decision**: three measures. The peer window of R3 keeps a core minor inside every dependent's range. The tool's option to update peer dependents only when a peer is out of range is turned on. And `check-changes` fails a change that would take any package to `1.0.0` or above unless the maintainers have listed the package as allowed in `.changeset/config.json` (a deliberate step, not a rule about when). Packages that are still private are versioned (the tool's default) and published only once `private` is removed.

**Rejected**: a hand-written version script. The tool already writes changelogs and updates dependents.

## R5. Where tested engine releases are recorded

**Found**: the hourly look needs to know which engine releases have been tested. A committed file would need pushes to the protected main branch; an Actions cache is not durable; an issue per release is noisy.

**Decision**: a lightweight tag `engine-tested/<version>` on the commit tested, created by the run with the workflow's own token (permission to write contents) after a release has been run, pass or fail. The engine-release lane lists the registry's versions and the tags and tests the difference. The tag pattern is outside the version-tag rule, so branch and tag protection are unaffected.

**Rejected**: a committed list, an issue per release, a cache.

## R6. Trusted publishing, and what the runner needs

**Found**: ([npm's trusted-publishers page](https://docs.npmjs.com/trusted-publishers), [the announcement of general availability](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/), [`npm trust`](https://docs.npmjs.com/cli/v11/commands/npm-trust)) trusted publishing needs npm 11.5.1 or later and Node 22.14 or later, the `id-token: write` permission, and a GitHub-hosted runner; the package names the repository, the workflow file and (optionally) an environment as its trusted publisher; provenance is generated automatically when publishing this way. A runner's bundled npm can be older than 11.5.1, which produces a misleading not-found error. The pages do not say whether a package must exist before its trusted publisher is set, and the maintainers have decided that each first release is by hand, so it is not relied on.

**Decision**: the release job installs a pinned npm of 11.5.1 or later, publishes with `npm publish` from the tarball `pnpm pack` made (so workspace ranges are rewritten), and authenticates only by the OIDC token. The job checks the npm version first and stops with a clear message if it is older. The first-release procedure says to configure each package's trusted publisher with the workflow file `release.yml` and the environment `npm-publish`.

**Rejected**: `pnpm publish` directly, because the choice of the publishing client then depends on the package manager's own version of the OIDC flow; and a stored token as a fallback, which ADR-013 2.6 excludes.

## R7. How a version tag names a package

**Found**: packages are versioned independently, so one tag cannot say what to publish; the changesets tool names tags `<package name>@<version>`.

**Decision**: a release is started by a tag `<package name>@<version>`, for example `@relate/contrib-web@0.1.0`, on a protected branch. `parse-tag` rejects a tag whose package does not exist, whose version differs from the package's manifest at that commit, or that is not on a protected branch's history. One tag releases one package; a dependent released later is judged by the gate against what is then on the registry, which is why the core's tag goes first.

**Rejected**: one tag for a whole release. It would need a list of what to publish stored somewhere, and a tag for one package would then mean something else.

## R8. The rehearsal and the switch for real publishing

**Decision**: `release.yml` has two entries. A manual start with a package chosen (or "all") is always a rehearsal: it builds, runs the checks and the gate, packs, prints the plan, and has no `id-token` permission and no environment. A push of a version tag is a real release only when a repository variable `PUBLISHING_ENABLED` is `true`; otherwise it runs as a rehearsal and says why. The switch is a variable, not a file, so that turning publishing on is not itself a change to the workflow.

## R9. The approval gate

**Decision**: the engine-release lane's step that raises ranges and opens the proposed change runs in a job that names a protected environment, `engine-release-approval`, with required reviewers set in the repository's settings. A job that names such an environment waits for approval before it starts, and no repository file can require approval by itself, so the quickstart and `docs/releasing.md` say how the environment is set up, and `check-publishable`'s sibling check for the workflows confirms the job names the environment.

## R10. Reusing the drift check's issue mechanism

**Found**: `drift.yml` holds the issue logic inline (label, one open issue with a given title, comment on repeat).

**Decision**: extract it into a composite action, `report-failure`, taking a title, a label, a colour, a description and a body, and use it from `drift.yml` unchanged in behaviour and from the engine-release lane with its own title (`Engine release <version> breaks packages`) and label. One issue per engine release, so a repeat failure comments on it.

## R11. The engine-release lane before the engine is published

**Decision**: the lane's logic is in scripts that take their inputs (a list of registry versions, the tags, the results) as arguments or from a stand-in registry, so the unit tests run it against recorded releases. `use-engine` points a checkout at a release by editing the override and catalog in the runner's copy of the workspace only. Until the engine is published the registry look finds nothing and the lane does nothing; the first real release is the first real run.

## R12. Canary tests

**Found**: the data provider's `engine-assumptions.test.ts` runs the statements it relies on against the in-process engine in Node. The core's tests already reach the engine in Node through an in-process helper and in browsers through the real client.

**Decision**: the core's file covers in Node the result envelope's shape, that an engine error arrives in the result, how a trapped instance behaves (a statement with about a thousand nested parentheses), and the constraints and parameter handling it uses; the stores (origin-private storage) need a browser, so the file names the existing application-graph browser tests as the check for them and the engine-release lane runs them. The Phaser helper's file checks the envelope shape its queue depends on. Each adapter's file checks that the core's file exists and lists the behaviours the adapter relies on, with a title for each.
