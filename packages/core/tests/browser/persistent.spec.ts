// covers: FR-020, FR-025, FR-026, FR-028, SC-009
import { expect, test, type Page } from "./fixtures.js";
import { query, restored, visitSite } from "./helpers.js";

async function openSite(page: Page, query = ""): Promise<void> {
  await page.goto(`/site.html${query}`);
  await page.waitForFunction(() => document.documentElement.dataset.site === "ready");
}

const ready = (page: Page, generation = 1) =>
  page.waitForFunction((g) => (window as any).client.status === "ready" && (window as any).client.generation === g, generation);

/** Notes currently in the graph, read through the client: the count and the pages they belong to. */
const notes = (page: Page) =>
  page.evaluate(async () => {
    const r = await (window as any).client.query("MATCH (n:Note) RETURN count(n) AS c, collect(DISTINCT n.page) AS pages");
    return r.rows[0] as { c: number; pages: number[] };
  });

/** Wait until the notes of exactly this page are in the graph (adds and drops are asynchronous). */
const waitForNotesOf = (page: Page, n: number) =>
  expect.poll(async () => JSON.stringify(await notes(page)), { timeout: 15_000 }).toBe(JSON.stringify({ c: 2, pages: [n] }));

test("ten navigations by link, history and script keep one worker and one generation, and no page data leaks", async ({ page }) => {
  await openSite(page);
  await ready(page);
  const token = await page.evaluate(() => (window as any).clientToken);
  await waitForNotesOf(page, 1);

  // five link clicks
  for (let n = 2; n <= 6; n++) {
    await page.click("#next");
    await expect(page.locator("#title")).toHaveText(`Page ${n}`);
    await waitForNotesOf(page, n);
  }
  // two steps back and one forward through history
  await page.goBack();
  await expect(page.locator("#title")).toHaveText("Page 5");
  await waitForNotesOf(page, 5);
  await page.goBack();
  await expect(page.locator("#title")).toHaveText("Page 4");
  await waitForNotesOf(page, 4);
  await page.goForward();
  await expect(page.locator("#title")).toHaveText("Page 5");
  await waitForNotesOf(page, 5);
  // two navigations by script
  await page.evaluate(() => (window as any).navigate("/site.html?page=7"));
  await expect(page.locator("#title")).toHaveText("Page 7");
  await waitForNotesOf(page, 7);
  await page.evaluate(() => (window as any).navigate("/site.html?page=8"));
  await expect(page.locator("#title")).toHaveText("Page 8");
  await waitForNotesOf(page, 8);

  const state = await page.evaluate(() => ({ token: (window as any).clientToken, workers: (window as any).tracked.workers.length, generation: (window as any).client.generation, arrivals: (window as any).arrivals() }));
  expect(state).toMatchObject({ token, workers: 1, generation: 1 });
  expect(state.arrivals).toBeGreaterThanOrEqual(11);
});

test("one view's data is removed on departure and another view's data is untouched", async ({ page }) => {
  await openSite(page);
  await ready(page);
  const result = await page.evaluate(async () => {
    const w = window as any;
    const doc = (tag: string) => ({ version: 1, nodes: [{ id: `${tag}1`, labels: ["Mark"], properties: { tag } }], links: [] });
    const a = w.core.attachView(w.client, doc("a"));
    const b = w.core.attachView(w.client, doc("b"));
    await Promise.all([a.ready, b.ready]);
    const count = async () => (await w.client.query("MATCH (n:Mark) RETURN collect(n.tag) AS tags")).rows[0].tags.sort();
    const both = await count();
    await a.detach();
    const afterA = await count();
    await b.detach();
    return { both, afterA, afterB: await count(), differentScopes: a.scope !== b.scope };
  });
  expect(result).toEqual({ both: ["a", "b"], afterA: ["b"], afterB: [], differentScopes: true });
});

