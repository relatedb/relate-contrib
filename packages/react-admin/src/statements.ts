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
