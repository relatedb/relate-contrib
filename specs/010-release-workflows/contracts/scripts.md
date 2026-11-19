# Contract: the release scripts

Every script is run with `tsx scripts/release/<name>.ts`, exits 0 when it passes and non-zero when it fails or refuses, and prints one line per finding to standard error and a short summary to standard output. Each also accepts `--json` to print its result as JSON on standard output. Each root script `release:<name>` wraps one of them. The formats below fix the shape, not final flags.

## check-publishable

```text
check-publishable [--release] [--package <name>]...
```

Checks the manifests (data-model, "Package manifest"). Without `--release` a package that is still `private` is reported `unreleased` and passes; with `--release` it fails. Prints, for each failing package, `<package>: <rule>: <what is missing>`.

## check-engine-range

```text
check-engine-range
```

Checks the engine range of each package that loads the engine, the supported engine in the catalog, that the vendored engine's version equals it when present, and that a package that does not load the engine does not declare the peer. Prints `<package>: range <range> does not include <engine>`, `<package>: peer is "any version"`, or `<package>: expected >=OLDEST <=NEWEST`.

## check-changes

```text
check-changes [--base <git ref>]
```

Compares the working tree with `--base` (default the merge base with main): warns (exit 0, `--strict` fails) for a package whose published files changed with no recorded change; fails when a recorded change or the version change would take a package to `1.0.0` or above and the package is not in the allow list; fails when a recorded change names a package that does not exist.

## release-gate

```text
release-gate --package <name> [--registry <url>] [--version <version>]
```

Judges one package (data-model, "Gate verdict"). The registry address defaults to the public registry and is a flag so that the tests use a stand-in. Prints `pass`, or `refuse <reason>: <detail>`.

## plan-release

```text
plan-release [--package <name>|--all] [--registry <url>] [--rehearsal]
```

Computes the release plan (data-model, "Release plan"): the packages whose version is not on the registry, in dependency order, each with its gate verdict. `--rehearsal` states that no credential is used. Prints the plan as a table and, with `--json`, as JSON.

## parse-tag

```text
parse-tag <tag> [--branch <name>]
```

Parses a version tag to `{ package, version }` and checks it (data-model, "Version tag"). With `--branch` it also checks that the tagged commit is on that branch's history. Prints the package and version, one per line, for the workflow to read.

## engine-releases

```text
engine-releases [--registry <url>] [--tags <file or git>]
```

Lists the untested, non-prerelease, non-deprecated engine releases, oldest first, one per line. With none it prints nothing and exits 0.

## use-engine

```text
use-engine <version>
```

Points the checkout at that engine release from the registry for a run: removes the override that links the vendored build and sets the catalog entry to the version. Edits the working tree only; never committed.

## raise-engine-range

```text
raise-engine-range <version> --passed <package>... 
```

For each named package that declares an engine range, sets `NEWEST` to the version and writes a recorded change (`patch`, "Supports engine <version>"). Refuses a version that is a prerelease, is below the package's `NEWEST`, or is not an engine release. Prints the packages changed and the packages left alone (already at or above the version).

## engine-run-report

```text
engine-run-report <version> --results <file>
```

Reads the run's results and prints the issue title, `Engine release <version> breaks packages`, and the issue body: the run's address, the engine release and, for each failing package, its failing test titles.
