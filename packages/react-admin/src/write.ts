// Splitting the `data` of a create or update into what the schema declares: properties, references, and the rest
// (FR-016). Values are converted to the declared types; `undefined` means not supplied and `null` means clear.
import { badRequest } from "./errors.js";
import { coerce, type Params } from "./filter.js";
import type { FieldSchema, NormalizedResource } from "./schema.js";

export interface WriteData {
  /** A supplied `id`, for a create; an `id` in an update's data is ignored. */
  id?: string;
  /** Declared fields to set; a `null` removes the property. */
  props: Params;
  /** Supplied reference fields: the target's id, or `null` to remove the relationship. */
  refs: Map<string, string | null>;
  /** Keys the schema does not declare; they are ignored. */
  undeclared: string[];
}

const ID_AS_STRING: FieldSchema = { name: "id", type: "string" };

export function splitData(resource: NormalizedResource, data: Record<string, unknown> | undefined, creating: boolean): WriteData {
  const out: WriteData = { props: {}, refs: new Map(), undeclared: [] };
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined) continue;
    if (key === "id") {
      if (creating && value !== null && value !== "") {
        out.id = String(coerce(resource.name, ID_AS_STRING, value, "value"));
      }
      continue;
    }
    const field = resource.fields.get(key);
    if (field) {
      out.props[key] = value === null ? null : coerce(resource.name, field, value, "value");
      continue;
    }
    if (resource.references.has(key)) {
      out.refs.set(key, value === null || value === "" ? null : String(coerce(resource.name, { name: key, type: "string" }, value, "value")));
      continue;
    }
    out.undeclared.push(key);
  }
  if (out.undeclared.length > 0 && Object.keys(out.props).length === 0 && out.refs.size === 0) {
    throw badRequest(`no declared field in the data for "${resource.name}" (ignored: ${out.undeclared.join(", ")})`);
  }
  return out;
}
