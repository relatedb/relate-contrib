// covers-cat: FR-015, FR-016
import { describe, expect, it } from "vitest";
import { Catalog } from "../../../src/catalog/catalog.js";
import { MemoryCatalogStorage } from "../../../src/catalog/memory-storage.js";
import { beginRebuild, cacheStoreName, canRestore, finishRebuild } from "../../../src/worker/cache.js";
import { loadDocument } from "../../../src/worker/loader.js";
import { generateGraph } from "../../fixtures/generate-graph.js";
import { query, realEngine } from "../../application/unit/helpers.js";

const PAGES = 60;
const graph = (revision = "r1") => generateGraph(PAGES, { id: "docs", revision });
const STORE = cacheStoreName("docs");

/**
 * Open a cache the way the worker does: restore, or write loading, reset, load, write ready; when the catalog cannot take the
 * loading write, the durable store is left alone and the graph loads into a memory engine, returned as `memory`.
 */
async function open(e: Awaited<ReturnType<typeof realEngine>>, catalog: Catalog, revision = "r1"): Promise<{ restored: boolean; memory?: Awaited<ReturnType<typeof realEngine>> }> {
  const { descriptor, document } = graph(revision);
  if (await canRestore(e, catalog, descriptor)) return { restored: true };
  if (!(await beginRebuild(e, catalog, descriptor))) {
    const memory = await realEngine();
    loadDocument(memory, document, { descriptor });
    return { restored: false, memory };
  }
  loadDocument(e, document, { descriptor });
  await finishRebuild(catalog, descriptor);
  return { restored: false };
}

const nodes = (e: Awaited<ReturnType<typeof realEngine>>) => query(e, "MATCH (n) RETURN count(n) AS c").rows[0]!.c;
const put = (catalog: Catalog, state: "ready" | "loading" | "removing", revision?: string) =>
  catalog.set(STORE, { kind: "cache", name: "docs", state, ...(revision ? { revision } : {}) });

describe("restoring a cache", () => {
  it("restores a ready entry at the descriptor's revision over a store with all its nodes, and writes nothing", async () => {
    const e = await realEngine();
    const storage = new MemoryCatalogStorage();
    const catalog = new Catalog(storage);
    expect(await open(e, catalog)).toEqual({ restored: false });
    expect(await catalog.lookup(STORE)).toMatchObject({ status: "entry", entry: { kind: "cache", state: "ready", revision: "r1" } });
    const replaced = storage.replaced;
    expect(await open(e, catalog)).toEqual({ restored: true });
    expect(storage.replaced).toBe(replaced);
    expect(nodes(e)).toBe(PAGES);
  });

  it("sweeps leftover page data before it compares the node count", async () => {
    const e = await realEngine();
    const catalog = new Catalog(new MemoryCatalogStorage());
    await open(e, catalog);
    query(e, "CREATE (:Leftover {scope: 'gone-page'})");
    expect(await open(e, catalog)).toEqual({ restored: true });
    expect(nodes(e)).toBe(PAGES);
  });
});

describe("every other case rebuilds, and none fails the page", () => {
  const cases: Array<[string, (c: Catalog, e: Awaited<ReturnType<typeof realEngine>>) => Promise<void>]> = [
    ["no entry over a store with data", async (_c, e) => void loadDocument(e, graph().document, { descriptor: graph().descriptor })],
    ["an entry that is still loading", (c) => put(c, "loading", "r1").then(() => undefined)],
    ["an entry that is being removed", (c) => put(c, "removing").then(() => undefined)],
    ["an entry at another revision", (c) => put(c, "ready", "older").then(() => undefined)],
  ];
  it.each(cases)("%s", async (_name, setup) => {
    const e = await realEngine();
    const catalog = new Catalog(new MemoryCatalogStorage());
    loadDocument(e, graph().document, { descriptor: graph().descriptor }); // a store with the right data under the wrong record
    query(e, "CREATE (:Stale {id: 'old'})");
    await setup(catalog, e);
    expect(await open(e, catalog)).toEqual({ restored: false });
    expect(nodes(e)).toBe(PAGES);
    expect(query(e, "MATCH (s:Stale) RETURN count(s) AS c").rows[0]!.c).toBe(0);
    expect(await catalog.lookup(STORE)).toMatchObject({ status: "entry", entry: { state: "ready", revision: "r1" } });
  });

  it("a ready entry over a store with fewer nodes than the descriptor says", async () => {
    const e = await realEngine();
    const catalog = new Catalog(new MemoryCatalogStorage());
    await put(catalog, "ready", "r1");
    loadDocument(e, generateGraph(10, { id: "docs", revision: "r1" }).document);
    expect(await open(e, catalog)).toEqual({ restored: false });
    expect(nodes(e)).toBe(PAGES);
  });

  it("a ready entry over an empty store", async () => {
    const e = await realEngine();
    const catalog = new Catalog(new MemoryCatalogStorage());
    await put(catalog, "ready", "r1");
    expect(await open(e, catalog)).toEqual({ restored: false });
    expect(nodes(e)).toBe(PAGES);
  });
});

