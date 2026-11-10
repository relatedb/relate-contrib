// covers-cat: FR-017, FR-019, FR-020, FR-021, FR-022
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Catalog } from "../../../src/catalog/catalog.js";
import { StoreHeldError, type StoreDirectories } from "../../../src/catalog/directory.js";
import { MemoryCatalogStorage } from "../../../src/catalog/memory-storage.js";
import { performRemoval, RemoveRefused } from "../../../src/catalog/remove.js";
import type { EntryInput } from "../../../src/catalog/types.js";

const appEntry = (over: Partial<Extract<EntryInput, { kind: "application" }>> = {}): EntryInput => ({ kind: "application", name: "orders", state: "ready", version: 2, seeded: true, ...over });
const cacheEntry = (): EntryInput => ({ kind: "cache", name: "docs", state: "ready", revision: "r1" });

/** Directories in memory, with a hook that runs while a removal is in flight, and a switch for a held store. */
function directories(names: string[], opts: { held?: boolean; during?: () => Promise<void> } = {}) {
  const present = new Set(names);
  const log: string[] = [];
  const dirs: StoreDirectories = {
    exists: async (store) => present.has(store),
    remove: async (store) => {
      log.push(`remove ${store}`);
      await opts.during?.();
      if (opts.held) throw new StoreHeldError(store);
      return present.delete(store);
    },
  };
  return { dirs, present, log };
}

function setup() {
  const storage = new MemoryCatalogStorage();
  const catalog = new Catalog(storage);
  const events: string[] = [];
  const replace = storage.replace.bind(storage);
  storage.replace = async (text) => {
    const file = JSON.parse(text) as { graphs: Record<string, { state: string }> };
    events.push(`catalog ${Object.entries(file.graphs).map(([k, v]) => `${k} ${v.state}`).join(", ") || "(empty)"}`);
    await replace(text);
  };
  return { storage, catalog, events };
}

describe("what may be removed", () => {
  it("refuses a name that is not a store the core keeps", async () => {
    const { catalog } = setup();
    const { dirs, log } = directories(["other"]);
    await expect(performRemoval(catalog, dirs, "other", { kind: "cache" })).rejects.toMatchObject({ name: "RemoveRefused", reason: "not-a-store" });
    expect(log).toEqual([]);
  });

  it("refuses a call that does not say what is being removed", async () => {
    const { catalog, storage } = setup();
    await catalog.set("app-orders", appEntry());
    const { dirs, log } = directories(["app-orders"]);
    const replaced = storage.replaced;
    await expect(performRemoval(catalog, dirs, "app-orders", {} as never)).rejects.toMatchObject({ reason: "kind-mismatch" });
    expect(log).toEqual([]);
    expect(storage.replaced).toBe(replaced);
  });

  it("refuses when the kind stated differs from the entry's, in both directions, and writes nothing", async () => {
    const { catalog, storage } = setup();
    await catalog.set("app-orders", appEntry());
    await catalog.set("rel-docs", cacheEntry());
    const { dirs, log } = directories(["app-orders", "rel-docs"]);
    const replaced = storage.replaced;
    await expect(performRemoval(catalog, dirs, "app-orders", { kind: "cache" })).rejects.toMatchObject({ reason: "kind-mismatch" });
    await expect(performRemoval(catalog, dirs, "rel-docs", { kind: "application" })).rejects.toMatchObject({ reason: "kind-mismatch" });
    expect(log).toEqual([]);
    expect(storage.replaced).toBe(replaced);
  });
});

