// covers-obs: FR-002, FR-005, SC-001
import { afterEach, describe, expect, it } from "vitest";
import { LINK_STATEMENT, NODE_STATEMENT } from "../../../src/worker/loader.js";
import type { StatementEvent } from "../../../src/client/statements.js";
import type { StatementsMessage } from "../../../src/worker/protocol.js";
import type { Client } from "../../../src/client/types.js";
import { client, doc, ready_, received, sent } from "./harness.js";

let c: Client | null = null;
afterEach(() => {
  c?.destroy();
  c = null;
});

const statementsMessages = (): StatementsMessage[] => sent.filter((m): m is StatementsMessage => m.type === "statements");

describe("statements the worker runs by itself", () => {
  it("are reported with origin internal when a listener was there from the start", async () => {
    const events: StatementEvent[] = [];
    c = await ready_(await client({}, (made) => made.on("statement", (e) => events.push(e))));
    expect(events.map((e) => e.origin)).toEqual(["internal", "internal"]);
    expect(events.map((e) => e.statement)).toEqual([NODE_STATEMENT, LINK_STATEMENT]);
    expect(events.every((e) => e.write && e.error === null)).toBe(true);
  });

  it("are followed in the same stream by the page's own statements", async () => {
    const events: StatementEvent[] = [];
    c = await ready_(await client({}, (made) => made.on("statement", (e) => events.push(e))));
    await c.query("RETURN 1 AS a");
    expect(events.at(-1)).toMatchObject({ statement: "RETURN 1 AS a", origin: "query" });
    expect(events).toHaveLength(3);
  });

  it("include a scoped add and a scoped drop", async () => {
    c = await ready_(await client());
    const events: StatementEvent[] = [];
    c.on("statement", (e) => events.push(e));
    await c.addScoped({ version: 1, nodes: [{ id: "s1", properties: { t: 1 } }], links: [] }, "page-1");
    await c.dropScope("page-1");
    expect(events.map((e) => e.origin)).toEqual(["internal", "internal"]);
    expect(events[0]!.statement).toBe(NODE_STATEMENT);
    expect(events[1]!.statement).toMatch(/DETACH DELETE/);
    expect(events.every((e) => e.write)).toBe(true);
  });

  it("send no records, only the count of writes, when nobody listens", async () => {
    c = await ready_(await client());
    const [first] = statementsMessages();
    expect(first).toMatchObject({ type: "statements", writes: 2, records: null });
  });

  it("tell the worker when listeners come and go, and send records only while someone listens", async () => {
    c = await ready_(await client());
    const off = c.on("statement", () => {});
    expect(received.filter((m) => m.type === "observe")).toEqual([{ type: "observe", on: true }]);
    await c.addScoped({ version: 1, nodes: [{ id: "s2", properties: {} }], links: [] }, "p");
    const withRecords = statementsMessages().at(-1)!;
    expect(withRecords.records).toHaveLength(1);
    off();
    expect(received.filter((m) => m.type === "observe").at(-1)).toEqual({ type: "observe", on: false });
    await c.dropScope("p");
    expect(statementsMessages().at(-1)).toMatchObject({ writes: 1, records: null });
  });

  it("are not reported twice: a page's own statement is reported from its reply only", async () => {
    c = await ready_(await client());
    const events: StatementEvent[] = [];
    c.on("statement", (e) => events.push(e));
    const before = statementsMessages().length;
    await c.query("CREATE (:T)");
    expect(events).toHaveLength(1);
    expect(statementsMessages()).toHaveLength(before);
  });

  it("the document used is the one the loader batches", () => {
    expect(doc.nodes).toHaveLength(2);
  });
});
