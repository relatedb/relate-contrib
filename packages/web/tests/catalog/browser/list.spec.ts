// covers-cat: FR-017, FR-018, SC-007
import { writeCatalogText } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { count, openHarness, openReady, record, rows, seed } from "./helpers.js";

type Page = import("@playwright/test").Page;

const list = (page: Page, sizes = false) => page.evaluate((s) => window.app.core.listGraphs({ sizes: s }), sizes);

/** A directory `relate/<store>` of `files` small files, shaped like an engine store. */
async function fakeStore(page: Page, store: string, files = 65, bytes = 100): Promise<void> {
  await page.evaluate(
    async ([name, n, size]) => {
      const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("relate", { create: true })).getDirectoryHandle(name as string, { create: true });
      for (let i = 0; i < (n as number); i++) {
        const w = await (await dir.getFileHandle(`slot-${i}`, { create: true })).createWritable();
        await w.write("x".repeat(size as number));
        await w.close();
      }
    },
    [store, files, bytes] as const,
  );
}

async function removeDirectory(page: Page, store: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async (s) => {
          try {
            await (await (await navigator.storage.getDirectory()).getDirectoryHandle("relate")).removeEntry(s, { recursive: true });
            return "removed";
          } catch (e) {
            return String(e);
          }
        }, store),
      { timeout: 20_000 },
    )
    .toBe("removed");
}

test("an origin that stored nothing lists nothing", async ({ page }) => {
  await openHarness(page);
  expect(await list(page)).toEqual({ catalog: "missing", items: [] });
});

test("an application graph and a cache are listed with kind, name, state, version or revision, and their store's presence", async ({ page }) => {
  await openReady(page, { name: "orders", version: 1, seed });
  await page.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    await catalog.set("rel-docs", { kind: "cache", name: "docs", state: "ready", revision: "r7" });
  });
  await fakeStore(page, "rel-docs");
  const listing = await list(page);
  expect(listing.catalog).toBe("ok");
  expect(listing.items).toEqual([
    { store: "app-orders", kind: "application", name: "orders", state: "ready", version: 1, registered: true, present: true, status: "ok" },
    { store: "rel-docs", kind: "cache", name: "docs", state: "ready", revision: "r7", registered: true, present: true, status: "ok" },
  ]);
});

test("a directory with no entry is unregistered and an entry with no directory is missing", async ({ page }) => {
  await openReady(page, { name: "gone", version: 1, seed });
  await page.evaluate(() => window.client!.destroy());
  await removeDirectory(page, "app-gone");
  await fakeStore(page, "app-stray");
  const items = (await list(page)).items;
  expect(items.find((i) => i.store === "app-gone")).toMatchObject({ registered: true, present: false, status: "missing" });
  expect(items.find((i) => i.store === "app-stray")).toMatchObject({ registered: false, present: true, status: "unregistered" });
});

test("no store file is read without sizes, and every store's size and modification time are read with them", async ({ page }) => {
  await openHarness(page);
  await fakeStore(page, "app-one", 65, 100);
  await fakeStore(page, "rel-two", 65, 50);
  const reads = (sizes: boolean) =>
    page.evaluate(async (s) => {
      const proto = FileSystemFileHandle.prototype;
      const original = proto.getFile;
      let calls = 0;
      proto.getFile = function (this: FileSystemFileHandle) {
        calls++;
        return original.call(this);
      };
      try {
        const listing = await window.app.core.listGraphs({ sizes: s });
        return { calls, items: listing.items };
      } finally {
        proto.getFile = original;
      }
    }, sizes);
  const without = await reads(false);
  expect(without.calls).toBeLessThanOrEqual(1); // at most the catalog file itself
  expect(without.items.every((i) => i.size === undefined && i.modified === undefined)).toBe(true);
  const withSizes = await reads(true);
  expect(withSizes.calls).toBeGreaterThanOrEqual(130); // every slot file of both stores
  const sizes = Object.fromEntries(withSizes.items.map((i) => [i.store, i.size]));
  expect(sizes).toEqual({ "app-one": 6500, "rel-two": 3250 });
  expect(withSizes.items.every((i) => typeof i.modified === "number" && i.modified > 0)).toBe(true);
});

test("listing ten stores with sizes is recorded, and the listing opens no store", async ({ page }, info) => {
  await openHarness(page);
  for (let i = 0; i < 10; i++) await fakeStore(page, `rel-s${i}`);
  const runs: number[] = [];
  let workers = 0;
  await page.evaluate(() => {
    const Original = window.Worker;
    (window as unknown as { workersMade: number }).workersMade = 0;
    window.Worker = class extends Original {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        (window as unknown as { workersMade: number }).workersMade++;
      }
    };
  });
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    const listing = await list(page, true);
    runs.push(Date.now() - t);
    expect(listing.items).toHaveLength(10);
    expect(listing.items.every((it) => it.size === 6500)).toBe(true);
  }
  workers = await page.evaluate(() => (window as unknown as { workersMade: number }).workersMade);
  record(info, "list", "ten-stores-with-sizes", { runsMs: runs, method: "ten directories of 65 files of 100 bytes, listGraphs({ sizes: true }) from the page, three runs" });
  expect(workers).toBe(0); // no worker, so no engine, so no store was opened
});

test("listing succeeds beside a store another tab holds, and the holder keeps working", async ({ context, page }) => {
  await openReady(page, { name: "held", version: 1, seed });
  const other = await context.newPage();
  await openHarness(other, "/other.html");
  const listing = await list(other, true);
  const held = listing.items.find((i) => i.store === "app-held");
  expect(held).toMatchObject({ registered: true, present: true, status: "ok", state: "ready" });
  expect(held!.size).toBeGreaterThan(0);
  await rows(page, "CREATE (:Person {id: 'later', name: 'Later'})");
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(4);
});

test("a catalog that does not parse, or is of a newer format, lists the directories only, each unregistered", async ({ page }) => {
  await openHarness(page);
  await fakeStore(page, "app-a");
  await writeCatalogText(page, "{truncated");
  expect(await list(page)).toMatchObject({ catalog: "unreadable", items: [{ store: "app-a", status: "unregistered" }] });
  await writeCatalogText(page, JSON.stringify({ format: 2, graphs: { "app-a": {} } }));
  expect(await list(page)).toMatchObject({ catalog: "newer", items: [{ store: "app-a", status: "unregistered" }] });
});
