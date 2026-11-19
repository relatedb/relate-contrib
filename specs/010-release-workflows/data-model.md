# Data Model: publishing workflows

The tooling stores nothing of its own beyond the repository; these are the entities its scripts read and write.

## Package manifest (read)

A package's `package.json`: `name`, `version`, `private`, `license`, `repository` (with `directory`), `homepage`, `keywords`, `publishConfig.access`, `files`, `peerDependencies`, `peerDependenciesMeta`.

Rules checked (FR-001 to FR-005): `name` matches `@relate/contrib-<project>`; `license` is `Apache-2.0`; a `LICENSE` file exists in the package's folder and at the repository root; `repository` has a url and a `directory` equal to the package's folder; `homepage` and a non-empty `keywords` exist; `publishConfig.access` is `public`; `files` lists only the build output, the README and the license; no development-only peer is declared; for a release `private` is absent or false.

## Engine range (read and written)

The peer range on `@relate/relate-wasm` of a package that loads the engine, of the form `>=OLDEST <=NEWEST` with both ends full versions.

Rules (FR-006 to FR-008, R2): present in the core and the four adapters, absent in the data provider and the Phaser helper; never `*`; `OLDEST <= NEWEST`; includes the supported engine; `NEWEST` is raised only by `raise-engine-range` and never above a tested engine release; a prerelease is never an end.

## Supported engine (read)

The catalog entry `relate-wasm` in `pnpm-workspace.yaml`. Rules: a full version; equal to the vendored engine package's version when that package is present; inside every declaring package's range.

## Peer window on the core (read)

The peer range on `@relate/contrib-web` in each dependent: `>=FIRST <1.0.0`, where `FIRST` is the core version at the dependent's first release. Rules (R3): `FIRST` is a published or about-to-be-published core version; the upper bound is `<1.0.0` while the core is below 1.0.

## Recorded change (read and written)

A file in `.changeset/`: front matter naming packages and a bump (`patch`, `minor`, `major`), then a summary. Written by `raise-engine-range` for each package it raises (`patch`, summary "Supports engine <version>"). Rules (FR-012, FR-013, R4): names only packages that exist; a package whose published files changed in a change has a record; no record takes a package to `1.0.0` or above unless the package is listed in `.changeset/config.json` under the maintainers' allow list.

## Gate verdict (computed)

For one package and one planned version: `pass`, or `refuse` with a reason from a fixed set: `peer-not-published` (names the package), `peer-out-of-range` (names the versions found), `engine-range-invalid`, `version-exists`, `registry-unreachable`, `first-release-is-manual` (the package is not on the registry).

## Release plan (computed)

An ordered list of `{ package, version, verdict }` in dependency order (the core first; then the others by name), with the mode (`rehearsal` or `release`) and, for a rehearsal, no credential used. For a release started by a tag the list has the one package of the tag.

## Version tag (read)

`<package name>@<version>`, parsed to `{ package, version }`. Rules (R7): the package exists; the version equals the manifest's at the tagged commit; the commit is on a protected branch.

## Engine release (read)

A version of `@relate/relate-wasm` on the registry, with a flag for prerelease or deprecated. States: `untested` (no tag `engine-tested/<version>`), `tested` (the tag exists). Rules (FR-018, FR-021): each is tested once; a prerelease or deprecated release is never tested as a supported one.

## Engine run result (computed)

For one engine release: `{ version, results: [{ package, passed, failures: [test title] }] }`. A package that passed has `NEWEST` raised after approval; any failure produces an issue titled with the engine release and listing the failing test titles, and raises nothing for that package.
