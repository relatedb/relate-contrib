# Data Model: The Graph Catalog

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-10

## Catalog file

`relate-web/catalog.json` in the origin-private root. UTF-8 JSON, schema in [contracts/catalog-file.schema.json](contracts/catalog-file.schema.json).

| Field | Type | Rule |
|---|---|---|
| `format` | integer | `1`. A larger value makes every application open fail `store-newer`; a missing or non-integer value makes the file unreadable. |
| `graphs` | object | Map from store name to Entry. Keys are the engine's store names: `app-<name>` (name matches `[A-Za-z0-9_-]{1,60}`) or `rel-<id>` (id matches `[A-Za-z0-9_-]{1,48}`). |

## Entry

| Field | Applies to | Type | Rule |
|---|---|---|---|
| `kind` | both | `"application"` or `"cache"` | Must agree with the key's prefix. |
| `name` | both | string | The application name or descriptor `id`; the key without its prefix. |
| `state` | both | string | See States. |
| `updatedAt` | both | ISO 8601 string | Time of the last state change; identifies a write for the removal restore check. |
| `version` | application | positive integer | Schema version as of the last completed seed or migration step. |
| `target` | application, `migrating` only | positive integer | The version being migrated to; greater than `version`. |
| `seeded` | application | boolean | True when the seed or import that last filled the store held at least one node. |
| `revision` | cache | non-empty string | The descriptor's revision as of the last complete load. |

An entry carries no last-opened time. Unknown extra fields are preserved on rewrite and ignored on read.

## States

| State | Kind | Meaning |
|---|---|---|
| `ready` | both | The last operation finished. |
| `seeding` | application | A first run started and was not confirmed finished. |
| `migrating` | application | A migration step to `target` started. |
| `importing` | application | An import started. |
| `resetting` | application | `resetApplication()` started. |
| `loading` | cache | A cache load started. |
| `removing` | both | A removal started. |

## Transitions

Each row is two catalog writes around the data operation (the first before the data changes, the second after). A crash between them leaves the first.

| Operation | Before | After |
|---|---|---|
| Application first run | `seeding` (`version` = code's, `seeded` = seed has nodes) | `ready` |
| Migration step to *n* | `migrating` (`version` = n−1, `target` = n) | `ready` (`version` = n) |
| Import | `importing` | `ready` (`version` = envelope's, `seeded` = document has nodes); migration steps follow if below the code's |
| `resetApplication()` | `resetting` | `ready` (code's version, `seeded` as in a first run) |
| Cache load | `loading` | `ready` (`revision`) |
| Removal | `removing` (new `updatedAt`) | entry deleted |

## Classification (application)

Inputs: the entry (or none), `hasNodes`, `hasIndexes` (read from the node count and the index list, and only when needed, see research R3), the code's `version`, and the catalog `format`. Output: one action. The full table is spec FR-010; this adds the order the checks run in:

1. Catalog unreadable → `store-unreadable`. Catalog `format` above 1 → `store-newer`.
2. No entry: store empty → first run; store has nodes or indexes → `store-unmarked` (message names the `_RelateApplication` label if a node carries it).
3. Entry with an unknown `state` or a malformed field → `store-unreadable`.
4. Entry `version` above the code's, or a `migrating` entry whose `target` is above it (a migration this code cannot finish, possibly part applied) → `store-newer`.
5. By `state`: `seeding`, `resetting` → reset and seed; `importing` → `import-interrupted`; `removing` → finish removal, first run; `migrating` → resume from `version`; `ready` → `seeded: true` over an empty store is `store-lost`, otherwise open (equal) or migrate (below).

## Listing item

| Field | Meaning |
|---|---|
| `store` | The store name. |
| `kind`, `name`, `state`, `version`/`revision` | From the entry; absent for an unregistered directory. |
| `registered` | An entry exists. |
| `present` | The directory `relate/<store>` exists. |
| `status` | `ok`, `unregistered` (directory, no entry) or `missing` (entry, no directory). |
| `size`, `modified` | Only with `{ sizes: true }`: sum of the slot files' sizes in bytes and the newest modification time, from the directory. |

## Failure reasons

The set of ADR-009 is unchanged except: `store-lost` is added; `store-unmarked` now means "data and no entry"; `store-unreadable` also covers an unreadable catalog or entry; `store-newer` also covers a catalog `format` above 1.
