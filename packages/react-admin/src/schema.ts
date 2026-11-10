// The caller's declaration of resources (data-model.md "Schema"). Validated when a provider is created; the
// normalised form is what every statement is built from, so a name reaches a statement only if it is in it.

export type FieldType = "string" | "number" | "boolean";

export interface FieldSchema {
  name: string;
  type: FieldType;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
}

export interface ReferenceSchema {
  /** The record's reference field; it holds the target's `id`. */
  field: string;
  /** The target resource. */
  resource: string;
  /** The relationship type. */
  type: string;
  /** `out`: the node points to the target. `in`: the target points to the node. Default `out`. */
  direction?: "out" | "in";
}

export interface ResourceSchema {
  /** The node label. */
  label: string;
  fields: FieldSchema[];
  references?: ReferenceSchema[];
}

export interface Schema {
  resources: Record<string, ResourceSchema>;
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

/** A resource with `id` added, fields and references indexed by name and the direction filled in. */
export interface NormalizedResource {
  name: string;
  label: string;
  fields: Map<string, FieldSchema>;
  references: Map<string, Required<ReferenceSchema>>;
}

export interface NormalizedSchema {
  resources: Map<string, NormalizedResource>;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean"]);

/** The implicit field of every resource: a string, sortable and filterable (FR-004). */
export const ID_FIELD: FieldSchema = { name: "id", type: "string", sortable: true, filterable: true };

/** The name of the uniqueness constraint on a label's `id` (research R3). */
export function constraintName(label: string): string {
  return `rel_${label}_id`;
}

/** Check a schema and return its normalised form. Throws a `SchemaError` naming the resource and field. */
export function validateSchema(schema: Schema): NormalizedSchema {
  if (!schema || typeof schema !== "object" || !schema.resources || typeof schema.resources !== "object") {
    throw new SchemaError("a schema needs a `resources` object");
  }
  const names = Object.keys(schema.resources);
  if (names.length === 0) throw new SchemaError("a schema needs at least one resource");

  const resources = new Map<string, NormalizedResource>();
  for (const name of names) {
    const where = `resource "${name}"`;
    const r = schema.resources[name]!;
    if (!r || typeof r !== "object") throw new SchemaError(`${where}: expected an object`);
    if (typeof r.label !== "string" || !IDENTIFIER.test(r.label)) {
      throw new SchemaError(`${where}: the label must match ${IDENTIFIER} (got ${JSON.stringify(r.label)})`);
    }
    if (!Array.isArray(r.fields)) throw new SchemaError(`${where}: \`fields\` must be an array`);

    const fields = new Map<string, FieldSchema>([[ID_FIELD.name, ID_FIELD]]);
    for (const f of r.fields) {
      const at = `${where}, field ${JSON.stringify(f?.name)}`;
      if (!f || typeof f.name !== "string" || !IDENTIFIER.test(f.name)) throw new SchemaError(`${at}: the name must match ${IDENTIFIER}`);
      if (f.name === "id") throw new SchemaError(`${at}: \`id\` is implicit on every resource and cannot be declared`);
      if (fields.has(f.name)) throw new SchemaError(`${at}: declared twice`);
      if (!TYPES.has(f.type)) throw new SchemaError(`${at}: the type must be string, number or boolean (got ${JSON.stringify(f.type)})`);
      for (const flag of ["sortable", "filterable", "searchable"] as const) {
        if (f[flag] !== undefined && typeof f[flag] !== "boolean") throw new SchemaError(`${at}: \`${flag}\` must be a boolean`);
      }
      if (f.searchable && f.type !== "string") throw new SchemaError(`${at}: only a string field can be searchable`);
      fields.set(f.name, { name: f.name, type: f.type, sortable: f.sortable === true, filterable: f.filterable === true, searchable: f.searchable === true });
    }
    resources.set(name, { name, label: r.label, fields, references: new Map() });
  }

  for (const name of names) {
    const r = schema.resources[name]!;
    const resource = resources.get(name)!;
    for (const ref of r.references ?? []) {
      const at = `resource "${name}", reference ${JSON.stringify(ref?.field)}`;
      if (!ref || typeof ref.field !== "string" || !IDENTIFIER.test(ref.field)) throw new SchemaError(`${at}: the field must match ${IDENTIFIER}`);
      if (resource.fields.has(ref.field) || resource.references.has(ref.field)) {
        throw new SchemaError(`${at}: the name is already used by a field or another reference (\`id\` is reserved)`);
      }
      if (!resources.has(ref.resource)) throw new SchemaError(`${at}: the target resource ${JSON.stringify(ref.resource)} is not declared`);
      if (typeof ref.type !== "string" || !IDENTIFIER.test(ref.type)) throw new SchemaError(`${at}: the relationship type must match ${IDENTIFIER}`);
      if (ref.direction !== undefined && ref.direction !== "out" && ref.direction !== "in") {
        throw new SchemaError(`${at}: the direction must be "out" or "in" (got ${JSON.stringify(ref.direction)})`);
      }
      resource.references.set(ref.field, { field: ref.field, resource: ref.resource, type: ref.type, direction: ref.direction ?? "out" });
    }
  }
  return { resources };
}
