// covers-ra: FR-002, SC-009
import { describe, expect, it } from "vitest";
import { createDataProvider, ensureSchema, ProviderError } from "../../src/index.js";
import { schema } from "../helpers/fixture.js";
import { loadFixture, testClient } from "../helpers/in-process-client.js";

const constraints = (statements: string[]) => statements.filter((s) => s.startsWith("CREATE CONSTRAINT"));

describe("ensureSchema", () => {
  it("creates one uniqueness constraint per resource label and is idempotent", async () => {
    const client = await testClient();
    await ensureSchema(client, schema);
    await ensureSchema(client, schema);
    const listed = client.raw("SHOW CONSTRAINTS");
    expect(listed.map((c) => c.name).sort()).toEqual(["rel_Company_id", "rel_Person_id", "rel_Project_id"]);
    expect(listed.every((c) => c.type === "NODE_PROPERTY_UNIQUENESS")).toBe(true);
  });

  it("creates no separate index on id: the constraint owns the index (SC-009)", async () => {
    const client = await testClient();
    await ensureSchema(client, schema);
    const indexes = client.raw("SHOW INDEXES").filter((i) => i.type !== "LOOKUP"); // the engine's built-in lookup indexes are not ours
    expect(indexes).toHaveLength(3);
    expect(indexes.every((i) => i.properties.length === 1 && i.properties[0] === "id" && i.owningConstraint !== null)).toBe(true);
  });

  it("passes a statement of the documented form for each resource", async () => {
    const client = await testClient();
    await ensureSchema(client, schema);
    expect(constraints(client.statements())).toEqual([
      "CREATE CONSTRAINT `rel_Company_id` IF NOT EXISTS FOR (n:`Company`) REQUIRE n.`id` IS UNIQUE",
      "CREATE CONSTRAINT `rel_Person_id` IF NOT EXISTS FOR (n:`Person`) REQUIRE n.`id` IS UNIQUE",
      "CREATE CONSTRAINT `rel_Project_id` IF NOT EXISTS FOR (n:`Project`) REQUIRE n.`id` IS UNIQUE",
    ]);
  });
});

describe("the provider runs it once, before its first data statement", () => {
  it("sends the constraints first, and not again on later calls", async () => {
    const client = await testClient();
    loadFixture(client);
    const provider = createDataProvider(client, schema);
    await provider.getOne("people", { id: "p01" });
    await provider.getOne("people", { id: "p02" });
    await provider.getList("companies", { pagination: { page: 1, perPage: 5 }, sort: { field: "id", order: "ASC" }, filter: {} });
    const sent = client.statements();
    expect(sent.slice(0, 3).every((s) => s.startsWith("CREATE CONSTRAINT"))).toBe(true);
    expect(constraints(sent)).toHaveLength(3);
  });

  it("works over a store that already holds the constraints", async () => {
    const client = await testClient();
    loadFixture(client);
    await ensureSchema(client, schema);
    const provider = createDataProvider(client, schema);
    expect((await provider.getOne("people", { id: "p01" })).data.name).toBe("Ada");
  });

  it("rejects 400 naming the resource when the store already holds duplicate ids, and tries again on the next call", async () => {
    const client = await testClient();
    loadFixture(client);
    client.raw("CREATE (:Person {id: 'p01', name: 'duplicate'})");
    const provider = createDataProvider(client, schema);
    const first = await provider.getOne("people", { id: "p01" }).catch((e) => e as ProviderError);
    expect(first).toBeInstanceOf(ProviderError);
    expect((first as ProviderError).status).toBe(400);
    expect((first as ProviderError).message).toMatch(/people|Person/);
    expect(client.statements().filter((s) => /Person/.test(s) && s.startsWith("CREATE CONSTRAINT"))).toHaveLength(1);
    // no data statement was sent while the constraint could not be made
    expect(client.statements().some((s) => s.startsWith("MATCH"))).toBe(false);

    client.raw("MATCH (p:Person {id: 'p01', name: 'duplicate'}) DELETE p");
    client.reset();
    const again = await provider.getOne("people", { id: "p01" });
    expect(again.data.name).toBe("Ada");
    expect(constraints(client.statements())).toHaveLength(3); // tried again, whole
  });
});
