// covers: FR-015, FR-016, FR-017, FR-018
import { describe, expect, it } from "vitest";
import type { Engine } from "../../src/worker/engine.js";
import { LINK_STATEMENT, NODE_STATEMENT, LoadError, loadDocument } from "../../src/worker/loader.js";
import type { Descriptor, GraphDocument } from "../../src/data/types.js";

/** A stand-in engine that records every statement and answers node batches with element ids. */
function fakeEngine(): { engine: Engine; calls: Array<{ statement: string; params: any }> } {
  const calls: Array<{ statement: string; params: any }> = [];
  let created = 0;
  const engine = {
    execute(statement: string, paramsJson: string | null) {
      const params = paramsJson ? JSON.parse(paramsJson) : null;
      calls.push({ statement, params });
      if (statement === NODE_STATEMENT) {
        return JSON.stringify({ columns: ["k", "e"], rows: params.rows.map((r: { k: number }) => ({ k: r.k, e: `e${created++}` })), error: null });
      }
      return JSON.stringify({ columns: [], rows: [], error: null });
    },
  } as unknown as Engine;
  return { engine, calls };
}

const doc: GraphDocument = {
  version: 1,
  nodes: [{ id: "a", labels: ["Page"], properties: { t: "x" } }, { id: "b" }],
  links: [{ source: "a", target: "b", type: "T", properties: { w: 1 } }],
};

describe("the loader's statements", () => {
  it("creates the named indexes first, then nodes, then links, and nothing else", () => {
    const { engine, calls } = fakeEngine();
    loadDocument(engine, doc, { indexes: [{ label: "Page", property: "id" }] });
    expect(calls.map((c) => c.statement)).toEqual([
      "CREATE INDEX IF NOT EXISTS FOR (n:`Page`) ON (n.`id`)",
      NODE_STATEMENT,
      LINK_STATEMENT,
    ]);
  });

  it("creates no index when none is named", () => {
    const { engine, calls } = fakeEngine();
    loadDocument(engine, doc);
    expect(calls.map((c) => c.statement)).toEqual([NODE_STATEMENT, LINK_STATEMENT]);
  });

  it("takes the indexes from the descriptor when there is one", () => {
    const { engine, calls } = fakeEngine();
    const descriptor: Descriptor = { version: 1, id: "g", revision: "r", data: { url: "g.json", nodes: 2, links: 1 }, indexes: [{ label: "A", property: "p" }] };
    loadDocument(engine, doc, { descriptor, indexes: [{ label: "Ignored", property: "x" }] });
    expect(calls[0]?.statement).toBe("CREATE INDEX IF NOT EXISTS FOR (n:`A`) ON (n.`p`)");
    expect(calls.filter((c) => c.statement.startsWith("CREATE INDEX"))).toHaveLength(1);
  });

  it("quotes labels and properties so they cannot change the statement", () => {
    const { engine, calls } = fakeEngine();
    loadDocument(engine, doc, { indexes: [{ label: "A`) DETACH DELETE (x", property: "p" }] });
    expect(calls[0]?.statement).toBe("CREATE INDEX IF NOT EXISTS FOR (n:`A``) DETACH DELETE (x`) ON (n.`p`)");
  });

  it("puts the document id first in a node's properties and resolves link endpoints by element id", () => {
    const { engine, calls } = fakeEngine();
    loadDocument(engine, doc);
    const nodes = calls[0]?.params.rows;
    expect(nodes[0]).toEqual({ k: 0, labels: ["Page"], props: { id: "a", t: "x" } });
    expect(nodes[1]).toEqual({ k: 1, labels: [], props: { id: "b" } });
    expect(calls[1]?.params.rows).toEqual([{ s: "e0", t: "e1", type: "T", props: { w: 1 } }]);
  });

  it("adds the scope to every created node", () => {
    const { engine, calls } = fakeEngine();
    loadDocument(engine, doc, { scope: "view-1" });
    expect(calls[0]?.params.rows.map((r: { props: { scope: string } }) => r.props.scope)).toEqual(["view-1", "view-1"]);
  });

  it("loads in batches of 1000 rows", () => {
    const { engine, calls } = fakeEngine();
    const big: GraphDocument = { version: 1, nodes: Array.from({ length: 2500 }, (_, i) => ({ id: `n${i}` })), links: [] };
    loadDocument(engine, big);
    expect(calls.map((c) => c.params.rows.length)).toEqual([1000, 1000, 500]);
  });

  it("runs no statement at all when the document is rejected", () => {
    const { engine, calls } = fakeEngine();
    expect(() => loadDocument(engine, { version: 1, nodes: [{ id: "a" }, { id: "a" }], links: [] }, { indexes: [{ label: "P", property: "id" }] })).toThrow(LoadError);
    expect(calls).toHaveLength(0);
  });

  it("runs no statement when the data disagrees with the descriptor", () => {
    const { engine, calls } = fakeEngine();
    const descriptor: Descriptor = { version: 1, id: "g", revision: "r", data: { url: "g.json", nodes: 9, links: 1 } };
    try {
      loadDocument(engine, doc, { descriptor });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LoadError);
      expect((e as LoadError).reason).toBe("mismatch");
    }
    expect(calls).toHaveLength(0);
  });
});
