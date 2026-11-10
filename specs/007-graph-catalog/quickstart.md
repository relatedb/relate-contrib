# Quickstart: validating the catalog

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-10

How to run each check once implementation exists. The commands are added to `packages/web/package.json` and the repository root by the first tasks; names follow the application ones (`test:application`, `test:application-browsers`, `test:application-trace`).

## Prerequisites

```sh
git submodule update --init vendor/relate
pnpm run build:wasm
pnpm install
pnpm -r build
```

## 1. Unit tests (Node, the real engine, catalog storage in memory)

```sh
pnpm test:catalog
```

Covers the file's parsing and validation, `CatalogStorage` ordering with the in-memory lock, every row of the application classification, the intent-first writes of each operation and their interruption, the cache open rules and the listing's reconciliation (stories 1, 2, 4, 5; FR-001 to FR-016, FR-018).

## 2. Browser tests (Chromium, Firefox, WebKit)

```sh
pnpm test:catalog-browsers
```

Covers what needs a browser: the file and Web Lock across tabs, termination and tab closure, interrupted operations, `store-lost` after a removed directory, listing beside a held store, removal while held, reset (stories 2, 3, 5, 6; FR-005 to FR-009, FR-017 to FR-022). Expect three browsers each green.

## 3. Trace

```sh
pnpm test:catalog-trace
```

Fails if any FR or SC has no `// covers-cat:` tag or a tagged test did not pass (FR-027).

## 4. Existing checks still pass (FR-024, SC-009)

```sh
pnpm test:application
pnpm test:application-browsers
pnpm test:unit
pnpm test:browsers
pnpm test:drift
```

`test:drift` runs every adapter's tests and conformance over the core. Expect all green; only the tests that asserted the marker or the stored copy were rewritten.

## 5. Open items (research)

R3 (probe cost against the restore baselines) and R9 (removal of a held store, per browser) each have a measured entry in `packages/web/reports/catalog-*.json` and, where the answer changes ADR-010, an amendment.

## Manual check of a page

The harness page at `packages/web/tests/catalog/browser/harness/` opens an application client and a descriptor-backed client, shows `status` and `storage`, lists the catalog, and offers remove and reset buttons. A test fixture, not a deliverable.