describe("removing a graph", () => {
  it("writes removing before the directory goes and deletes the entry last, and reports what was discarded", async () => {
    const { catalog, events } = setup();
    await catalog.set("app-orders", appEntry());
    events.length = 0;
    const { dirs, log, present } = directories(["app-orders"]);
    const original = dirs.remove;
    dirs.remove = async (s) => (events.push("directory removed"), original(s));
    const result = await performRemoval(catalog, dirs, "app-orders", { kind: "application" });
    expect(events).toEqual(["catalog app-orders removing", "directory removed", "catalog (empty)"]);
    expect(log).toEqual(["remove app-orders"]);
    expect(present.has("app-orders")).toBe(false);
    expect(result).toMatchObject({ store: "app-orders", kind: "application", discarded: "application data", entry: { name: "orders", version: 2, state: "ready" } });
    expect(await catalog.lookup("app-orders")).toEqual({ status: "none" });
  });

  it("removes an idle cache and says it was a cache", async () => {
    const { catalog } = setup();
    await catalog.set("rel-docs", cacheEntry());
    const result = await performRemoval(catalog, directories(["rel-docs"]).dirs, "rel-docs", { kind: "cache" });
    expect(result).toMatchObject({ discarded: "cache", kind: "cache" });
    expect(await catalog.lookup("rel-docs")).toEqual({ status: "none" });
  });

  it("removes a directory the catalog does not know, writing nothing to the catalog", async () => {
    const { catalog, storage } = setup();
    const { dirs, present } = directories(["app-stray"]);
    const replaced = storage.replaced;
    const result = await performRemoval(catalog, dirs, "app-stray", { kind: "application" });
    expect(result).toMatchObject({ discarded: "unregistered directory", entry: null });
    expect(present.has("app-stray")).toBe(false);
    expect(storage.replaced).toBe(replaced);
  });

  it("an entry with no directory is deleted, and a name with neither is a removal of nothing", async () => {
    const { catalog } = setup();
    await catalog.set("rel-docs", cacheEntry());
    expect(await performRemoval(catalog, directories([]).dirs, "rel-docs", { kind: "cache" })).toMatchObject({ discarded: "cache" });
    expect(await catalog.lookup("rel-docs")).toEqual({ status: "none" });
    expect(await performRemoval(catalog, directories([]).dirs, "rel-docs", { kind: "cache" })).toMatchObject({ discarded: "nothing", entry: null });
  });

  it("goes ahead with the directory when the catalog cannot be used, and leaves the file as it was", async () => {
    const storage = new MemoryCatalogStorage("{truncated");
    const { dirs, present } = directories(["app-orders"]);
    const result = await performRemoval(new Catalog(storage), dirs, "app-orders", { kind: "application" });
    expect(present.has("app-orders")).toBe(false);
    expect(result.discarded).toBe("unregistered directory");
    expect(await storage.read()).toBe("{truncated");
  });
});

describe("a store another tab holds", () => {
  it("rejects locked and puts the entry back as it was", async () => {
    const { catalog } = setup();
    await catalog.set("app-orders", appEntry({ state: "migrating", version: 1, target: 2 } as never));
    const { dirs, present } = directories(["app-orders"], { held: true });
    await expect(performRemoval(catalog, dirs, "app-orders", { kind: "application" })).rejects.toMatchObject({ name: "RemoveRefused", reason: "locked" });
    expect(present.has("app-orders")).toBe(true);
    expect(await catalog.lookup("app-orders")).toMatchObject({ status: "entry", entry: { state: "migrating", version: 1, target: 2 } });
  });

  it("does not overwrite the holder's newer entry when it restores", async () => {
    const { catalog } = setup();
    await catalog.set("app-orders", appEntry({ version: 1 }));
    // while the removal is trying the files, the holder finishes a migration and writes its own entry
    const { dirs } = directories(["app-orders"], {
      held: true,
      during: async () => void (await catalog.set("app-orders", appEntry({ version: 3 }))),
    });
    await expect(performRemoval(catalog, dirs, "app-orders", { kind: "application" })).rejects.toMatchObject({ reason: "locked" });
    expect(await catalog.lookup("app-orders")).toMatchObject({ entry: { state: "ready", version: 3 } });
  });

  it("does not delete the holder's newer entry either when the directory goes after all", async () => {
    const { catalog } = setup();
    await catalog.set("app-orders", appEntry({ version: 1 }));
    const { dirs } = directories(["app-orders"], { during: async () => void (await catalog.set("app-orders", appEntry({ version: 3 }))) });
    await performRemoval(catalog, dirs, "app-orders", { kind: "application" });
    expect(await catalog.lookup("app-orders")).toMatchObject({ entry: { version: 3 } });
  });
});

describe("resetting the catalog", () => {
  it("deletes the file and says whether there was one, and touches no entry's store", async () => {
    const { catalog, storage } = setup();
    await catalog.set("app-orders", appEntry());
    expect(await catalog.reset()).toBe(true);
    expect(await storage.read()).toBeNull();
    expect(await catalog.reset()).toBe(false);
  });

  it("works on a file that does not parse", async () => {
    const storage = new MemoryCatalogStorage("{truncated");
    expect(await new Catalog(storage).reset()).toBe(true);
    expect(await storage.read()).toBeNull();
  });
});

describe("the core removes nothing by itself but a stale cache and a leftover stored copy (FR-022)", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
  const src = join(import.meta.dirname, "../../../src");

  it("calls removeEntry only where a catalog operation, the catalog file or the legacy copy needs it", () => {
    const users = walk(src)
      .filter((f) => f.endsWith(".ts") && /\.removeEntry\(/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(src.length + 1))
      .sort();
    expect(users).toEqual(["catalog/directory.ts", "catalog/opfs-storage.ts", "worker/legacy-copy.ts"]);
  });

  it("never reaches a store directory from the lifecycle or the cache path", () => {
    for (const file of ["worker/cache.ts", "worker/application/lifecycle.ts", "worker/application/init.ts", "worker/worker.ts"]) {
      const text = readFileSync(join(src, file), "utf8");
      expect(text, file).not.toContain("removeGraph");
      expect(text, file).not.toContain("opfsDirectories");
    }
  });
});
