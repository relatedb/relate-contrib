// The statement forms of contracts/statements.md. Names come from the normalised schema through `quote`; every value is a
// parameter. Reads here; writes are added with the write calls.
import { NODE, quote, type Params } from "./filter.js";
import type { NormalizedResource, NormalizedSchema } from "./schema.js";

export interface Statement {
  statement: string;
  params: Params;
}

/** The name of the column carrying the i-th reference field's target id. */
export const refColumn = (i: number): string => `ref${i}`;

interface SelectOptions {
  terms: string[];
  params: Params;
  order: string;
  /** Present for a page; absent for a lookup by id, which returns every match. */
  page?: { skip: number; limit: number };
}

/**
 * The data statement of a list or a lookup: match, page, then fill each reference field with the first target id
 * (`head(collect())`, so a node with two relationships of the type is still one row), then order again for the output.
 * `RETURN n, ref0, ref1 ...`.
 */
export function selectStatement(schema: NormalizedSchema, resource: NormalizedResource, options: SelectOptions): Statement {
  const params: Params = { ...options.params };
  const where = options.terms.length ? ` WHERE ${options.terms.join(" AND ")}` : "";
  const parts: string[] = [`MATCH (${NODE}:${quote(resource.label)})${where}`];
  if (options.page) {
    parts.push(`WITH ${NODE} ORDER BY ${options.order} SKIP $skip LIMIT $limit`);
    params.skip = options.page.skip;
    params.limit = options.page.limit;
  }

  const carried: string[] = [NODE];
  [...resource.references.values()].forEach((reference, i) => {
    const target = schema.resources.get(reference.resource)!;
    const edge = `[:${quote(reference.type)}]`;
    const node = `(t${i}:${quote(target.label)})`;
    const path = reference.direction === "out" ? `(${NODE})-${edge}->${node}` : `(${NODE})<-${edge}-${node}`;
    parts.push(`OPTIONAL MATCH ${path}`);
    parts.push(`WITH ${carried.join(", ")}, head(collect(t${i}.id)) AS ${refColumn(i)}`);
    carried.push(refColumn(i));
  });
  parts.push(`RETURN ${carried.join(", ")} ORDER BY ${options.order}`);
  return { statement: parts.join("\n"), params };
}

/** The count statement of a list: the same match and filter, `RETURN count(n) AS total`. */
export function countStatement(resource: NormalizedResource, terms: string[], params: Params): Statement {
  const where = terms.length ? ` WHERE ${terms.join(" AND ")}` : "";
  return { statement: `MATCH (${NODE}:${quote(resource.label)})${where} RETURN count(${NODE}) AS total`, params: { ...params } };
}

/** The statement that creates a label's uniqueness constraint on `id` (research R3). */
export function constraintStatement(label: string, name: string): Statement {
  return {
    statement: `CREATE CONSTRAINT ${quote(name)} IF NOT EXISTS FOR (${NODE}:${quote(label)}) REQUIRE ${NODE}.${quote("id")} IS UNIQUE`,
    params: {},
  };
}

// ---- writes (contracts/statements.md "Writes") ----

type Ref = { field: string; type: string; direction: "out" | "in"; target: NormalizedResource };

/** The resource's references that the data supplies, in schema order, with their target resources. */
function supplied(schema: NormalizedSchema, resource: NormalizedResource, refs: Map<string, string | null>): Ref[] {
  return [...resource.references.values()]
    .filter((r) => refs.has(r.field))
    .map((r) => ({ field: r.field, type: r.type, direction: r.direction, target: schema.resources.get(r.resource)! }));
}

const edge = (r: Ref, from: string, to: string, name = ""): string =>
  r.direction === "out" ? `(${from})-[${name}:${quote(r.type)}]->${to}` : `(${from})<-[${name}:${quote(r.type)}]-${to}`;

/**
 * Create a node with a given id, its properties, and a relationship to each supplied target. Each target is matched
 * first, so a missing target creates nothing; a duplicate `id` is refused by the uniqueness constraint.
 * Returns the new id; no row means a target is missing.
 */
export function createStatement(schema: NormalizedSchema, resource: NormalizedResource, id: string, props: Params, refs: Map<string, string | null>): Statement {
  const params: Params = { id, props };
  const targets = supplied(schema, resource, refs).filter((r) => refs.get(r.field) !== null);
  const parts: string[] = [];
  targets.forEach((r, i) => {
    params[`r${i}`] = refs.get(r.field);
    parts.push(`MATCH (t${i}:${quote(r.target.label)} {id: $r${i}})`);
  });
  parts.push(`CREATE (${NODE}:${quote(resource.label)} {id: $id})`);
  parts.push(`SET ${NODE} += $props`);
  targets.forEach((r, i) => parts.push(`CREATE ${edge(r, NODE, `(t${i})`)}`));
  parts.push(`RETURN ${NODE}.${quote("id")} AS id`);
  return { statement: parts.join("\n"), params };
}

/**
 * Update the nodes with the given ids: match the nodes and every non-null target first (a missing target matches
 * nothing and changes nothing), set the properties, remove the old relationship of each supplied reference, then create
 * the new ones. Returns the ids changed; no row means no node matched or a target is missing.
 */
export function updateStatement(schema: NormalizedSchema, resource: NormalizedResource, ids: string[], props: Params, refs: Map<string, string | null>): Statement {
  const params: Params = { ids, props };
  const all = supplied(schema, resource, refs);
  const targets = all.filter((r) => refs.get(r.field) !== null);
  const parts: string[] = [`MATCH (${NODE}:${quote(resource.label)}) WHERE ${NODE}.${quote("id")} IN $ids`];
  targets.forEach((r, i) => {
    params[`r${i}`] = refs.get(r.field);
    parts.push(`MATCH (t${i}:${quote(r.target.label)} {id: $r${i}})`);
  });
  parts.push(`SET ${NODE} += $props`);
  if (all.length > 0) {
    const carried = [NODE, ...targets.map((_, i) => `t${i}`)].join(", ");
    parts.push(`WITH ${carried}`);
    all.forEach((r, k) => {
      parts.push(`OPTIONAL MATCH ${edge(r, NODE, `(:${quote(r.target.label)})`, `o${k}`)} DELETE o${k}`);
      parts.push(`WITH DISTINCT ${carried}`);
    });
    targets.forEach((r, i) => parts.push(`CREATE ${edge(r, NODE, `(t${i})`)}`));
  }
  parts.push(`RETURN ${NODE}.${quote("id")} AS id`);
  return { statement: parts.join("\n"), params };
}

/** Detach-delete the nodes with the given ids; answers the ids removed. */
export function deleteStatement(resource: NormalizedResource, ids: string[]): Statement {
  return {
    statement: `MATCH (${NODE}:${quote(resource.label)}) WHERE ${NODE}.${quote("id")} IN $ids WITH ${NODE}, ${NODE}.${quote("id")} AS removed DETACH DELETE ${NODE} RETURN removed`,
    params: { ids },
  };
}

/** Whether a node with a label and id exists: the cause read after a write that matched nothing. */
export function existsStatement(label: string, id: string): Statement {
  return { statement: `MATCH (x:${quote(label)} {id: $id}) RETURN count(x) AS n`, params: { id } };
}
