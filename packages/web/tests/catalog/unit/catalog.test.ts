// covers-cat: FR-001, FR-002, FR-005
import { describe, expect, it } from "vitest";
import { Catalog, CatalogUnavailable } from "../../../src/catalog/catalog.js";
import { MemoryCatalogStorage } from "../../../src/catalog/memory-storage.js";
import type { EntryInput } from "../../../src/catalog/types.js";

const fixed = (iso: string) => () => new Date(iso);
const app = (over: Partial<Extract<EntryInput, { kind: "application" }>> = {}): EntryInput => ({ kind: "application", name: "orders", state: "ready", version: 1, seeded: true, ...over });
const cacheInput = (over: Partial<Extract<EntryInput, { kind: "cache" }>> = {}): EntryInput => ({ kind: "cache", name: "docs", state: "ready", revision: "r1", ...over });

describe("Catalog.update", () => {
  it("creates the file on the first write and reads the entry back", async () => {
    const storage = new MemoryCatalogStorage();
    const catalog = new Catalog(storage);
    const written = await catalog.set("app-orders", app());
    expect(await catalog.lookup("app-orders")).toEqual({ status: "entry", entry: written });
    expect(JSON.parse((await storage.read())!).format).toBe(1);
  });

  it("reports no entry for a missing file and for an absent key", async () => {
    const catalog = new Catalog(new MemoryCatalogStorage());
    expect(await catalog.lookup("app-orders")).toEqual({ status: "none" });
    await catalog.set("app-other", app({ name: "other" }));
    expect(await catalog.lookup("app-orders")).toEqual({ status: "none" });
  });

  it("keeps the other entries and the fields it does not know", async () => {
    const before = JSON.stringify({
      format: 1,
      top: "kept",
      graphs: {
        "app-orders": { kind: "application", name: "orders", state: "ready", version: 1, seeded: true, updatedAt: "2026-11-10T09:00:00.000Z", future: { a: 1 } },
        "rel-docs": { kind: "cache", name: "docs", state: "ready", revision: "r1", updatedAt: "2026-11-10T09:00:00.000Z" },
        "app-broken": { kind: "application" },
      },
    });
    const storage = new MemoryCatalogStorage(before);
    const catalog = new Catalog(storage, fixed("2026-11-10T10:00:00.000Z"));
    await catalog.set("app-orders", app({ version: 2 }));
    const file = JSON.parse((await storage.read())!);
    expect(file.top).toBe("kept");
    expect(file.graphs["app-orders"].future).toEqual({ a: 1 });
    expect(file.graphs["app-orders"].version).toBe(2);
    expect(file.graphs["rel-docs"].revision).toBe("r1");
    expect(file.graphs["app-broken"]).toEqual({ kind: "application" });
  });

  it("leaves the file alone when the change returns undefined", async () => {
    const storage = new MemoryCatalogStorage();
    const catalog = new Catalog(storage);
    await catalog.set("app-orders", app());
    const replaced = storage.replaced;
    const result = await catalog.update("app-orders", () => undefined);
    expect(result.changed).toBe(false);
    expect(storage.replaced).toBe(replaced);
  });

  it("deletes an entry, and deleting a missing one writes nothing", async () => {
    const storage = new MemoryCatalogStorage();
    const catalog = new Catalog(storage);
    await catalog.set("app-orders", app());
    await catalog.delete("app-orders");
    expect(await catalog.lookup("app-orders")).toEqual({ status: "none" });
    const replaced = storage.replaced;
    await catalog.delete("app-orders");
    expect(storage.replaced).toBe(replaced);
  });

  it("gives each write of one entry a strictly later updatedAt, even at the same instant", async () => {
    const catalog = new Catalog(new MemoryCatalogStorage(), fixed("2026-11-10T09:00:00.000Z"));
    const a = await catalog.set("app-orders", app());
    const b = await catalog.set("app-orders", app({ state: "seeding" }));
    const c = await catalog.set("app-orders", app());
    expect(Date.parse(b.updatedAt)).toBeGreaterThan(Date.parse(a.updatedAt));
    expect(Date.parse(c.updatedAt)).toBeGreaterThan(Date.parse(b.updatedAt));
  });

  it("passes the current entry and the raw value to the change", async () => {
    const catalog = new Catalog(new MemoryCatalogStorage(JSON.stringify({ format: 1, graphs: { "app-orders": { kind: "application" } } })));
    let seen: unknown[] = [];
    await catalog.update("app-orders", (current, raw) => {
      seen = [current, raw];
      return undefined;
    });
    expect(seen).toEqual([undefined, { kind: "application" }]);
  });

  it("does not overwrite a file that does not parse, and says why", async () => {
    const storage = new MemoryCatalogStorage("{truncated");
    const catalog = new Catalog(storage);
    await expect(catalog.set("app-orders", app())).rejects.toMatchObject({ name: "CatalogUnavailable", reason: "unreadable" });
    expect(await storage.read()).toBe("{truncated");
    expect(await catalog.lookup("app-orders")).toMatchObject({ status: "catalog-unreadable" });
  });

  it("does not overwrite a file of a newer format", async () => {
    const text = JSON.stringify({ format: 2, graphs: {} });
    const storage = new MemoryCatalogStorage(text);
    const catalog = new Catalog(storage);
    const error = await catalog.set("rel-docs", cacheInput()).catch((e) => e);
    expect(error).toBeInstanceOf(CatalogUnavailable);
    expect(error.reason).toBe("newer");
    expect(await storage.read()).toBe(text);
    expect(await catalog.lookup("rel-docs")).toEqual({ status: "catalog-newer", format: 2 });
  });

  it("reports a malformed entry as invalid without blocking the others", async () => {
    const catalog = new Catalog(new MemoryCatalogStorage(JSON.stringify({ format: 1, graphs: { "app-orders": { kind: "application" } } })));
    expect(await catalog.lookup("app-orders")).toMatchObject({ status: "invalid" });
    await catalog.set("rel-docs", cacheInput());
    expect(await catalog.lookup("rel-docs")).toMatchObject({ status: "entry" });
  });

  it("resets by deleting the file, also when it does not parse", async () => {
    const storage = new MemoryCatalogStorage("{truncated");
    const catalog = new Catalog(storage);
    await catalog.reset();
    expect(await storage.read()).toBeNull();
    await catalog.set("app-orders", app());
    expect(await catalog.lookup("app-orders")).toMatchObject({ status: "entry" });
  });
});

