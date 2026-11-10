// createDataProvider: react-admin's data provider over a core client (contracts/provider-api.md). Reads here; the write
// calls are added next. Every statement goes through `execute`, and nothing is sent before the filter, sort and page
// have been checked against the schema.
import type { DataProvider } from "react-admin";
import { badRequest, fromClientFailure, fromEnvelope, notFound } from "./errors.js";
import { ensureSchema } from "./ensure.js";
import { execute, type ResultEnvelope } from "./exec.js";
import { buildFilter, buildOrder, buildPage, type Params } from "./filter.js";
import { toRecord, type RaRecord } from "./record.js";
import { validateSchema, type NormalizedResource, type Schema } from "./schema.js";
import { countStatement, selectStatement } from "./statements.js";
import type { ProviderClient, ProviderOptions } from "./types.js";

export function createDataProvider(client: ProviderClient, schema: Schema, options: ProviderOptions = {}): DataProvider {
  const normalized = validateSchema(schema);

  // the constraints are made once, before the first data statement; a failure is not remembered, so the next call tries again
  let ensured: Promise<void> | null = null;
  const ready = (): Promise<void> => {
    ensured ??= ensureSchema(client, schema, options).catch((e) => {
      ensured = null;
      throw e;
    });
    return ensured;
  };

  const resourceOf = (name: string): NormalizedResource => {
    const resource = normalized.resources.get(name);
    if (!resource) throw notFound(`no resource "${name}" in the schema`);
    return resource;
  };

  /** Send a data statement: constraints first, then the statement, then the engine's error as a thrown one. */
  const send = async (resource: NormalizedResource, statement: string, params: Params): Promise<ResultEnvelope> => {
    await ready();
    const envelope = await execute(client, options, statement, params);
    const error = fromEnvelope(envelope, resource.name);
    if (error) throw error;
    return envelope;
  };

  const list = async (resource: NormalizedResource, params: { filter?: Record<string, unknown>; sort?: { field?: string; order?: string }; pagination?: { page?: number; perPage?: number } }) => {
    // everything is checked before the first statement is sent
    const filter = buildFilter(normalized, resource, params.filter);
    const order = buildOrder(resource, params.sort);
    const page = buildPage(params.pagination);
    const data = selectStatement(normalized, resource, { terms: filter.terms, params: filter.params, order, page });
    const count = countStatement(resource, filter.terms, filter.params);
    const rows = (await send(resource, data.statement, data.params)).rows;
    const total = (await send(resource, count.statement, count.params)).rows[0]?.total;
    return { data: rows.map((row) => toRecord(resource, row)), total: Number(total ?? 0) };
  };

  const byIds = async (resource: NormalizedResource, ids: string[]): Promise<RaRecord[]> => {
    const filter = buildFilter(normalized, resource, { id: ids.map(String) });
    const { statement, params } = selectStatement(normalized, resource, { terms: filter.terms, params: filter.params, order: buildOrder(resource, undefined) });
    return (await send(resource, statement, params)).rows.map((row) => toRecord(resource, row));
  };

  const notYet = (name: string) => async (): Promise<never> => {
    throw new Error(`${name} is not implemented yet`);
  };

  const provider = {
    async getList(name: string, params: any) {
      return list(resourceOf(name), params);
    },

    async getOne(name: string, params: { id: unknown }) {
      const resource = resourceOf(name);
      const [record] = await byIds(resource, [String(params.id)]);
      if (!record) throw notFound(`no "${name}" record with id ${JSON.stringify(String(params.id))}`);
      return { data: record };
    },

    async getMany(name: string, params: { ids: unknown[] }) {
      const resource = resourceOf(name);
      if (params.ids.length === 0) {
        // nothing to look up, but a failed client still refuses
        if (client.status === "failed") throw fromClientFailure(client);
        return { data: [] };
      }
      return { data: await byIds(resource, params.ids.map(String)) };
    },

    async getManyReference(name: string, params: { target: string; id: unknown; filter?: Record<string, unknown>; sort?: any; pagination?: any }) {
      const resource = resourceOf(name);
      if (!resource.references.has(params.target)) {
        throw badRequest(`"${params.target}" is not a declared reference of "${name}"`);
      }
      return list(resource, { ...params, filter: { ...(params.filter ?? {}), [params.target]: params.id } });
    },

    create: notYet("create"),
    update: notYet("update"),
    updateMany: notYet("updateMany"),
    delete: notYet("delete"),
    deleteMany: notYet("deleteMany"),
  };
  return provider as unknown as DataProvider;
}
