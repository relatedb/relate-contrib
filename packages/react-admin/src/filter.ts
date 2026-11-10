// Turning react-admin's filter, sort and page into statement text and bound parameters. This is the only place a name
// is interpolated, and only after it has been found in the normalised schema; every value is a parameter (FR-006).
import { badRequest } from "./errors.js";
import type { FieldSchema, NormalizedResource, NormalizedSchema } from "./schema.js";

export type Params = Record<string, unknown>;

export interface Filter {
  /** Terms to join with AND; empty when the filter selects everything. */
  terms: string[];
  params: Params;
}

/** The node alias used in every statement. */
export const NODE = "n";

const TICK = String.fromCharCode(96);

/** A schema name, backtick-quoted. Names were checked against the schema's pattern, so a backtick cannot occur; doubling it is a guard. */
export const quote = (name: string): string => TICK + name.split(TICK).join(TICK + TICK) + TICK;

const SUFFIXES: Record<string, string> = { gte: ">=", lte: "<=", neq: "<>", lt: "<", gt: ">" };
const SUFFIX = /^(.+)_(gte|lte|neq|lt|gt)$/;

/** Convert a filter value to the field's declared type, or reject with 400 (FR-008). */
export function coerce(resource: string, field: FieldSchema, value: unknown): string | number | boolean {
  const fail = (): never => {
    throw badRequest(`filter on "${resource}.${field.name}": expected a ${field.type}, got ${JSON.stringify(value)}`);
  };
  switch (field.type) {
    case "string":
      return typeof value === "string" ? value : fail();
    case "number":
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
      return fail();
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      return fail();
  }
}

/** Build the where terms and parameters of a filter object, following the conventions in contracts/provider-api.md. */
export function buildFilter(schema: NormalizedSchema, resource: NormalizedResource, filter: Record<string, unknown> | undefined): Filter {
  const terms: string[] = [];
  const params: Params = {};
  let count = 0;
  const bind = (value: unknown): string => {
    const name = `p${count++}`;
    params[name] = value;
    return `$${name}`;
  };
  const where = `"${resource.name}"`;

  for (const [key, value] of Object.entries(filter ?? {})) {
    if (key === "q") {
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "string") throw badRequest(`filter "q" on ${where}: expected a string`);
      const searchable = [...resource.fields.values()].filter((f) => f.searchable);
      if (searchable.length === 0) throw badRequest(`filter "q": ${where} has no searchable field`);
      const p = bind(value);
      terms.push("(" + searchable.map((f) => `toLower(${NODE}.${quote(f.name)}) CONTAINS toLower(${p})`).join(" OR ") + ")");
      continue;
    }

    // a key that is itself a declared field or reference is never split into a suffix
    const field = resource.fields.get(key);
    if (field) {
      if (!field.filterable) throw badRequest(`filter "${key}": the field is not filterable on ${where}`);
      if (Array.isArray(value)) {
        terms.push(`${NODE}.${quote(key)} IN ${bind(value.map((v) => coerce(resource.name, field, v)))}`);
      } else if (value === null) {
        terms.push(`${NODE}.${quote(key)} IS NULL`);
      } else {
        terms.push(`${NODE}.${quote(key)} = ${bind(coerce(resource.name, field, value))}`);
      }
      continue;
    }
    const reference = resource.references.get(key);
    if (reference) {
      const target = schema.resources.get(reference.resource)!;
      const edge = `[:${quote(reference.type)}]`;
      const path = (node: string): string => (reference.direction === "out" ? `(${NODE})-${edge}->${node}` : `(${NODE})<-${edge}-${node}`);
      if (value === null || value === undefined) throw badRequest(`filter "${key}" on ${where}: a reference filter needs an id`);
      const idField: FieldSchema = { name: key, type: "string" };
      if (Array.isArray(value)) {
        const ids = value.map((v) => coerce(resource.name, idField, v));
        terms.push(`EXISTS { ${path(`(t:${quote(target.label)})`)} WHERE t.id IN ${bind(ids)} }`);
      } else {
        const id = coerce(resource.name, idField, value);
        terms.push(`EXISTS { ${path(`(:${quote(target.label)} {id: ${bind(id)}})`)} }`);
      }
      continue;
    }

    const m = SUFFIX.exec(key);
    const base = m ? resource.fields.get(m[1]!) : undefined;
    if (m && base) {
      if (!base.filterable) throw badRequest(`filter "${key}": the field "${base.name}" is not filterable on ${where}`);
      if (Array.isArray(value) || value === null || value === undefined) {
        throw badRequest(`filter "${key}" on ${where}: a comparison needs one value`);
      }
      terms.push(`${NODE}.${quote(base.name)} ${SUFFIXES[m[2]!]} ${bind(coerce(resource.name, base, value))}`);
      continue;
    }
    throw badRequest(`unknown filter "${key}" on ${where}`);
  }
  return { terms, params };
}

export interface SortSpec {
  field?: string;
  order?: string;
}

/** The ORDER BY expression list: the requested sort, then `id` ascending as the final key (FR-010). Checks the name first. */
export function buildOrder(resource: NormalizedResource, sort: SortSpec | undefined): string {
  const id = `${NODE}.${quote("id")}`;
  const field = sort?.field;
  if (field === undefined || field === "") return `${id} ASC`;
  const declared = resource.fields.get(field);
  if (!declared || !declared.sortable) {
    throw badRequest(`cannot sort "${resource.name}" by "${field}": the field is not declared sortable`);
  }
  const direction = String(sort?.order ?? "ASC").toUpperCase();
  if (direction !== "ASC" && direction !== "DESC") throw badRequest(`the sort order must be ASC or DESC (got ${JSON.stringify(sort?.order)})`);
  if (field === "id") return `${id} ${direction}`;
  return `${NODE}.${quote(field)} ${direction}, ${id} ASC`;
}

export interface PageSpec {
  page?: number;
  perPage?: number;
}

/** SKIP and LIMIT from a page: positive integers; they go in as bound parameters. */
export function buildPage(pagination: PageSpec | undefined): { skip: number; limit: number } {
  const page = pagination?.page ?? 1;
  const perPage = pagination?.perPage ?? 25;
  if (!Number.isInteger(page) || page < 1) throw badRequest(`the page must be a positive integer (got ${JSON.stringify(pagination?.page)})`);
  if (!Number.isInteger(perPage) || perPage < 1) throw badRequest(`perPage must be a positive integer (got ${JSON.stringify(pagination?.perPage)})`);
  return { skip: (page - 1) * perPage, limit: perPage };
}
