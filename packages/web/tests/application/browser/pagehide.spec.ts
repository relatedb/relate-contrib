// covers-app: FR-019, FR-010
import { expect, test } from "./fixtures.js";
import { count, makeClient, openHarness, openReady, record, seed, storage, waitStatus } from "./helpers.js";

const app = () => ({ name: "hide", version: 1, seed });

test("the departing page's pagehide ends its worker so the next page opens the store without waiting", async ({ context, page }, info) => {
  await openReady(page, app());
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const next = await context.newPage();
  await openHarness(next, "/other.html");
  const log = await next.evaluate((a) => {
    const w = window as unknown as { log: string[] };
    w.log = [];
    const client = window.app.make(a as never);
    client.on("storage", (s) => w.log.push(s.kind));
    return true;
  }, app());
  expect(log).toBe(true);
  const t0 = Date.now();
  await waitStatus(next, "ready", 30_000);
  const ms = Date.now() - t0;
  expect(await next.evaluate(() => (window as unknown as { log: string[] }).log)).not.toContain("waiting");
  expect(await count(next, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
  record(info, "pagehide", "next-page-ready-after-pagehide-ms", ms);
});

test("a full navigation from one page to the next finds the store free", async ({ page }) => {
  await openReady(page, app());
  await openHarness(page, "/other.html");
  await makeClient(page, app());
  await waitStatus(page, "ready", 30_000);
  expect(await storage(page)).toMatchObject({ kind: "durable" });
});

test("a page restored from the back-forward cache starts its client again", async ({ context, page }) => {
  await openReady(page, app());
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  const other = await context.newPage();
  await openReady(other, app(), "/other.html");
  await other.close();
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
  await page.waitForFunction(() => window.client!.status === "ready", null, { timeout: 30_000 });
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
  expect(await page.evaluate(() => window.client!.generation)).toBeGreaterThanOrEqual(2);
});
