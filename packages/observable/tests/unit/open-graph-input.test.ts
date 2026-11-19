// covers: FR-011, FR-012, FR-014, FR-017, FR-021
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachment, installPage, stubClient } from "../helpers/stubs.js";

const client = stubClient();
const createClient = vi.fn((_options: unknown) => client);
vi.mock("@relate/contrib-web", () => ({ createClient: (o: unknown) => createClient(o) }));

const { open } = await import("../../src/open.js");
const never = new Promise<void>(() => undefined);
let page: ReturnType<typeof installPage>;

beforeEach(() => {
  createClient.mockClear();
  client.status = "loading";
  client.destroy.mockClear();
  page = installPage();
});

const base = () => ({ engine: attachment("/_file/data/relate.f59.wasm"), worker: attachment("/_file/data/relate-worker.5b2.js"), invalidation: never });

describe("open, with a document", () => {
  it("creates the core's client with the per-page profile, the engine's location and a module worker from the worker's location", async () => {
    const opened = await open({ ...base(), graph: { document: { version: 1, nodes: [], links: [] } } });
    expect(opened.client).toBe(client);
    const options = createClient.mock.calls[0]![0] as { engineUrl: string; navigation: string; workerFactory: () => unknown; graph: unknown };
    expect(options.engineUrl).toBe("/_file/data/relate.f59.wasm");
    expect(options.navigation).toBe("multi-page");
    options.workerFactory();
    expect(page.workers).toEqual([{ url: "/_file/data/relate-worker.5b2.js", options: { type: "module" } }]);
  });

  it("passes a document the cell holds as it is, with its indexes", async () => {
    const document = { version: 1, nodes: [{ id: "a" }], links: [] };
    const indexes = [{ label: "Page", property: "id" }];
    await open({ ...base(), graph: { document: document as never, indexes } });
    expect((createClient.mock.calls[0]![0] as { graph: unknown }).graph).toEqual({ document, indexes });
  });

  it("passes a document attachment as its location, so the core fetches it", async () => {
    await open({ ...base(), graph: { document: attachment("/_file/data/g.graph.5616.json") } });
    expect((createClient.mock.calls[0]![0] as { graph: unknown }).graph).toEqual({ document: "/_file/data/g.graph.5616.json" });
  });

  it("resolves before the graph is ready, then `ready` resolves when the status becomes ready", async () => {
    const opened = await open({ ...base(), graph: { document: { version: 1, nodes: [], links: [] } } });
    let settled = false;
    void opened.ready.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    client.setStatus("ready");
    await opened.ready;
    expect(settled).toBe(true);
  });

  it("rejects `ready` with the core's failure wording when the client reaches failed", async () => {
    const opened = await open({ ...base(), graph: { document: { version: 1, nodes: [], links: [] } } });
    client.setStatus("failed");
    await expect(opened.ready).rejects.toThrow("the graph could not be loaded (wording from the core)");
  });

  it("answers `query` through the core client's query, normalized", async () => {
    const opened = await open({ ...base(), graph: { document: { version: 1, nodes: [], links: [] } } });
    const result = await opened.query("RETURN 1 AS n", { a: 1 });
    expect(client.query).toHaveBeenCalledWith("RETURN 1 AS n", { a: 1 });
    expect(result.rows).toEqual([{ n: 1 }]);
    const rows = await opened.cypher`RETURN ${1} AS n`;
    expect(client.query).toHaveBeenLastCalledWith("RETURN $p0 AS n", { p0: 1 });
    expect(rows.columns).toEqual(["n"]);
  });

  it("refuses a call without the cell's invalidation, and attachments that are not attachments", async () => {
    await expect(open({ ...base(), invalidation: undefined as never, graph: { document: { version: 1, nodes: [], links: [] } } })).rejects.toThrow(/invalidation/);
    await expect(open({ ...base(), engine: "/x.wasm" as never, graph: { document: { version: 1, nodes: [], links: [] } } })).rejects.toThrow(/file attachments/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("offers no navigation option and no main-thread instance", async () => {
    const opened = await open({ ...base(), graph: { document: { version: 1, nodes: [], links: [] } } });
    expect(Object.keys(opened).sort()).toEqual(["client", "cypher", "graph", "query", "ready"]);
    expect((createClient.mock.calls[0]![0] as { navigation: string }).navigation).toBe("multi-page");
  });
});
