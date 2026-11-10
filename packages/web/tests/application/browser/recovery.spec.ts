// covers-app: FR-007, FR-008, FR-009, FR-010, SC-003
import { expect, test } from "./fixtures.js";
import { entry, putEntry, writeCatalogText, catalogText } from "../../catalog/browser/catalog-file.js";
import { RUNAWAY, count, diagnostic, makeBulk, makeClient, openHarness, openReady, rows, seed, status, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "rec", version: 1, seed, ...over });

/** Reload the page and open a client on the same store; resolves when it is ready or failed. */
async function reopen(page: import("@playwright/test").Page, over: Record<string, unknown> = {}): Promise<string> {
  await openHarness(page);
  await makeClient(page, app(over));
  await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
  return status(page);
}

const people = (page: import("@playwright/test").Page) => count(page, "MATCH (p:Person) RETURN count(p) AS c");

test("an interrupted first run is reset and seeded again", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, app({ seed: { version: 1, nodes: [{ id: "ok", labels: ["Half"] }, { labels: ["NoId"] }], links: [] } }));
  await waitStatus(page, "failed"); // an invalid seed is refused before anything is written
  expect(await entry(page, "app-rec")).toBeUndefined();
  expect(await reopen(page)).toBe("ready");
  expect(await people(page)).toBe(3);
  expect(await entry(page, "app-rec")).toMatchObject({ state: "ready" });
});

type Change = { entry: Record<string, unknown> | null } | { catalogFormat: number };
for (const [name, change, reason, recoverable] of [
  ["an interrupted import", { entry: { state: "importing" } }, "import-interrupted", true],
  ["a removed entry", { entry: null }, "store-unmarked", true],
  ["a newer version", { entry: { version: 9 } }, "store-newer", true],
  ["a newer catalog format", { catalogFormat: 2 }, "store-newer", false],
  ["an emptied store", { entry: { state: "ready" } }, "store-lost", true],
] as Array<[string, Change, string, boolean]>) {
  test(`${name} fails ${reason}, leaves the data alone and ${recoverable ? "resetApplication recovers" : "resetApplication cannot write over it"}`, async ({ page }) => {
    await openReady(page, app());
    await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
    if ("catalogFormat" in change) {
      const text = JSON.parse((await catalogText(page))!);
      await writeCatalogText(page, JSON.stringify({ ...text, format: change.catalogFormat }));
    } else if (reason === "store-lost") {
      await rows(page, "MATCH (n) DETACH DELETE n");
      await rows(page, "DROP INDEX Person_name IF EXISTS");
    } else {
      await putEntry(page, "app-rec", change.entry);
    }
    const before = await count(page, "MATCH (n) RETURN count(n) AS c").catch(() => 0);
    const file = await catalogText(page);

    expect(await reopen(page)).toBe("failed");
    expect((await diagnostic(page))?.reason).toBe(reason);
    const message = await page.evaluate(() => window.client!.failureMessage());
    expect(message).toContain("resetApplication()");

    // retry fails again without writing
    await page.evaluate(() => window.client!.retry());
    await page.waitForFunction(() => window.client!.status === "failed");
    expect((await diagnostic(page))?.reason).toBe(reason);
    expect(await catalogText(page)).toBe(file);

    if (!recoverable) {
      // the catalog is never written over, so a reset cannot proceed either
      await page.evaluate(() => window.client!.resetApplication().catch(() => undefined));
      expect(await catalogText(page)).toBe(file);
      return;
    }
    if (reason === "store-newer") {
      // code at the stored version opens the data as it was
      await page.evaluate(() => window.client!.destroy());
      await page.waitForTimeout(500);
      await openHarness(page);
      await makeClient(page, app({ version: 9, migrations: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 2), ["RETURN 1"]])) }));
      await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
      expect(await status(page)).toBe("ready");
      expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(before);
    }

    // resetApplication is the way out
    await page.evaluate(() => window.client?.destroy());
    await page.waitForTimeout(500);
    await openHarness(page);
    await makeClient(page, app());
    await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
    if ((await status(page)) === "failed") {
      await page.evaluate(() => window.client!.resetApplication());
      expect(await status(page)).toBe("ready");
    }
    expect(await people(page)).toBe(3);
    expect(await count(page, "MATCH (v:Person {id: 'v'}) RETURN count(v) AS c")).toBe(0);
  });
}

test("a reload of a ready store resets nothing", async ({ page }) => {
  await openReady(page, app());
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  expect(await reopen(page)).toBe("ready");
  expect(await people(page)).toBe(4);
});

test("a replaced worker reopens the same store and keeps the visitor's record", async ({ page }) => {
  await openReady(page, app());
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  await makeBulk(page);
  const outcome = await page.evaluate(async (runaway) => {
    const run = window.client!.run(runaway, null, { timeoutMs: 300 });
    try {
      await run.result;
      return "finished";
    } catch (e) {
      return (e as { reason?: string }).reason ?? String(e);
    }
  }, RUNAWAY);
  expect(outcome).toBe("timeout");
  await page.waitForFunction(() => window.client!.status === "ready" && window.client!.generation >= 2, null, { timeout: 60_000 });
  expect(await count(page, "MATCH (v:Person {id: 'v'}) RETURN count(v) AS c")).toBe(1);
  expect(await people(page)).toBe(4);
  expect(await count(page, "MATCH (b:Bulk) RETURN count(b) AS c")).toBe(1000);
  expect(await count(page, "MATCH (b:Bulk) RETURN count(b) AS c")).toBe(1000);
});
