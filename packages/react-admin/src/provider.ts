// createDataProvider: react-admin's data provider over a core client (contracts/provider-api.md). Every statement goes through `execute`, and nothing is sent before the filter, sort and page
// have been checked against the schema.
import type { DataProvider } from "react-admin";
import { badRequest, fromClientFailure, fromEnvelope, notFound } from "./errors.js";
import { ensureSchema } from "./ensure.js";
import { execute, type ResultEnvelope } from "./exec.js";
import { buildFilter, buildOrder, buildPage, type Params } from "./filter.js";
import { toRecord, type RaRecord } from "./record.js";
import { validateSchema, type NormalizedResource, type Schema } from "./schema.js";
import { countStatement, createStatement, deleteStatement, existsStatement, selectStatement, updateStatement } from "./statements.js";
import { splitData } from "./write.js";
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

  /** After a write that matched nothing: name a missing target (400) before the caller reports anything else. */
  const checkTargets = async (resource: NormalizedResource, refs: Map<string, string | null>): Promise<void> => {
    for (const [field, id] of refs) {
      if (id === null) continue;
      const reference = resource.references.get(field)!;
      const target = normalized.resources.get(reference.resource)!;
      const { statement, params } = existsStatement(target.label, id);
      const found = (await send(resource, statement, params)).rows[0]?.n;
      if (!found) throw badRequest(`reference "${field}" on "${resource.name}": no "${reference.resource}" record with id ${JSON.stringify(id)}`);
    }
  };

  const nodeExists = async (resource: NormalizedResource, id: string): Promise<boolean> => {
    const { statement, params } = existsStatement(resource.label, id);
    return Number((await send(resource, statement, params)).rows[0]?.n ?? 0) > 0;
  };

  /** The ids of a write's rows, once, in order. */
  const idsOf = (rows: Array<Record<string, any>>, column: string): string[] => rows.map((r) => String(r[column]));

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

    async create(name: string, params: { data?: Record<string, unknown> }) {
      const resource = resourceOf(name);
      const data = splitData(resource, params.data, true);
      const id = data.id ?? crypto.randomUUID();
      const { statement, params: bound } = createStatement(normalized, resource, id, data.props, data.refs);
      const rows = (await send(resource, statement, bound)).rows;
      if (rows.length === 0) {
        await checkTargets(resource, data.refs);
        throw badRequest(`could not create a "${name}" record`);
      }
      const [record] = await byIds(resource, [id]);
      return { data: record! };
    },

    async update(name: string, params: { id: unknown; data?: Record<string, unknown> }) {
      const resource = resourceOf(name);
      const id = String(params.id);
      const data = splitData(resource, params.data, false);
      const { statement, params: bound } = updateStatement(normalized, resource, [id], data.props, data.refs);
      const rows = (await send(resource, statement, bound)).rows;
      if (rows.length === 0) {
        if (!(await nodeExists(resource, id))) throw notFound(`no "${name}" record with id ${JSON.stringify(id)}`);
        await checkTargets(resource, data.refs);
        throw badRequest(`could not update the "${name}" record ${JSON.stringify(id)}`);
      }
      const [record] = await byIds(resource, [id]);
      return { data: record! };
    },

    async updateMany(name: string, params: { ids: unknown[]; data?: Record<string, unknown> }) {
      const resource = resourceOf(name);
      const data = splitData(resource, params.data, false);
      if (params.ids.length === 0) {
        if (client.status === "failed") throw fromClientFailure(client);
        return { data: [] };
      }
      const { statement, params: bound } = updateStatement(normalized, resource, params.ids.map(String), data.props, data.refs);
      const rows = (await send(resource, statement, bound)).rows;
      if (rows.length === 0) await checkTargets(resource, data.refs);
      return { data: idsOf(rows, "id") };
    },

    async delete(name: string, params: { id: unknown }) {
      const resource = resourceOf(name);
      const id = String(params.id);
      const { statement, params: bound } = deleteStatement(resource, [id]);
      const rows = (await send(resource, statement, bound)).rows;
      if (rows.length === 0) throw notFound(`no "${name}" record with id ${JSON.stringify(id)}`);
      return { data: { id } };
    },

    async deleteMany(name: string, params: { ids: unknown[] }) {
      const resource = resourceOf(name);
      if (params.ids.length === 0) {
        if (client.status === "failed") throw fromClientFailure(client);
        return { data: [] };
      }
      const { statement, params: bound } = deleteStatement(resource, params.ids.map(String));
      return { data: idsOf((await send(resource, statement, bound)).rows, "removed") };
    },
  };
  return provider as unknown as DataProvider;
}
