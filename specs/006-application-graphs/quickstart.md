# Quickstart: validating application graphs

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-09

How to run each check once implementation exists. The commands are added to `packages/web/package.json` and the repository root by the first tasks; names follow the adapters' (`test:astro`, `test:astro-browsers`, `test:astro-trace`).

## Prerequisites

```sh
git submodule update --init vendor/relate
pnpm run build:wasm
pnpm install
pnpm -r build
```

Playwright's browsers are installed as for the core's own browser tests.

## 1. Unit tests (Node, the real engine in memory)

```sh
pnpm test:application
```

Covers option validation, the classifier, the marker statements, the migration runner and `inRanges`, loss detection and the export and import round trip (stories 1 to 5; FR-001 to FR-013, FR-021 to FR-023). Expect every test green and none skipped.

## 2. Browser tests (Chromium, Firefox, WebKit)

```sh
pnpm test:application-browsers
```

Covers what needs the store: durability under worker termination and tab closure, a second tab waiting, the recovery states, memory modes, `pagehide`, two clients, and the restore comparison (stories 1, 2, 4, 6; FR-010, FR-014 to FR-020, FR-024, FR-025). Expect three browsers each green. The restore comparison and each recovery figure are written to `packages/web/reports/application-*.json` with method and environment; a figure from one run is labelled as such.

## 3. Trace

```sh
pnpm test:application-trace
```

Fails if any FR or SC in the specification has no `// covers-app:` tag or a tagged test did not pass (FR-029).

## 4. The core's existing checks still pass (FR-027, SC-008)

```sh
pnpm test:unit
pnpm test:browsers
pnpm test:conformance
pnpm test:astro
pnpm test:next
pnpm test:observable
pnpm test:sveltekit
```

Expect them unchanged from `main`.

## 5. Open items (story 7)

After the suites above, `design/adr/ADR-009-application-graphs-in-the-core.md` §6 has a dated entry for each of: typed detection of each loss kind (answered in planning, re-checked in the browsers), the reopen sequence after a replaced worker in Chromium, the retry duration in application mode, and whether an index persists across a reopen, and a list of engine gaps for upstream. A missing entry is a failed task.

## Manual check of a page

The harness page at `packages/web/tests/application/browser/harness/` opens an application client with a seed, shows `status` and `storage`, lets a tester add a record, reload, open a second tab, export and import. It is a test fixture, not a deliverable for sites.
