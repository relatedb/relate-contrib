# Contract: The catalog operations

**Feature**: [../spec.md](../spec.md) | ADR-010 §2.5, §2.6. Exported from the package entry point. Function names are working names; the behaviour is the contract.

All three run on the page's main thread or in any worker of the origin, need the origin-private file storage and Web Locks, and reject with `unavailable` where either is missing. None opens an engine store.

## `listGraphs(options?)`

`options`: `{ sizes?: boolean }`. Resolves to `{ catalog: "ok" | "missing" | "unreadable" | "newer", items: ListingItem[] }`.

- The catalog is read under the shared lock. `missing` means no file (an origin that stored nothing); `unreadable` and `newer` are as in the data model, and in those cases `items` lists the directories only, each `unregistered`.
- `items` has one item per entry and per directory under `relate/`, joined by store name (shape in the data model). Order: by store name.
- Without `sizes`, no store file is read. With it, each present store's slot files are read for their sizes and modification times.
- A store held by another tab is listed like any other.

## `removeGraph(store, options)`

`store`: the store name (`app-<name>` or `rel-<id>`). `options`: `{ kind: "application" | "cache" }`, required. Resolves to `{ store, kind, entry, discarded }`: `entry` is the entry as it was (null when the store had none) and `discarded` is `"application data"`, `"cache"`, `"unregistered directory"` or `"nothing"`.

1. Under the exclusive lock, read the entry. If it exists and its `kind` differs from `options.kind`, reject `kind-mismatch`. If it does not exist and the directory does, `options.kind` must be `"application"` or `"cache"` and is recorded only in the result.
2. Write the entry `removing` with a new `updatedAt` (if there was an entry).
3. Remove `relate/<store>` recursively. If the files are held, go to the restore step; if the directory does not exist, continue.
4. Under the exclusive lock, delete the entry, if it still says `removing` with the `updatedAt` written in step 2.
5. Restore step: under the exclusive lock, put the entry back as it was before step 2 only if it still says `removing` with that `updatedAt`; otherwise leave the holder's newer entry. Reject `locked`.

Removing an application graph is allowed only when `kind` is stated as `"application"`; the result's `discarded` says so.

## `resetCatalog()`

Deletes `relate-web/catalog.json` under the exclusive lock and nothing else. Resolves to `{ deleted: boolean }`. Afterwards a store holding data and no entry opens as `store-unmarked` (application) or rebuilds (cache).

The call also refuses a name that is not a store the core keeps (`app-<name>` or `rel-<id>`) with `not-a-store`, so a directory the core did not create is never removed by it. A catalog that cannot be used does not stop a removal the caller asked for: the directory goes and no entry is written or deleted.

## Failure names added or changed

`store-lost` (an application entry `ready` with `seeded: true` over an empty store; recovery `resetApplication()`); `store-unmarked` (data and no entry); `store-unreadable` (also an unreadable catalog or malformed entry); `store-newer` (also a catalog `format` above 1). Reasons for the page-callable operations: `unavailable`, `locked`, `kind-mismatch`, `not-a-store`.
