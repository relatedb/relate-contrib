# Contract: statement forms

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md)

The shapes the provider builds. `` `Label` ``, `` `f` `` and `` `T` `` are schema names, accepted only after the schema check and then backtick-quoted; every value is a parameter. "Verified" means the form ran against the engine in [../probes/](../probes/); the rest are **Confirm** (research R6 to R8 and the open items) and have an early task.

## Reads

**List, data** (one statement):

```
MATCH (n:`Label`)
WHERE <filter terms, each a parameter>
WITH n ORDER BY n.`sort` <ASC|DESC>, n.`id` ASC SKIP $skip LIMIT $limit
OPTIONAL MATCH (n)-[:`T0`]->(t0:`Target0`)
WITH n, head(collect(t0.id)) AS ref0
RETURN n, ref0 ORDER BY n.`sort` <ASC|DESC>, n.`id` ASC
```

The page is taken before the references are filled, so the fill touches one page of nodes. Verified: skip and limit parameters, the fill with `head(collect())`, paging with a fill. **Confirm**: `ORDER BY n.<field>` after the aggregating `WITH` (fallback: carry the sort values through the `WITH`).

**List, count** (one statement): `MATCH (n:`Label`) WHERE <same filter terms> RETURN count(n) AS total`. Verified.

**Filter terms**:

| Convention | Term |
|---|---|
| equality | `n.`f` = $p` |
| membership | `n.`f` IN $p` |
| `_gte` `_lte` `_lt` `_gt` `_neq` | `n.`f` >= $p`, `<= $p`, `< $p`, `> $p`, `<> $p` |
| `q` | `(toLower(n.`f1`) CONTAINS toLower($q) OR toLower(n.`f2`) CONTAINS toLower($q))` |
| reference, one id | `EXISTS { (n)-[:`T`]->(:`Target` {id: $p}) }` (verified) |
| reference, several ids | `EXISTS { (n)-[:`T`]->(t:`Target`) WHERE t.id IN $p }` (**Confirm**; fallback an OR of the single form) |

Verified: equality, `IN`, numeric and string comparison, contains with `toLower`.

**One and many**: `getOne` and `getMany` are the list data statement with `n.`id` IN $ids` and no paging; `getManyReference` is the list statements with the reference term fixed.

## Writes

**Constraint** (once per resource label, before the first data statement; verified): `CREATE CONSTRAINT `rel_Label_id` IF NOT EXISTS FOR (n:`Label`) REQUIRE n.`id` IS UNIQUE`.

**Create** (matching every supplied target; a duplicate `id` is rejected by the constraint; verified for one and for no target, and the constraint's rejection):

```
MATCH (t0:`Target0` {id: $r0})            -- one MATCH per supplied reference
CREATE (n:`Label` {id: $id}) SET n += $props
CREATE (n)-[:`T0`]->(t0)
RETURN n.id AS id
```

With no reference: `CREATE (n:`Label` {id: $id}) SET n += $props RETURN n.id AS id`.

**Update** (matches the node and every supplied target first, so a missing target changes nothing; verified for one and for two references):

```
MATCH (n:`Label` {id: $id}), (t0:`Target0` {id: $r0})
SET n += $props
WITH n, t0 OPTIONAL MATCH (n)-[o0:`T0`]->(:`Target0`) DELETE o0
WITH DISTINCT n, t0 CREATE (n)-[:`T0`]->(t0)
RETURN n.id AS id
```

A reference supplied as `null` or empty drops its target match and its `CREATE`, keeping the `DELETE` (verified: "clear ref"). A write with no reference is `MATCH (n:`Label` {id: $id}) SET n += $props RETURN n.id AS id`. `updateMany` uses `n.`id` IN $ids` in place of the equality, and the same statement then applies to every matched node. A `null` in `$props` removes the property (verified).

A `create` or `update` is followed by one read of the record (the one-and-many form), so the answer carries the references as they are stored; the write itself is one statement.

**Delete**: `MATCH (n:`Label`) WHERE n.`id` IN $ids WITH n, n.`id` AS removed DETACH DELETE n RETURN removed` (verified: it answers the ids removed, leaves out ids that do not exist, and removes the node's relationships; `probes/writes-forms.mjs`).

## Cause statements (after a write returns no rows)

One read per cause check, in this order, each a parameterised `MATCH … RETURN count(…)`: the node exists (no: 404, `update` only); each supplied target exists (no: 400 naming the field). The causes are checked only to name the error; nothing is written. A duplicate `id` needs no read: the engine's `ConstraintValidationFailed` maps to 400.

## What the provider never builds

A statement from a name that was not declared; a value interpolated into text; a statement per page row; a transaction (the client has none).
