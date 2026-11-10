// Result rows to records (data-model.md "Record"): the node's declared properties, each reference field filled from
// its column, `null` for anything absent, and nothing of the engine's own ids.
import { refColumn } from "./statements.js";
import type { NormalizedResource } from "./schema.js";

export type Row = Record<string, any>;
export type RaRecord = { id: string } & Record<string, unknown>;

export function toRecord(resource: NormalizedResource, row: Row): RaRecord {
  const properties = (row.n?.properties ?? {}) as Record<string, unknown>;
  const record: RaRecord = { id: String(properties.id) };
  for (const name of resource.fields.keys()) {
    if (name === "id") continue;
    record[name] = properties[name] ?? null;
  }
  [...resource.references.keys()].forEach((field, i) => {
    record[field] = (row[refColumn(i)] as string | null | undefined) ?? null;
  });
  return record;
}
