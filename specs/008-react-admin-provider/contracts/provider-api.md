# Contract: the package's exports

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

Names are those ADR-008 and the spec fix (`createDataProvider`, `ensureSchema`); the remaining names are working names, chosen at implementation.

## Exports of `@relate/react-admin`

```ts
export function createDataProvider(
  client: ProviderClient,
  schema: Schema,
  options?: { onStatement?: (statement: string, params: object) => void },
): DataProvider;                         // react-admin's DataProvider type

export function ensureSchema(client: ProviderClient, schema: Schema): Promise<void>;

export type ProviderClient = Pick<Client, "query" | "status" | "diagnostic">;   // Client from @relate/web
export interface Schema { resources: Record<string, ResourceSchema>; }
export interface ResourceSchema { label: string; fields: FieldSchema[]; references?: ReferenceSchema[]; }
export interface FieldSchema { name: string; type: "string" | "number" | "boolean"; sortable?: boolean; filterable?: boolean; searchable?: boolean; }
export interface ReferenceSchema { field: string; resource: string; type: string; direction?: "out" | "in"; }
export class ProviderError extends Error { status: 400 | 404 | 503; }
```

`ensureSchema` creates the uniqueness constraint on `id` for each resource label (`CREATE CONSTRAINT rel_<Label>_id IF NOT EXISTS FOR (n:`Label`) REQUIRE n.`id` IS UNIQUE`); it is idempotent. `createDataProvider` runs it once, memoised, before the first data statement, so a caller need not; it is exported for a caller that wants the cost at startup. A failure (for example a store that already holds duplicate ids) rejects with 400 naming the resource and is not memoised. The package creates no separate index on `id`: one on the same property stops the constraint from being created, so a store that has one must drop it. The package imports nothing from `react-admin` at run time (the `DataProvider` type only) and nothing from the core but types.

## Calls

Parameters and results are react-admin's own for each method; this table gives only what the provider decides.

| Call | Parameters read | Result | Rejects |
|---|---|---|---|
| `getList(resource, { pagination, sort, filter })` | `page`, `perPage`; `field`, `order`; filter object | `{ data, total }` | 400: undeclared sort or filter name, value that does not convert |
| `getOne(resource, { id })` | `id` | `{ data }` | 404 |
| `getMany(resource, { ids })` | `ids` | `{ data }` (found records, in the order of the engine's result) | |
| `getManyReference(resource, { target, id, pagination, sort, filter })` | as `getList`, `target` is a reference field | `{ data, total }` | 400: `target` is not a declared reference |
| `create(resource, { data })` | `data` | `{ data }` (the created record) | 400: only undeclared fields, missing target, duplicate `id` (constraint violation) |
| `update(resource, { id, data, previousData })` | `data` (`previousData` ignored) | `{ data }` (the updated record) | 404, 400 |
| `updateMany(resource, { ids, data })` | | `{ data: ids }` (ids changed) | 400 |
| `delete(resource, { id })` | `id` | `{ data: { id } }` | 404 |
| `deleteMany(resource, { ids })` | | `{ data: ids }` (ids removed) | |

Every call first checks `client.status`: `failed` rejects 503 with `client.diagnostic` text and no statement is sent. Other statuses send the statement; the core's client holds it until it is ready.

## Filter conventions

Fixed by the package (ADR-008 2.3, FR-007 to FR-009). A filter object key is processed in this order:

1. `q`: case-insensitive contains over the searchable string fields, joined by OR.
2. A key that equals a declared field name (or `id`, or a reference field): equality; an array value is membership. A reference field tests the target's `id`.
3. A key that ends in `_gte`, `_lte`, `_neq`, `_lt` or `_gt` whose remainder is a declared filterable field: the comparison.
4. Anything else rejects with 400.

Values are coerced to the field's declared type: a number field accepts a number or a numeric string, a boolean field accepts a boolean or `"true"` and `"false"`, a string field accepts a string. A filter that is not allowed on the field (not declared `filterable`) rejects with 400, as does a sort on a field not declared `sortable`.

## `onStatement`

Called once per statement, immediately before it is sent, with the statement text and the parameter object. It is a read-only observer: a throwing callback is caught and ignored so display code cannot break a data call.

## Peer and dependency rules

- Peers: `react-admin` ^5 (types), `@relate/web` (types).
- No dependency on the vendored engine path or on any repository file (FR-031); the contract tests may use `@relate/relate-wasm` as a dev dependency.
