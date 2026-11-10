// covers-cat: FR-006, FR-009
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpfsCatalogStorage, catalogSupported } from "../../../src/catalog/opfs-storage.js";
import { storageAvailable } from "../../../src/worker/application/open-store.js";

const notFound = (): Error => Object.assign(new Error("not found"), { name: "NotFoundError" });

/** A small in-memory origin-private file system: `relate-web/catalog.json` is the only path the catalog uses. */
function fakeStorage(options: { writable: boolean }) {
  const files = new Map<string, string>();
  const used: string[] = [];
  const fileHandle = (key: string) => {
    const handle: Record<string, unknown> = {
      getFile: async () => {
        if (!files.has(key)) throw notFound();
        return { text: async () => files.get(key)! };
      },
      createSyncAccessHandle: async () => {
        used.push("sync");
        let bytes = new Uint8Array();
        return {
          truncate: () => (bytes = new Uint8Array()),
          write: (buf: Uint8Array) => ((bytes = buf), buf.length),
          flush: () => files.set(key, new TextDecoder().decode(bytes)),
          close: () => undefined,
        };
      },
    };
    if (options.writable) {
      handle.createWritable = async () => {
        used.push("writable");
        let text = "";
        return { write: async (t: string) => (text = t), close: async () => void files.set(key, text) };
      };
    }
    return handle;
  };
  const dir = {
    getFileHandle: async (name: string, o?: { create?: boolean }) => {
      if (!files.has(name) && !o?.create) throw notFound();
      if (!files.has(name)) files.set(name, "");
      return fileHandle(name);
    },
    removeEntry: async (name: string) => {
      if (!files.delete(name)) throw notFound();
    },
  };
  let exists = false;
  const root = {
    getDirectoryHandle: async (_name: string, o?: { create?: boolean }) => {
      if (!exists && !o?.create) throw notFound();
      exists = true;
      return dir;
    },
  };
  return { files, used, root };
}

function fakeNavigator(options: { writable?: boolean; locks?: boolean; storage?: boolean }) {
  const fs = fakeStorage({ writable: options.writable ?? true });
  const requests: Array<{ name: string; mode: string }> = [];
  const navigator: Record<string, unknown> = {};
  if (options.storage !== false) navigator.storage = { getDirectory: async () => fs.root };
  if (options.locks !== false) {
    navigator.locks = {
      request: async (name: string, o: { mode: string }, fn: () => Promise<unknown>) => {
        requests.push({ name, mode: o.mode });
        return fn();
      },
    };
  }
  return { navigator, fs, requests };
}

afterEach(() => vi.unstubAllGlobals());

describe("replacing the catalog file (FR-006)", () => {
  it("goes through a writable stream, which swaps the file on close", async () => {
    const { navigator, fs } = fakeNavigator({ writable: true });
    vi.stubGlobal("navigator", navigator);
    const storage = new OpfsCatalogStorage();
    expect(await storage.read()).toBeNull();
    await storage.replace('{"format":1,"graphs":{}}');
    expect(fs.used).toEqual(["writable"]);
    expect(await storage.read()).toBe('{"format":1,"graphs":{}}');
  });

  it("falls back to a synchronous access handle where the stream is absent", async () => {
    const { navigator, fs } = fakeNavigator({ writable: false });
    vi.stubGlobal("navigator", navigator);
    const storage = new OpfsCatalogStorage();
    await storage.replace("first");
    await storage.replace("second");
    expect(fs.used).toEqual(["sync", "sync"]);
    expect(await storage.read()).toBe("second");
  });

  it("removes the file and treats a file that is already gone as removed", async () => {
    const { navigator } = fakeNavigator({});
    vi.stubGlobal("navigator", navigator);
    const storage = new OpfsCatalogStorage();
    await storage.remove(); // no directory yet
    await storage.replace("x");
    await storage.remove();
    expect(await storage.read()).toBeNull();
    await storage.remove(); // the file is gone
  });
});

describe("the lock (FR-005)", () => {
  it("is the Web Lock relate-web:catalog, taken in the mode asked for", async () => {
    const { navigator, requests } = fakeNavigator({});
    vi.stubGlobal("navigator", navigator);
    const storage = new OpfsCatalogStorage();
    expect(await storage.withLock("shared", async () => "r")).toBe("r");
    expect(await storage.withLock("exclusive", async () => "w")).toBe("w");
    expect(requests).toEqual([
      { name: "relate-web:catalog", mode: "shared" },
      { name: "relate-web:catalog", mode: "exclusive" },
    ]);
  });
});

describe("storage needs both the file storage and Web Locks (FR-009)", () => {
  it("is supported with both", async () => {
    vi.stubGlobal("navigator", fakeNavigator({}).navigator);
    expect(catalogSupported()).toBe(true);
    expect(await storageAvailable()).toBe(true);
  });

  it("is not supported without Web Locks, so the onUnavailable rule applies", async () => {
    vi.stubGlobal("navigator", fakeNavigator({ locks: false }).navigator);
    expect(catalogSupported()).toBe(false);
    expect(await storageAvailable()).toBe(false);
  });

  it("is not supported without the origin-private storage", async () => {
    vi.stubGlobal("navigator", fakeNavigator({ storage: false }).navigator);
    expect(catalogSupported()).toBe(false);
    expect(await storageAvailable()).toBe(false);
  });

  it("is not supported where there is no navigator at all", async () => {
    vi.stubGlobal("navigator", undefined);
    expect(catalogSupported()).toBe(false);
    expect(await storageAvailable()).toBe(false);
  });
});