describe("the catalog under several writers", () => {
  it("loses no update when three catalogs over one storage each write 100 changes", async () => {
    const storage = new MemoryCatalogStorage();
    const tabs = [new Catalog(storage), new Catalog(storage), new Catalog(storage)];
    await tabs[0]!.set("app-counter", app({ name: "counter", version: 1 }));
    await Promise.all(
      tabs.map(async (tab) => {
        for (let i = 0; i < 100; i++) await tab.update("app-counter", (current) => ({ ...app({ name: "counter" }), version: (current as { version: number }).version + 1 }));
      }),
    );
    const found = await tabs[0]!.lookup("app-counter");
    expect(found.status === "entry" && (found.entry as { version: number }).version).toBe(301);
  });

  it("loses no entry when the writers touch different graphs", async () => {
    const storage = new MemoryCatalogStorage();
    await Promise.all(
      Array.from({ length: 30 }, (_, i) => new Catalog(storage).set(`app-g${i}`, app({ name: `g${i}` }))),
    );
    const read = await new Catalog(storage).read();
    expect(read.status === "ok" && Object.keys(read.file.graphs)).toHaveLength(30);
  });
});

describe("MemoryCatalogStorage locking", () => {
  it("lets readers hold the lock together and makes a writer wait for them and hold it alone", async () => {
    const storage = new MemoryCatalogStorage();
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const readerA = storage.withLock("shared", async () => {
      log.push("a in");
      await gate;
      log.push("a out");
    });
    const readerB = storage.withLock("shared", async () => {
      log.push("b in");
      await gate;
      log.push("b out");
    });
    const writer = storage.withLock("exclusive", async () => {
      log.push("w in");
      log.push("w out");
    });
    const lateReader = storage.withLock("shared", async () => {
      log.push("c in");
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(log).toEqual(["a in", "b in"]);
    release();
    await Promise.all([readerA, readerB, writer, lateReader]);
    expect(log.indexOf("w in")).toBeGreaterThan(log.indexOf("a out"));
    expect(log.indexOf("w in")).toBeGreaterThan(log.indexOf("b out"));
    expect(log.indexOf("c in")).toBeGreaterThan(log.indexOf("w out"));
  });

  it("releases the lock when the holder throws", async () => {
    const storage = new MemoryCatalogStorage();
    await expect(storage.withLock("exclusive", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(storage.withLock("exclusive", async () => "next")).resolves.toBe("next");
  });
});
