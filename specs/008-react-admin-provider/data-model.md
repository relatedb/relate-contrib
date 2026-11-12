# Data Model: The react-admin Data Provider

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-10

## Schema

What the caller declares; validated when the provider is created (FR-003).

| Part | Fields | Rule |
|---|---|---|
| Schema | `resources`: map from resource name to Resource | At least one resource. Resource names are the names react-admin uses (`<Resource name>`). |
| Resource | `label`, `fields`, `references` | `label` is the node label. |
| Field | `name`, `type`, `sortable`, `filterable`, `searchable` | `type` is `string`, `number` or `boolean`. Names, labels and relationship types match `[A-Za-z_][A-Za-z0-9_]*`; they are still quoted in every statement. The flags default to false. `searchable` applies to `string` only. |
| Reference | `field`, `resource`, `type`, `direction` | `field` is the record's reference field and must not collide with a declared field. `resource` names another resource. `type` is the relationship type. `direction` is `out` (the node points to the target) or `in`. Many-to-one: at most one relationship of that type per node. |

`id` is implicitly present on every resource: a `string` field, sortable and filterable, not listed and not redeclarable. Each resource label also carries an implicit uniqueness constraint on `id`, `rel_<Label>_id`, which the package creates (`ensureSchema`, research R3) and which owns the lookup index.

A malformed schema (unknown reference target, a name outside the pattern, a duplicate field, a flag on an unsupported type) throws when `createDataProvider` or `ensureSchema` is called, naming the resource and field.

## Record

What react-admin sees for a resource:

| Key | Value |
|---|---|
| `id` | The node's `id` property, a string. |
| each declared field | The node's property, or `null` when the node has none (R5). |
| each reference field | The target node's `id`, or `null` when there is no relationship of that type. |

No engine node id, element id or label appears.

## Provider calls and the statements behind them

| Call | Statements | Zero-row follow-up |
|---|---|---|
| `getList` | one data, one count | none (an empty page is valid) |
| `getOne` | one data, matching `id` | none: no row is 404 |
| `getMany` | one data, `id IN $ids` | none: missing ids are left out |
| `getManyReference` | as `getList`, reference filter fixed to the target `id` | none |
| `create` | one write (matching every supplied target; the constraint rejects a duplicate `id`) | one read to name a missing target |
| `update` | one write (matching the node and every supplied target) | one read to name the cause |
| `updateMany` | one write (the `update` form over `id IN $ids`) returning the ids it changed | none: ids without a node are left out of the result |
| `delete` | one write (detach delete) | none: no row is 404 |
| `deleteMany` | one write with `id IN $ids` | none |

The statement forms are in [contracts/statements.md](contracts/statements.md). `updateMany` and `deleteMany` are one statement each, so they are atomic over all ids (FR-012); the result lists the ids that matched. A reference in `updateMany` data whose target is missing matches nothing and rejects with 400 after the same read as `update`.

## Errors

A thrown `ProviderError` (an `Error` with `status` and `message`):

| Cause | `status` |
|---|---|
| undeclared sort or filter field; value that does not convert; unsupported or empty data; reference target missing; duplicate `id` on create (constraint violation); a constraint that cannot be created | 400 |
| no node for `id` on `getOne`, `update`, `delete` | 404 |
| the engine reports an error in the envelope | 400, with the engine's message |
| client status `failed` | 503, with the client's failure message (`diagnostic.reason` and text) |
| a statement exceeds `timeoutMs`, or the core rejects `lost` or `failed` | 503, saying the statement timed out or the client's message |

## Demo data

The demo's graph (seed in `demos/react-admin/src/seed.json`):

| Resource | Label | Fields | References |
|---|---|---|---|
| companies | `Company` | `name` (string; sortable, filterable, searchable), `industry` (string; sortable, filterable), `founded` (number; sortable, filterable) | none |
| people | `Person` | `name` (string; sortable, filterable, searchable), `title` (string; filterable, searchable), `age` (number; sortable, filterable), `active` (boolean; filterable) | `company` → companies, `WORKS_AT`, out |
| projects | `Project` | `name` (string; sortable, filterable, searchable), `status` (string; sortable, filterable), `budget` (number; sortable, filterable) | `company` → companies, `OWNED_BY`, out; `lead` → people, `LED_BY`, out |

Counts: 6 companies, 50 people, 10 projects. The application is `react-admin-demo`, version 1.
