// The uniqueness constraint on each resource label's `id` (research R3). The constraint also owns the lookup index, so no
// separate index is created: one on the same property stops the constraint from being made.
import { badRequest } from "./errors.js";
import { execute } from "./exec.js";
import { constraintName, validateSchema, type Schema } from "./schema.js";
import { constraintStatement } from "./statements.js";
import type { ProviderClient, ProviderOptions } from "./types.js";

/**
 * Create one uniqueness constraint on `id` per resource label (`CREATE CONSTRAINT … IF NOT EXISTS`). Idempotent, so it can
 * run on every start. The provider runs it once before its first statement; it is exported for a caller who wants the
 * cost at startup. Rejects 400, naming the resource, when a constraint cannot be made (the store already holds
 * duplicate ids, or a plain index exists on the property).
 */
export async function ensureSchema(client: ProviderClient, schema: Schema, options: ProviderOptions = {}): Promise<void> {
  const normalized = validateSchema(schema);
  for (const resource of normalized.resources.values()) {
    const { statement, params } = constraintStatement(resource.label, constraintName(resource.label));
    const envelope = await execute(client, options, statement, params);
    if (envelope.error) {
      throw badRequest(`could not create the uniqueness constraint on the ids of "${resource.name}" (${resource.label}): ${envelope.error}`);
    }
  }
}
