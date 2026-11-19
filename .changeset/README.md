# Recorded changes

Each change to a package that affects what it publishes is recorded here as a small file, and versions and changelogs are made from them
(ADR-013 2.6). Record one with `pnpm changeset`: choose the packages the change affects and whether it is a `patch` (a fix), a `minor` (a
feature) or a `major` (a break), and write the summary a user of the package should read.

- A package with no recorded change is not released.
- The engine-release workflow writes a `patch` change for each package whose supported engine range it raises.
- While a package is before 1.0, a `major` change would take it to `1.0.0`. A move to 1.0 is the maintainers' judgement, so the checks
  refuse it unless the package is listed in `allow-1.0.json` in this folder. Add a package there only when you have decided it.
