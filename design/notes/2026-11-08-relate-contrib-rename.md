# The project becomes relate-contrib, and the packages leave the `web-` prefix

*2026-11-08. Non-binding note. Earlier notes keep the names they were written under.*

The engine's website was split out of the engine repository into its own repository, `relatedb/relate-web` (ADR-0517 in the engine repository records it). That repository took the name this project had used since 2026-11-05. This project is the other thing: contributed integrations for RelateDB, web frameworks first, with agent frameworks considered next (see `2026-11-05-agentic-frameworks-survey.md`). It is now `relate-contrib`.

## Package names

The engine's own npm packages are `@relate/relate` (Node), `@relate/relate-wasm` (the engine in the browser) and five `@relate/<os>-<arch>` binaries. The integrations join the same scope and are named for what they do, not for the old project:

| Was | Is | Why |
| --- | --- | --- |
| `@relate/web-core` | `@relate/web` | Hosts the engine in a web page: worker client, loading, fault containment, navigation profiles, and the build-time helpers adapters share. `@relate/browser` was rejected because the engine's documentation already calls `@relate/relate-wasm` the browser package; `@relate/workers` because "workers" reads as Cloudflare Workers, an unsupported runtime here. |
| `@relate/web-astro` | `@relate/astro` | Named for the framework. |
| `@relate/web-next` | `@relate/nextjs` | Follows `@sentry/nextjs`; `@relate/next` could read as "the next version". |

Directories follow: `packages/web`, `packages/astro`, `packages/nextjs`.

## Identifiers and strings

| Was | Is |
| --- | --- |
| `withRelateWeb` (Next config wrapper) | `withRelate` |
| `RelateWebProvider`, `RelateWebProviderProps` | `RelateProvider`, `RelateProviderProps` |
| `RelateWebOptions` (both adapters) | `RelateOptions` |
| `relateWeb()` (Astro integration) | `relate()` |
| `relateWebPlugin` (internal) | `relatePlugin` |
| `/relate-web/<id>/…` (Next data route) | `/relate/<id>/…` |
| `virtual:relate-web/config`, `virtual:relate-web/sources` | `virtual:relate/config`, `virtual:relate/sources` |
| `RELATE_WEB_BASE_PATH`, `RELATE_WEB_NAVIGATION` | `RELATE_NEXTJS_BASE_PATH`, `RELATE_NEXTJS_NAVIGATION` (the engine reserves `RELATE_*`) |

The Astro route `/_relate/`, the `data-relate-graph` marker and the whole `rel-` family (`data-rel-*`, `__rel*`, `rel-<id>` stores, `STORE_PREFIX`) are unchanged. So is `STORED_COPY_DIR`, `"relate-web"`: the stored-copy directory at the origin-private root is named for `@relate/web`, and nothing about it depends on the website's repository name.

## Not part of this change

The engine's own rename is separate work. This repository still depends on `@neo4j-labs/cypherlite-wasm`, the `CypherliteDb` API and the `vendor/cypherlite` submodule; the engine now publishes `@relate/relate-wasm` with `RelateDb`, from `relatedb/relate`. That arrives when the engine pin is bumped.

Nothing was published under any of these names, so no deprecation shims exist.
