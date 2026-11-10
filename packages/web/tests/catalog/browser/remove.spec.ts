// covers-cat: FR-017, FR-019, FR-020, FR-021, FR-022
import { catalogFile, entry, writeCatalogText } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { count, diagnostic, itemSeed, makeClient, openHarness, openReady, rows, seed, status } from "./helpers.js";

type Page = import("@playwright/test").Page;

const remove = (page: Page, store: string, kind: unknown) =>
  page.evaluate(
    async ([s, k]) => {
      try {
        return { ok: true as const, result: await window.app.core.removeGraph(s as string, { kind: k } as never) };
      } catch (e) {
        return { ok: false as const, reason: (e as { reason?: string }).reason ?? String(e) };
      }
    },
    [store, kind] as const,
  );

/** Retry while the browser still holds a closing page's files (a busy worker may take seconds to release them). */
async function removeWhenFree(page: Page, store: string, kind: string) {
  let outcome = await remove(page, store, kind);
  for (let i = 0; i < 40 && !outcome.ok && outcome.reason === "locked"; i++) {
    await page.waitForTimeout(300);
    outcome = await remove(page, store, kind);
  }
  return outcome;
}

const directoryExists = (page: Page, store: string) =>
  page.evaluate(async (s) => {
    try {
      await (await (await navigator.storage.getDirectory()).getDirectoryHandle("relate")).getDirectoryHandle(s);
      return true;
    } catch {
      return false;
    }
  }, store);

test("an idle application graph is removed, directory and entry, and the result says its data was discarded", async ({ page }) => {
  await openReady(page, { name: "idle", version: 1, seed });
  await page.evaluate(() => window.client!.destroy());
  const outcome = await removeWhenFree(page, "app-idle", "application");
  expect(outcome).toMatchObject({ ok: true, result: { store: "app-idle", kind: "application", discarded: "application data", entry: { state: "ready", version: 1 } } });
  expect(await directoryExists(page, "app-idle")).toBe(false);
  expect(await entry(page, "app-idle")).toBeUndefined();
});

test("an application graph is not removed unless the call says it is one, or if it says it is a cache", async ({ page }) => {
  await openReady(page, { name: "kind", version: 1, seed });
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  expect(await remove(page, "app-kind", undefined)).toEqual({ ok: false, reason: "kind-mismatch" });
  expect(await remove(page, "app-kind", "cache")).toEqual({ ok: false, reason: "kind-mismatch" });
  expect(await remove(page, "other", "cache")).toEqual({ ok: false, reason: "not-a-store" });
  expect(await directoryExists(page, "app-kind")).toBe(true);
  expect(await entry(page, "app-kind")).toMatchObject({ state: "ready" });
});

test("a store another tab holds is refused as locked, its entry is as the holder left it, and the holder keeps working", async ({ context, page }) => {
  await openReady(page, { name: "held", version: 1, seed });
  const other = await context.newPage();
  await openHarness(other, "/other.html");
  const outcome = await remove(other, "app-held", "application");
  expect(outcome).toEqual({ ok: false, reason: "locked" });
  expect(await entry(other, "app-held")).toMatchObject({ state: "ready", version: 1, seeded: true });
  expect(await directoryExists(other, "app-held")).toBe(true);
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
});

test("a holder that keeps writing its entry while a removal is refused is never rolled back", async ({ context, page }) => {
  await openReady(page, { name: "busy", version: 1, seed });
  const other = await context.newPage();
  await openHarness(other, "/other.html");
  const holder = page.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    let writes = 0;
    const until = Date.now() + 1500;
    while (Date.now() < until) {
      await catalog.update("app-busy", (current) => ({ kind: "application", name: "busy", state: "ready", version: (current as { version: number }).version + 1, seeded: true }));
      writes++;
    }
    return writes;
  });
  await page.waitForTimeout(100);
  for (let i = 0; i < 5; i++) expect(await remove(other, "app-busy", "application")).toEqual({ ok: false, reason: "locked" });
  const writes = await holder;
  const final = await entry(page, "app-busy");
  expect(final).toMatchObject({ state: "ready" });
  expect(final!.version).toBe(1 + writes);
});

test("a directory the catalog does not know is removed by name", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(async () => {
    const dir = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("relate", { create: true })).getDirectoryHandle("rel-stray", { create: true });
    const w = await (await dir.getFileHandle("slot-0", { create: true })).createWritable();
    await w.write("x");
    await w.close();
  });
  const outcome = await remove(page, "rel-stray", "cache");
  expect(outcome).toMatchObject({ ok: true, result: { discarded: "unregistered directory", entry: null } });
  expect(await directoryExists(page, "rel-stray")).toBe(false);
});

test("a catalog that does not parse fails applications, resetCatalog recovers it without touching a store, and resetApplication finishes", async ({ page }) => {
  await openReady(page, { name: "damaged", version: 1, seed });
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  await writeCatalogText(page, "{truncated");

  const open = async () => {
    await openHarness(page);
    await makeClient(page, { name: "damaged", version: 1, seed });
    await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
    return status(page);
  };
  expect(await open()).toBe("failed");
  expect(await diagnostic(page)).toMatchObject({ reason: "store-unreadable", engineError: expect.stringContaining("catalog") });
  expect(await directoryExists(page, "app-damaged")).toBe(true);

  expect(await page.evaluate(() => window.app.core.resetCatalog())).toEqual({ deleted: true });
  expect(await catalogFile(page)).toBeNull();
  expect(await directoryExists(page, "app-damaged")).toBe(true);
  expect(await page.evaluate(() => window.app.core.resetCatalog())).toEqual({ deleted: false });

  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  expect(await open()).toBe("failed");
  expect((await diagnostic(page))?.reason).toBe("store-unmarked");

  await page.evaluate(() => window.client!.resetApplication());
  expect(await status(page)).toBe("ready");
  expect(await count(page, "MATCH (v:Person {id: 'v'}) RETURN count(v) AS c")).toBe(0);
  expect(await entry(page, "app-damaged")).toMatchObject({ state: "ready" });
});

test("the core removes no application graph on its own: a stale cache is rebuilt and the application is untouched", async ({ page }) => {
  await openReady(page, { name: "keeper", version: 1, seed: itemSeed(50) });
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  const before = await entry(page, "app-keeper");
  let served = "r1";
  await page.route("**/data/stale.json", (route) => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, labels: ["Page"], properties: { n: i } }));
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ version: 1, revision: served, nodes, links: [] }) });
  });
  const visit = async (revision: string) => {
    served = revision;
    await openHarness(page);
    const final = await page.evaluate(
      (r) =>
        new Promise<string>((resolve) => {
          const descriptor = { version: 1, id: "stale", revision: r, data: { url: "/data/stale.json", nodes: 10, links: 0 } };
          const client = window.app.core.createClient({ engineUrl: window.app.engineUrl, navigation: "multi-page", graph: { descriptor } });
          window.client = client;
          client.on("status", () => ["ready", "failed"].includes(client.status) && resolve(client.status));
        }),
      revision,
    );
    expect(final).toBe("ready");
  };
  await visit("r1");
  await page.waitForTimeout(600);
  await visit("r2");
  expect(await entry(page, "rel-stale")).toMatchObject({ state: "ready", revision: "r2" });
  expect(await entry(page, "app-keeper")).toEqual(before);
  expect(await directoryExists(page, "app-keeper")).toBe(true);
});
