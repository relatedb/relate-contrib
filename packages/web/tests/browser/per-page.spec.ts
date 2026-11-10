// covers: FR-021, FR-022, FR-024, FR-027, SC-007
import { expect, test } from "./fixtures.js";
import { query, restored, visitSite } from "./helpers.js";

test("a changed revision resets the store, fetches the data, and shows only the new data", async ({ page, context }) => {
  await visitSite(page, { id: "changed", pages: 300, revision: "r1" });
  await page.close();
  const next = await context.newPage();
  const visit = await visitSite(next, { id: "changed", pages: 400, revision: "r2" });
  expect(visit.dataRequests).toHaveLength(1);
  expect(await restored(next)).toBe(false);
  expect(await query(next, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 400 }]);
  await next.close();
  const again = await context.newPage();
  const restoredVisit = await visitSite(again, { id: "changed", pages: 400, revision: "r2" });
  expect(restoredVisit.dataRequests).toHaveLength(0);
  expect(await restored(again)).toBe(true);
});

test("two graphs with different ids keep separate stores", async ({ page, context }) => {
  await visitSite(page, { id: "alpha", pages: 150, revision: "a1" });
  await page.close();
  const b = await context.newPage();
  await visitSite(b, { id: "beta", pages: 250, revision: "b1" });
  await b.close();
  const a2 = await context.newPage();
  await visitSite(a2, { id: "alpha", pages: 150, revision: "a1" });
  expect(await restored(a2)).toBe(true);
  expect(await query(a2, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 150 }]);
  await a2.close();
  const b2 = await context.newPage();
  await visitSite(b2, { id: "beta", pages: 250, revision: "b1" });
  expect(await restored(b2)).toBe(true);
  expect(await query(b2, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 250 }]);
});

test("a store held by another page falls back to memory within five seconds plus the load, and the held store is untouched", async ({ page, context }) => {
  test.setTimeout(120_000);
  await visitSite(page, { id: "locked", pages: 300, revision: "r1" }); // this page now holds the store
  const second = await context.newPage();
  const started = Date.now();
  const visit = await visitSite(second, { id: "locked", pages: 300, revision: "r1" });
  const elapsed = Date.now() - started;
  expect(await second.evaluate(() => (window as any).client.status)).toBe("ready");
  expect(await restored(second)).toBe(false);
  expect(visit.dataRequests).toHaveLength(1); // loaded from the data, in memory
  expect(elapsed).toBeGreaterThanOrEqual(4500); // it waited the retry budget first
  expect(elapsed).toBeLessThan(5000 + 6000); // five seconds plus the load, with slack
  expect(await query(second, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 300 }]);
  await second.close();
  await page.close();

  const third = await context.newPage();
  await visitSite(third, { id: "locked", pages: 300, revision: "r1" });
  expect(await restored(third)).toBe(true); // the store and its catalog entry were left as they were
});

test("a worker ended in the middle of a query: the next page's retry covers the time the store stays locked", async ({ page, context }) => {
  test.setTimeout(120_000);
  await visitSite(page, { id: "midquery", pages: 1000, revision: "r1" });
  await page.evaluate(() => {
    const w = window as any;
    void w.client.query(w.faults.runawayStatement).catch(() => undefined);
  });
  const next = context.newPage();
  await page.close();
  const second = await next;
  await visitSite(second, { id: "midquery", pages: 1000, revision: "r1" });
  expect(await second.evaluate(() => (window as any).client.status)).toBe("ready");
  expect(await query(second, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 1000 }]);
});

test("leftover scoped data is removed when the next worker starts", async ({ page, context }) => {
  test.setTimeout(120_000);
  await visitSite(page, { id: "sweep", pages: 200, revision: "r1", page: 1 });
  await expect.poll(async () => (await query(page, "MATCH (n:Note) RETURN count(n) AS c"))[0].c).toBe(2);
  // End the worker abruptly: no departure runs, so page 1's notes stay in the store.
  await page.evaluate(() => (window as any).tracked.workers[0].terminate());
  await page.close();

  const next = await context.newPage();
  await visitSite(next, { id: "sweep", pages: 200, revision: "r1", page: 2 });
  expect(await restored(next)).toBe(true);
  await expect
    .poll(async () => JSON.stringify((await query(next, "MATCH (n:Note) RETURN count(n) AS c, collect(DISTINCT n.page) AS pages"))[0]), { timeout: 30_000 })
    .toBe(JSON.stringify({ c: 2, pages: [2] }));
});

test("a page that is hidden removes its own views' data", async ({ page }) => {
  await visitSite(page, { id: "hide", pages: 200, revision: "r1", page: 1 });
  await expect.poll(async () => (await query(page, "MATCH (n:Note) RETURN count(n) AS c"))[0].c).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect.poll(async () => (await query(page, "MATCH (n:Note) RETURN count(n) AS c"))[0].c, { timeout: 15_000 }).toBe(0);
});
