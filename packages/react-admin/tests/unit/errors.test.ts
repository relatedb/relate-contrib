// covers-ra: FR-017, FR-018, FR-019, FR-027, FR-033
import { beforeEach, describe, expect, it } from "vitest";
import { createDataProvider, ensureSchema, ProviderError } from "../../src/index.js";
import type { ProviderClient } from "../../src/types.js";
import { schema } from "../helpers/fixture.js";
import { failedClient, FakeGraphError, loadFixture, testClient, type TestClient } from "../helpers/in-process-client.js";

const page = { page: 1, perPage: 10 };
const sort = { field: "id", order: "ASC" as const };

const rejection = async (p: Promise<unknown>): Promise<any> => {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
};

/** Every provider call, each with arguments that would succeed on a healthy client. */
const calls = (p: ReturnType<typeof createDataProvider>): Array<[string, () => Promise<unknown>]> => [
  ["getList", () => p.getList("people", { pagination: page, sort, filter: {} })],
  ["getOne", () => p.getOne("people", { id: "p01" })],
  ["getMany", () => p.getMany("people", { ids: ["p01"] })],
  ["getMany (no ids)", () => p.getMany("people", { ids: [] })],
  ["getManyReference", () => p.getManyReference("people", { target: "company", id: "c1", pagination: page, sort, filter: {} })],
  ["create", () => p.create("people", { data: { name: "x" } })],
  ["update", () => p.update("people", { id: "p01", data: { name: "x" }, previousData: {} as never })],
  ["updateMany", () => p.updateMany("people", { ids: ["p01"], data: { name: "x" } })],
  ["updateMany (no ids)", () => p.updateMany("people", { ids: [], data: { name: "x" } })],
  ["delete", () => p.delete("people", { id: "p01" })],
  ["deleteMany", () => p.deleteMany("people", { ids: ["p01"] })],
  ["deleteMany (no ids)", () => p.deleteMany("people", { ids: [] })],
];

/** A client that answers with an engine error for statements matching a pattern, and otherwise as the base client does. */
function engineErrorFor(base: TestClient, match: RegExp, error: string): ProviderClient {
  return {
    status: "ready",
    diagnostic: null,
    async query(statement, params, opts) {
      if (match.test(statement)) {
        base.calls.push({ statement, params: { ...(params ?? {}) }, opts });
        return { columns: [], rows: [], error } as never;
      }
      return base.query(statement, params, opts);
    },
  };
}

