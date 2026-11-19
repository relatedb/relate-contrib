# Quickstart: running and checking the release tooling

Prerequisites: the repository's usual setup (`pnpm install`); for the full checks, the engine built (`pnpm run build:wasm`).

## The fast checks (no engine, no browsers)

```sh
pnpm release:check-publishable            # each package: license, repository, homepage, keywords, publish setting
pnpm release:check-engine-range           # engine ranges against the supported engine in the catalog
pnpm release:check-changes                # recorded changes, and nothing reaching 1.0 by accident
pnpm test:release                         # the scripts' unit tests, against fixtures and a stand-in registry
pnpm test:release-trace                   # every requirement and success criterion has a passing, tagged test (tags are `covers-rel:`)
```

These are what the `release-checks` workflow runs on every pull request.

## Rehearse a release

```sh
pnpm release:plan --all --rehearsal       # the packages that would be published, in order, with each gate verdict
```

On the host: start the `release` workflow by hand for a package or `all`. A rehearsal builds, runs the checks and the gate, packs, and prints the plan. It uses no credential and publishes nothing. Expected today: the core would be listed first and each dependent refused until the core is on the registry.

## Check the engine's canary tests

```sh
pnpm test:engine-assumptions              # every package's engine-assumptions test against the supported engine
```

## Try the engine-release lane against a recorded release

```sh
pnpm test:release                         # includes the lane's decisions against recorded engine releases: a pass, a fail, a release already tested, two at once, a prerelease
```

## The first release of a package (by hand)

Follow `docs/releasing.md`: run the checks above, build and pack the package, and publish it as an administrator of the `@relate` scope; then, on the registry, add the package's trusted publisher (this repository, workflow `release.yml`, environment `npm-publish`). From then on, release it by pushing the tag `<package name>@<version>` on a protected branch.

## When the engine is published

Remove the override that links the vendored engine from `pnpm-workspace.yaml`, keep the catalog entry, and drop the engine submodule from the supported lane's setup. The engine's release job should then send a repository dispatch of type `engine-release` with the new version; until it does, the hourly look finds each release within the hour.
