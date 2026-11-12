# @relate/react-admin

A [react-admin](https://marmelab.com/react-admin/) data provider over a client of [`@relate/web`](../web/README.md): lists with sorting,
filters and paging, records with references, and writes, all as parameterised statements over the embedded graph. A team that
declares its resources gets react-admin's lists, filters, edit forms and relation pickers over a graph, with no server.

The package holds no interface components and no hosting code. It works over any client of the core (`createClient`,
`createSiteClient`, or an adapter's helper). The decisions are in `design/adr/ADR-008`; the specification is
`specs/008-react-admin-provider/`; a runnable use is [`demos/react-admin`](../../demos/react-admin/README.md).

## Install

```sh
pnpm add @relate/react-admin @relate/web @relate/relate-wasm react-admin
```

`react-admin` (^5) and `@relate/web` are peer dependencies, used as types only; the package has no runtime dependency.

## Use

```ts
import { createClient } from "@relate/web";
import { createDataProvider, type Schema } from "@relate/react-admin";

const schema: Schema = {
  resources: {
    companies: {
      label: "Company",                                   // the node label
      fields: [
        { name: "name", type: "string", sortable: true, filterable: true, searchable: true },
        { name: "founded", type: "number", sortable: true, filterable: true },
      ],
    },
    people: {
      label: "Person",
      fields: [{ name: "name", type: "string", sortable: true, filterable: true, searchable: true }],
      references: [{ field: "company", resource: "companies", type: "WORKS_AT" }],   // a person works at one company
    },
  },
};

const client = createClient({ engineUrl, navigation: "client-routing", application: { name: "my-app", version: 1, seed } });
const dataProvider = createDataProvider(client, schema, { onStatement: (statement, params) => console.log(statement, params) });
// <Admin dataProvider={dataProvider}>…</Admin>
```

### The schema

Every resource is declared; a name that is not declared never reaches a statement.

- A **resource** has a node `label`, its `fields` and its `references`. Names, labels and relationship types match
  `[A-Za-z_][A-Za-z0-9_]*`. A malformed schema throws a `SchemaError` when the provider is created, naming the resource and field.
- A **field** has a `type` (`string`, `number` or `boolean`) and the flags `sortable`, `filterable` and `searchable` (a string
  field only). A flag that is not set is false.
- A **reference** names a record field (`field`), the target `resource`, the relationship `type` and its `direction` (`out`, the
  default, or `in`). A reference is many-to-one: a record has at most one relationship of that type, and the field holds the target's
  `id`. A one-to-many view is the same relationship read from the other side, which is `getManyReference`.
- `id` is on every resource without being declared: a string, sortable and filterable. It is the node's `id` property (ADR-002),
  never the engine's own ids. `create` generates one with `crypto.randomUUID()` when the data has none.

A record is the node's declared properties (`null` for one the node does not have), its `id`, and each reference field holding the
target's `id` (or `null`).

### The uniqueness constraint

The engine does not keep `id` unique on its own. The provider makes one uniqueness constraint per resource label before its
first statement (`CREATE CONSTRAINT … IF NOT EXISTS`, named `rel_<Label>_id`), exported as `ensureSchema(client, schema)` for a
caller who wants the cost at startup. The constraint also owns an index on `id`, so lookups by `id` need nothing else.

- Do **not** create your own index on `id` for a resource. A plain index on the same property stops the constraint from being made,
  and with the core's application mode that means leaving `id` out of its `indexes` option.
- A store that already holds two nodes with the same `id` fails `ensureSchema` with a 400 that names the resource; remove the
  duplicates and the next call tries again.

## Reads

`getList` sends two statements, a page of records and a count. The page is taken first, then each reference field is filled with the
first target's `id`, then the page is ordered again. `getOne` and `getMany` look records up by `id` (`getMany` answers the ones found,
ordered by `id`), and `getManyReference` is `getList` with its `target` reference fixed to the given `id`.

- **Paging**: `page` and `perPage` are positive integers (default page 1, 25 per page); they become `SKIP` and `LIMIT` parameters.
- **Sort**: the field must be declared `sortable` and the order is `ASC` or `DESC`. Whatever the sort, `id` ascending is the last key,
  so a page boundary never repeats or drops a record when the sort field has ties. A node with no value for the field sorts last when
  ascending.
- **Filter**: the filter object's keys are read in this order, and any other key rejects with 400.
  1. `q`: a case-insensitive contains over the `searchable` fields, joined by OR.
  2. A key that is itself a declared field (or `id`, or a reference field): equality; an array is membership. A reference field tests
     the target's `id`. The field must be `filterable`.
  3. A key ending `_gte`, `_lte`, `_neq`, `_lt` or `_gt` whose remainder is a declared `filterable` field: the comparison. A key that
     is itself a declared field is never split, so a field named `rank_gt` is filtered by `rank_gt`.
  - Values are converted to the field's type: a number field takes a number or a numeric string, a boolean field a boolean or `"true"`
    and `"false"`, a string field a string. One that does not convert rejects with 400.

## Writes

Each write is one statement, atomic without a transaction. `create` and `update` then read the record back, so the answer shows the
references as they are stored.

- `create` makes the node with its declared fields and a relationship to each supplied reference target, found by `id`.
- `update` sets the supplied declared fields. For a supplied reference it removes the old relationship of that type and creates the
  new one, in the same statement; `null` or an empty value removes it. A field set to `null` is removed from the node. An `id` in
  the data is ignored.
- `updateMany` and `deleteMany` are one statement over every id and answer the ids that changed or were removed.
- `delete` detach-deletes the node, so records that referenced it show an empty reference afterwards.
- The node and every target are matched before anything changes, so a reference whose target does not exist rejects with 400 naming
  the field and changes nothing. (Deleting the old relationship first would lose it when the new target is missing.)
- Fields that are not in the schema are ignored; data holding only such fields rejects with 400 and names them.

Not supported: many-to-many references, relationship properties, and field types beyond string, number and boolean.

## Errors

A thrown `ProviderError` is an `Error` with a numeric `status`, which is what react-admin's notifications read.

| Cause | `status` |
|---|---|
| an undeclared or not-allowed sort or filter name, a value that does not convert, a missing reference target, a duplicate `id`, data with no declared field, a constraint that cannot be made, a statement the engine refuses | 400 (the engine's message is kept) |
| a record, or a resource, that does not exist | 404 |
| the client's status is `failed`; a statement exceeds `timeoutMs`; the core rejects `lost` | 503 |

When the client has failed the provider sends nothing and throws 503 with the client's reason and message. It never retries; the core
replaces a crashed worker itself.

## Options

- `onStatement(statement, params)`: called once per statement, immediately before it is sent. It is an observer for display; a
  callback that throws is caught and ignored.
- `timeoutMs` (default 10,000): passed to every statement, because the core's `query()` has no timeout of its own. A statement that
  exceeds it makes the core replace the instance and the call reject with 503.

## Figures

[`figures.json`](figures.json) records what was measured, each as a single run on one machine (Apple silicon, Node 24) with its method:

- **Statements.** Once the constraints exist a list costs two statements (the page and the count) and a lookup by `id` one; the first call
  of a provider over three resources adds three constraint statements.
- **A list grows with the records.** A page of 10 sorted by name took 0.7 ms (median) over 50 people and 12 ms over 5,000; the same page
  filtered by company and minimum age took 1.0 ms and 39 ms. The sort runs in the engine over every matching node, so a resource with
  many thousands of records pays for it on each page.
- **A lookup by `id` does not.** `getOne` took 0.08 ms over 5,000 people with the constraint's index and 1.6 ms for the same statement
  with no constraint. That is consistent with the index being used; the engine offers no query plan, so it is not a proof.
- **From a clean checkout to the demo's lists on screen**: install 9.6 s, build 2.9 s, then `dev` to ten rows 1.1 s, 13.6 s in all, with a
  warm package store and the engine's WebAssembly already built (building it from source is not included).

The query figures are measured in Node with the engine in the same process; they are not a claim about a browser worker or about other
data. Regenerate them with `pnpm --filter @relate/react-admin measure`.

## Tests

```sh
pnpm test:react-admin           # the provider against the real engine, and the demo's unit tests (Node)
pnpm test:react-admin-package   # packs the package, the core and the engine, installs them in a clean project, runs a list call
pnpm test:react-admin-trace     # every requirement and success criterion of specs/008 has a passing, tagged test
```

The engine's behaviours that the statements rely on (parameters in `SKIP` and `LIMIT`, `SET +=` with `null`, the constraint, the order of
matching in a write) are tests in `tests/unit/engine-assumptions.test.ts`, so a change in the engine shows up there.