describe("an engine error in the envelope (scenario 1)", () => {
  it("throws with the engine's message and status 400, on reads and on writes", async () => {
    const base = await testClient();
    loadFixture(base);
    const client = engineErrorFor(base, /^MATCH|^CREATE \(n|^OPTIONAL|\bDETACH DELETE\b/, "semantic error: something the engine refused");
    const p = createDataProvider(client, schema);
    for (const [name, call] of calls(p).filter(([n]) => !/no ids/.test(n))) {
      const e = await rejection(call());
      expect(e, name).toBeInstanceOf(ProviderError);
      expect(e.status, name).toBe(400);
      expect(e.message, name).toContain("something the engine refused");
    }
  });

  it("gives a uniqueness violation its own wording but the same status", async () => {
    const base = await testClient();
    loadFixture(base);
    const p = createDataProvider(base, schema);
    const e = await rejection(p.create("people", { data: { id: "p01", name: "dup" } }));
    expect(e.status).toBe(400);
    expect(e.message).toMatch(/already exists/);
  });
});

describe("a client whose status is failed (scenario 2)", () => {
  it("makes every method throw 503 with the client's failure message and sends no statement", async () => {
    const client = failedClient("store-newer", "written by a newer version of this application");
    const p = createDataProvider(client, schema);
    for (const [name, call] of calls(p)) {
      const e = await rejection(call());
      expect(e, name).toBeInstanceOf(ProviderError);
      expect(e.status, name).toBe(503);
      expect(e.message, name).toContain("store-newer");
      expect(e.message, name).toContain("written by a newer version of this application");
    }
    expect(client.calls).toBe(0);
  });

  it("refuses ensureSchema the same way", async () => {
    const client = failedClient();
    const e = await rejection(ensureSchema(client, schema));
    expect(e.status).toBe(503);
    expect(client.calls).toBe(0);
  });

  it("works again when the client is ready (the failure is read on each call, not remembered)", async () => {
    const base = await testClient();
    loadFixture(base);
    let failed = true;
    const client: ProviderClient = {
      get status() {
        return failed ? "failed" : "ready";
      },
      get diagnostic() {
        return failed ? ({ reason: "store-unreadable", failures: 1, engineError: "x" } as never) : null;
      },
      query: (s, p, o) => base.query(s, p, o),
    };
    const provider = createDataProvider(client, schema);
    expect((await rejection(provider.getOne("people", { id: "p01" }))).status).toBe(503);
    failed = false;
    expect((await provider.getOne("people", { id: "p01" })).data.name).toBe("Ada");
  });
});

describe("a client that answers late (scenario 3)", () => {
  it("resolves the call after the delay, as it does for a client that is still loading", async () => {
    const client = await testClient({ delayMs: 40 });
    loadFixture(client);
    const provider = createDataProvider(client, schema);
    const started = Date.now();
    const r = await provider.getOne("people", { id: "p01" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    expect(r.data.name).toBe("Ada");
  });
});

describe("onStatement (scenario 4)", () => {
  it("receives each statement and its parameters in the order sent, once per statement", async () => {
    const client = await testClient();
    loadFixture(client);
    const seen: Array<{ statement: string; params: object }> = [];
    const provider = createDataProvider(client, schema, { onStatement: (statement, params) => void seen.push({ statement, params }) });
    await provider.getList("people", { pagination: page, sort, filter: { age_gte: 30 } });
    await rejection(provider.update("people", { id: "nope", data: { company: "c1" }, previousData: {} as never }));
    expect(seen.length).toBeGreaterThan(5);
    expect(seen).toEqual(client.calls.map((c) => ({ statement: c.statement, params: c.params })));
    // the constraints, the list's two statements, then the failed update and its cause read
    expect(seen.slice(0, 3).every((s) => s.statement.startsWith("CREATE CONSTRAINT"))).toBe(true);
    expect(seen[3]!.params).toMatchObject({ p0: 30, skip: 0, limit: 10 });
  });

  it("reports nothing when no callback is given", async () => {
    const client = await testClient();
    loadFixture(client);
    const provider = createDataProvider(client, schema);
    await expect(provider.getOne("people", { id: "p01" })).resolves.toBeDefined();
  });

  it("catches a callback that throws, and the call still resolves", async () => {
    const client = await testClient();
    loadFixture(client);
    let calls = 0;
    const provider = createDataProvider(client, schema, {
      onStatement: () => {
        calls++;
        throw new Error("a display bug");
      },
    });
    expect((await provider.getOne("people", { id: "p01" })).data.name).toBe("Ada");
    expect(calls).toBeGreaterThan(0);
  });
});

describe("no retry, and what the core's client throws (FR-018)", () => {
  it("does not retry a statement that failed", async () => {
    const base = await testClient();
    loadFixture(base);
    let attempts = 0;
    const client: ProviderClient = {
      status: "ready",
      diagnostic: null,
      async query(statement, params, opts) {
        if (/^MATCH/.test(statement)) {
          attempts++;
          throw new FakeGraphError("trap", "the engine trapped");
        }
        return base.query(statement, params, opts);
      },
    };
    const e = await rejection(createDataProvider(client, schema).getOne("people", { id: "p01" }));
    expect(e.status).toBe(503);
    expect(attempts).toBe(1);
  });

  it("maps the core's lost and failed rejections to 503 with the client's message, and passes other errors through unchanged", async () => {
    const make = (error: unknown): ProviderClient => ({ status: "ready", diagnostic: null, query: async () => Promise.reject(error) });
    const lost = await rejection(createDataProvider(make(new FakeGraphError("lost", "the instance is not ready")), schema).getOne("people", { id: "p01" }));
    expect([lost.status, lost.message]).toEqual([503, "the instance is not ready"]);
    const odd = new TypeError("not ours");
    expect(await rejection(createDataProvider(make(odd), schema).getOne("people", { id: "p01" }))).toBe(odd);
  });

  it("throws an Error whose status is a number, for every kind of error", async () => {
    const base = await testClient();
    loadFixture(base);
    const p = createDataProvider(base, schema);
    const errors = [
      await rejection(p.getOne("people", { id: "nope" })), // 404
      await rejection(p.getList("people", { pagination: page, sort: { field: "nope", order: "ASC" }, filter: {} })), // 400
      await rejection(createDataProvider(failedClient(), schema).getOne("people", { id: "p01" })), // 503
    ];
    expect(errors.map((e) => e.status)).toEqual([404, 400, 503]);
    for (const e of errors) {
      expect(e).toBeInstanceOf(Error);
      expect(typeof e.status).toBe("number");
    }
  });
});

describe("a timeout on every statement (scenario 5, FR-033)", () => {
  it("passes 10,000 ms by default to every query, constraints and cause reads included", async () => {
    const client = await testClient();
    loadFixture(client);
    const provider = createDataProvider(client, schema);
    await provider.getList("people", { pagination: page, sort, filter: {} });
    await provider.create("people", { data: { name: "x" } });
    await rejection(provider.update("people", { id: "nope", data: { company: "c1" }, previousData: {} as never }));
    await provider.delete("people", { id: "p02" });
    expect(client.calls.length).toBeGreaterThan(8);
    for (const c of client.calls) expect(c.opts).toEqual({ timeoutMs: 10_000 });
  });

  it("passes the timeoutMs option when given", async () => {
    const client = await testClient();
    loadFixture(client);
    const provider = createDataProvider(client, schema, { timeoutMs: 1234 });
    await provider.getOne("people", { id: "p01" });
    for (const c of client.calls) expect(c.opts).toEqual({ timeoutMs: 1234 });
  });

  it("rejects 503 saying the statement timed out when the answer comes after the timeout", async () => {
    const client = await testClient({ delayMs: 200 });
    loadFixture(client);
    const provider = createDataProvider(client, schema, { timeoutMs: 20 });
    const started = Date.now();
    const e = await rejection(provider.getList("people", { pagination: page, sort, filter: {} }));
    expect(Date.now() - started).toBeLessThan(150);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.status).toBe(503);
    expect(e.message).toMatch(/timed out/);
  });

  it("tries the constraints again after a timeout (the failure is not remembered)", async () => {
    const base = await testClient();
    loadFixture(base);
    let slow = true;
    const client: ProviderClient = {
      status: "ready",
      diagnostic: null,
      async query(statement, params, opts) {
        if (slow && statement.startsWith("CREATE CONSTRAINT")) {
          base.calls.push({ statement, params: {}, opts });
          throw new FakeGraphError("timeout");
        }
        return base.query(statement, params, opts);
      },
    };
    const provider = createDataProvider(client, schema);
    expect((await rejection(provider.getOne("people", { id: "p01" }))).status).toBe(503);
    slow = false;
    expect((await provider.getOne("people", { id: "p01" })).data.name).toBe("Ada");
  });
});