describe("the order of the writes", () => {
  it("writes loading before the store is reset and ready last", async () => {
    const e = await realEngine();
    const storage = new MemoryCatalogStorage();
    const catalog = new Catalog(storage);
    await open(e, catalog);
    const events: string[] = [];
    const reset = e.reset.bind(e);
    e.reset = () => (events.push("reset"), reset());
    const execute = e.execute.bind(e);
    e.execute = (s, p = null) => (/^UNWIND \$rows AS row CREATE \(n/.test(s) && events.push("load"), execute(s, p));
    const replace = storage.replace.bind(storage);
    storage.replace = async (text) => {
      events.push(`catalog ${(JSON.parse(text).graphs[STORE] as { state: string }).state}`);
      await replace(text);
    };
    expect(await open(e, catalog, "r2")).toEqual({ restored: false });
    expect(events.filter((x, i) => events.indexOf(x) === i)).toEqual(["catalog loading", "reset", "load", "catalog ready"]);
  });

  it("an interrupted load leaves loading, and the next open rebuilds", async () => {
    const e = await realEngine();
    const catalog = new Catalog(new MemoryCatalogStorage());
    const { descriptor } = graph("r1");
    await beginRebuild(e, catalog, descriptor);
    loadDocument(e, generateGraph(20, { id: "docs", revision: "r1" }).document); // stopped part-way
    expect(await catalog.lookup(STORE)).toMatchObject({ entry: { state: "loading" } });
    expect(await open(e, catalog)).toEqual({ restored: false });
    expect(nodes(e)).toBe(PAGES);
  });
});

describe("a catalog that cannot be used", () => {
  it.each([
    ["does not parse", "{truncated"],
    ["is of a newer format", JSON.stringify({ format: 2, graphs: {} })],
  ])("a catalog that %s does not fail the open: the graph loads in memory and the durable store and the file are left as they were", async (_name, text) => {
    const e = await realEngine();
    loadDocument(e, generateGraph(30, { id: "docs", revision: "old" }).document); // what the durable store holds
    const storage = new MemoryCatalogStorage(text);
    const result = await open(e, new Catalog(storage));
    expect(result.restored).toBe(false);
    expect(nodes(result.memory!)).toBe(PAGES);
    expect(nodes(e)).toBe(30); // not reset, not rewritten
    expect(await storage.read()).toBe(text);
  });

  it("a storage error on the loading write loads in memory and leaves the store and its entry as they were", async () => {
    const e = await realEngine();
    const storage = new MemoryCatalogStorage();
    const catalog = new Catalog(storage);
    await open(e, catalog, "r1"); // ready at r1
    const replace = storage.replace.bind(storage);
    storage.replace = async () => {
      throw new Error("the file storage failed");
    };
    const result = await open(e, catalog, "r2");
    storage.replace = replace;
    expect(nodes(result.memory!)).toBe(PAGES);
    expect(nodes(e)).toBe(PAGES);
    expect(await catalog.lookup(STORE)).toMatchObject({ entry: { state: "ready", revision: "r1" } });
    // a later r1 visit restores r1 data, not data of another revision
    expect(await open(e, catalog, "r1")).toEqual({ restored: true });
  });

  it("a failure of the catalog's file storage while looking up the entry rebuilds instead of failing", async () => {
    const e = await realEngine();
    const storage = new MemoryCatalogStorage();
    storage.read = async () => {
      throw new Error("the file storage failed");
    };
    const { descriptor } = graph();
    expect(await canRestore(e, new Catalog(storage), descriptor)).toBe(false);
  });
});