test("after the instance is replaced the current view's data is added again before subscriptions re-run", async ({ page }) => {
  await openSite(page);
  await ready(page);
  await waitForNotesOf(page, 1);
  await page.evaluate(() => {
    (window as any).log.length = 0;
    (window as any).tracked.failLatest("injected");
  });
  await ready(page, 2);
  await waitForNotesOf(page, 1);
  const afterReplacement = await page.evaluate(() => (window as any).log.filter((u: { rows: unknown }) => u.rows).map((u: { generation: number; rows: Array<{ c: number }> }) => [u.generation, u.rows[0]!.c]));
  // The only update delivered for the new generation already sees the re-added notes.
  expect(afterReplacement).toEqual([[2, 2]]);
});

test("navigating while the graph is still loading ends with only the last page's data", async ({ page }) => {
  await page.goto("/site.html?pages=5000");
  await page.waitForFunction(() => document.documentElement.dataset.site === "ready");
  // Three navigations in a row, immediately, before the instance is ready.
  await page.evaluate(() => {
    const w = window as any;
    w.navigate("/site.html?pages=5000&page=2");
    w.navigate("/site.html?pages=5000&page=3");
    w.navigate("/site.html?pages=5000&page=4");
  });
  await ready(page);
  await waitForNotesOf(page, 4);
  // No update for a departed page arrives after the last arrival.
  const labels = await page.evaluate(() => [...new Set((window as any).log.filter((u: { rows: unknown }) => u.rows).map((u: { page: number }) => u.page))]);
  expect(labels).toEqual([4]);
});

test("a full reload starts a new worker and a new client", async ({ page }) => {
  await openSite(page);
  await ready(page);
  const before = await page.evaluate(() => (window as any).clientToken);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.site === "ready");
  await ready(page);
  const after = await page.evaluate(() => ({ token: (window as any).clientToken, workers: (window as any).tracked.workers.length, generation: (window as any).client.generation }));
  expect(after.token).not.toBe(before);
  expect(after).toMatchObject({ workers: 1, generation: 1 });
});

test("the configured navigation decides: client-routing returns one client for the visit, multi-page a new one per call", async ({ page }) => {
  await openSite(page);
  const result = await page.evaluate(() => {
    const w = window as any;
    const make = (navigation: string) => w.core.createSiteClient({ engineUrl: w.engineUrl, graph: { document: w.graph.document }, navigation });
    const routing = [make("client-routing"), make("client-routing")];
    const multi = [make("multi-page"), make("multi-page")];
    const out = { routingSame: routing[0] === routing[1], routingIsFirst: routing[0] === w.client, multiDistinct: multi[0] !== multi[1] };
    multi.forEach((c) => c.destroy());
    return out;
  });
  expect(result).toEqual({ routingSame: true, routingIsFirst: true, multiDistinct: true });
});

test("with a descriptor and a store configured, a matching revision restores instead of replaying", async ({ page, context }) => {
  await visitSite(page, { id: "persist", pages: 300, revision: "r1", navigation: "client-routing", store: true });
  expect(await restored(page)).toBe(false);
  await page.close();
  const next = await context.newPage();
  const visit = await visitSite(next, { id: "persist", pages: 300, revision: "r1", navigation: "client-routing", store: true });
  expect(await restored(next)).toBe(true);
  expect(visit.dataRequests).toHaveLength(0);
  expect(await query(next, "MATCH (n:Page) RETURN count(n) AS c")).toEqual([{ c: 300 }]);
});

test("under client-routing the store is off unless it is configured", async ({ page, context }) => {
  await visitSite(page, { id: "off", pages: 100, revision: "r1", navigation: "client-routing" });
  await page.close();
  const next = await context.newPage();
  const visit = await visitSite(next, { id: "off", pages: 100, revision: "r1", navigation: "client-routing" });
  expect(await restored(next)).toBe(false);
  expect(visit.dataRequests).toHaveLength(1);
});
