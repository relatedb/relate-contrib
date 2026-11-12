// A `ProviderClient` over the real engine, in Node, with no worker (research R11). The engine is initialised from the
// vendored binary the way the core's own Node tests do it. The contract between the provider and the engine is the
// statements and the result envelope; the worker is the core's concern and is tested there.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ProviderClient } from "../../src/types.js";
import { companies, people, projects } from "./fixture.js";

type Db = { execute(statement: string, paramsJson?: string | null): string };
type Wasm = { default: (o: { module_or_path: Uint8Array }) => Promise<unknown>; RelateDb: new () => Db };

let loaded: Promise<Wasm> | null = null;
function wasm(): Promise<Wasm> {
  loaded ??= (async () => {
    const dir = dirname(createRequire(import.meta.url).resolve("@relate/relate-wasm"));
    const mod = (await import(join(dir, "relate.js"))) as Wasm;
    await mod.default({ module_or_path: readFileSync(join(dir, "relate_bg.wasm")) });
    return mod;
  })();
  return loaded;
}

/** A fresh engine, in memory. */
export async function newDb(): Promise<Db> {
  const { RelateDb } = await wasm();
  return new RelateDb();
}

export interface Call {
  statement: string;
  params: Record<string, unknown>;
  opts: { timeoutMs?: number } | undefined;
}

export interface TestClient extends ProviderClient {
  /** Every statement sent, in order, with its parameters and options. */
  readonly calls: Call[];
  /** Run a statement directly, bypassing the record (for setup and for checking what a write did). */
  raw(statement: string, params?: Record<string, unknown>): Array<Record<string, any>>;
  /** The statements sent so far, as text. */
  statements(): string[];
  /** Forget the calls recorded so far. */
  reset(): void;
}

/** What the core's client throws when a call does not produce a result (`GraphError`). */
export class FakeGraphError extends Error {
  readonly reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.name = "GraphError";
    this.reason = reason;
  }
}

/** A ready client over a new engine. `delayMs` delays every answer (a client that is slow, or still loading). */
export async function testClient(options: { delayMs?: number } = {}): Promise<TestClient> {
  const db = await newDb();
  const calls: Call[] = [];
  const run = (statement: string, params: Record<string, unknown> = {}) => {
    const envelope = JSON.parse(db.execute(statement, Object.keys(params).length ? JSON.stringify(params) : null)) as {
      columns: string[];
      rows: Array<Record<string, any>>;
      error: string | null;
    };
    return envelope;
  };
  const client: TestClient = {
    status: "ready",
    diagnostic: null,
    calls,
    async query(statement: string, params?: object | null, opts?: { timeoutMs?: number }) {
      calls.push({ statement, params: { ...(params ?? {}) }, opts });
      const delay = options.delayMs ?? 0;
      if (delay > 0) {
        if (opts?.timeoutMs !== undefined && delay > opts.timeoutMs) {
          await new Promise((r) => setTimeout(r, opts.timeoutMs));
          throw new FakeGraphError("timeout");
        }
        await new Promise((r) => setTimeout(r, delay));
      }
      return run(statement, (params ?? {}) as Record<string, unknown>);
    },
    raw(statement, params = {}) {
      const envelope = run(statement, params);
      if (envelope.error) throw new Error(envelope.error);
      return envelope.rows;
    },
    statements: () => calls.map((c) => c.statement),
    reset: () => void (calls.length = 0),
  };
  return client;
}

/** A client whose status is `failed`: every provider call must refuse it and send no statement. */
export function failedClient(reason = "store-newer", engineError: string | null = "written by a newer version"): ProviderClient & { calls: number } {
  const state = { calls: 0 };
  return {
    status: "failed",
    diagnostic: { reason, failures: 1, engineError } as never,
    get calls() {
      return state.calls;
    },
    async query() {
      state.calls++;
      throw new FakeGraphError("failed", engineError ?? "failed");
    },
  } as ProviderClient & { calls: number };
}

/** Create the fixture's nodes and relationships. No constraint is created: the provider does that. */
export function loadFixture(client: TestClient): void {
  for (const c of companies) client.raw("CREATE (n:Company {id: $id}) SET n += $props", { id: c.id, props: { name: c.name, industry: c.industry, founded: c.founded } });
  for (const p of people) {
    const { id, company, ...props } = p;
    client.raw("CREATE (n:Person {id: $id}) SET n += $props", { id, props });
    if (company) client.raw("MATCH (a:Person {id: $a}), (b:Company {id: $b}) CREATE (a)-[:WORKS_AT]->(b)", { a: id, b: company });
  }
  for (const j of projects) {
    const { id, company, lead, ...props } = j;
    client.raw("CREATE (n:Project {id: $id}) SET n += $props", { id, props });
    client.raw("MATCH (a:Project {id: $a}), (b:Company {id: $b}) CREATE (a)-[:OWNED_BY]->(b)", { a: id, b: company });
    if (lead) client.raw("MATCH (a:Project {id: $a}), (b:Person {id: $b}) CREATE (a)-[:LED_BY]->(b)", { a: id, b: lead });
  }
  client.reset();
}
