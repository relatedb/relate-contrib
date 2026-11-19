# Contract: the workflows

What each workflow is started by, what it needs and what it does. Job names are fixed here; step details are the implementation's.

## release-checks (new)

- **Starts**: on pull requests and on pushes to the main branch.
- **Needs**: no engine, no browsers, no secrets.
- **Does**: installs dependencies, runs `check-publishable`, `check-engine-range`, `check-changes` and the unit tests of the scripts, and fails if any fails. The trace check of the release scripts runs on main.
- **Permissions**: read-only contents.

## release (new)

- **Starts**: a push of a tag matching `@relate/contrib-*@*` (a real release, when the repository variable `PUBLISHING_ENABLED` is `true`; otherwise a rehearsal that says why), or a manual start with a package or `all` (always a rehearsal).
- **Jobs, in order**:
  1. `resolve`: `parse-tag`; stops if the tag does not name an existing package at its manifest version on a protected branch.
  2. `checks`: builds every package, runs the unit, clean-install package and traceability checks of the package to be released, and `check-publishable --release`, `check-engine-range`.
  3. `gate`: `release-gate` for the package (`plan-release` for a rehearsal).
  4. `publish` (real only): environment `npm-publish`; permissions `id-token: write` and read-only contents; checks npm is 11.5.1 or later; `pnpm pack` and `npm publish` of the tarball with public access; no token. Prints the package, version and registry address.
- **A rehearsal**: runs `resolve` or `plan-release`, `checks` and `gate`, prints the plan, and has no `publish` job, no environment and no `id-token` permission.
- **Concurrency**: one release at a time; a second waits and is never cancelled.
- **Refusals**: a package not yet on the registry stops at `gate` with `first-release-is-manual`; the report lists what was and was not published when a step fails.

## engine-release (new)

- **Starts**: a repository dispatch of type `engine-release` carrying the engine release's version in its payload; a schedule every hour; a manual start with a version.
- **Jobs, in order**:
  1. `discover`: `engine-releases` (or the payload's version, if untested); outputs the list; ends the run when it is empty.
  2. `test` (one per engine release, in order): the setup action with the registry as the engine's source, `use-engine`, then every package's unit tests, canary tests, conformance checks and the drift check; writes the results file; creates the tag `engine-tested/<version>`.
  3. `report` (on any failure): the shared reporter with the title and body of `engine-run-report`, under its own label.
  4. `propose` (on all passing): environment `engine-release-approval` (required reviewers); `raise-engine-range`; opens a pull request with the recorded changes, titled for the engine release.
- **Permissions**: read-only contents, plus write for the tag, issues and pull requests where each is used.
- **Secrets**: a token for the engine repository only for the submodule path of the setup action; none for the registry path.

## drift (changed)

Behaviour unchanged. The inline issue step is replaced by the shared reporter with the same title and label.

## full (changed)

Behaviour unchanged. `test:all` gains the release scripts' unit tests and trace check.

## The shared reporter (new composite action `report-failure`)

Inputs: `title`, `label`, `color`, `description`, `body`. Creates the label if missing; if an open issue with that label and exact title exists, comments on it; otherwise opens one. Used by `drift` and `engine-release`.

## Settings that are not files

These are set on the repository host by an administrator, and `docs/releasing.md` says how: a branch protection rule on the main branch; a rule that only the main branch's history can carry the version tags (a tag ruleset on the `@relate/contrib-*@*` pattern); the environments `npm-publish` and `engine-release-approval` with their reviewers; the repository variable `PUBLISHING_ENABLED`; and each package's trusted publisher on the registry (repository, workflow file `release.yml`, environment `npm-publish`), added after its first release.
