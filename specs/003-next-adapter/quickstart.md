# Quickstart: validating the Next.js adapter

**Feature**: [spec.md](spec.md) | **Contracts**: [contracts/](contracts/)

Prerequisites: the repository's usual setup (`CLAUDE.md`, Commands): the engine built, `pnpm install`, `pnpm -r build`.

## 1. Unit and build tests

```sh
pnpm test:next
```

Expect: declaration rules, route builder, catalog, inline lookup and registry tests pass; `next build` fixtures fail with the messages of FR-008, FR-009, FR-012 and FR-014 and succeed for the valid ones, under both bundlers.

## 2. Browser tests

```sh
pnpm test:next-browsers
```

Expect: lifecycle (strict mode on and off), store use by the next page, the direct lookup, hidden pages under `cacheComponents` and the development server pass in Chromium, Firefox and WebKit (the development-server tests may run in one browser).

## 3. Conformance

```sh
pnpm test:next-conformance
```

Expect: the core's scenarios pass for `multi-page` and `client-routing`, in production-server and static-export form, in three browsers.

## 4. Shared code

```sh
pnpm test:unit
pnpm test:astro
pnpm test:astro-conformance
```

Expect: the core's tests for `@relate/web-core/build` pass and the Astro adapter's tests pass unchanged.

## 5. Package test

```sh
pnpm test:next-package
```

Expect: the packed adapter, core and engine install into a clean Next 16 project outside the repository, build with Turbopack and with webpack, and a loaded page returns a query result.

## 6. Trace and the ADR

```sh
pnpm test:next-trace
```

Expect: every FR and SC has a tagged, passing test. Read ADR-005 §6: each question it lists has a dated entry (FR-033).
