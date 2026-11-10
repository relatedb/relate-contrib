// covers-cat: FR-015, FR-016, SC-008
import { generateGraph } from "../../fixtures/generate-graph.js";
import { checkBaseline } from "../../browser/helpers.js";
import { catalogText, entry, putEntry, writeCatalogText } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { openHarness } from "./helpers.js";

type Page = import("@playwright/test").Page;

/** Serve a generated graph's data and count the requests for it. */
async function serve(page: Page, pages: number, id: string, revision: string): Promise<{ descriptor: unknown; requests: () => number }> {
  const g = generateGraph(pages, { id, revision, dataUrl: `/data/${id}.json` });
  let hits = 0;
  await page.route(`**/data/${id}.json`, (r) => {
    hits++;
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(g.document) });
  });
  return { descriptor: g.descriptor, requests: () => hits };
}

/** Open the graph on a fresh page load; resolves with the core's `total` timing. */
async function visit(page: Page, descriptor: unknown): Promise<{ total: number; restored: boolean; status: string }> {
  await openHarness(page);
  return page.evaluate(
    (d) =>
      new Promise<{ total: number; restored: boolean; status: string }>((resolve) => {
        const client = window.app.core.createClient({ engineUrl: window.app.engineUrl, navigation: "multi-page", graph: { descriptor: d as never } });
        window.client = client;
        client.on("timing", (t) => {
          if (t.phase === "total") resolve({ total: t.ms, restored: t.restored, status: client.status });
        });
        client.on("status", () => {
          if (client.status === "failed") resolve({ total: 0, restored: false, status: "failed" });
        });
      }),
    descriptor,
  );
}

const nodes = (page: Page) => page.evaluate(async () => (await window.client!.query("MATCH (n:Page) RETURN count(n) AS c")).rows[0]!.c);

test("a matching revision restores with no request for the data, and the entry is ready at that revision", async ({ page }) => {
  const { descriptor, requests } = await serve(page, 300, "restore", "r1");
  const first = await visit(page, descriptor);
  expect(first).toMatchObject({ restored: false });
  expect(requests()).toBe(1);
  expect(await entry(page, "rel-restore")).toMatchObject({ kind: "cache", name: "restore", state: "ready", revision: "r1" });

  await page.waitForTimeout(600); // the previous page's worker releases the store
  const second = await visit(page, descriptor);
  expect(second).toMatchObject({ status: "ready", restored: true });
  expect(requests()).toBe(1);
  expect(await nodes(page)).toBe(300);
});

test("a new revision rebuilds the cache and the entry follows", async ({ page }) => {
  const a = await serve(page, 100, "rev", "r1");
  await visit(page, a.descriptor);
  await page.waitForTimeout(600);
  await page.unroute("**/data/rev.json");
  const b = await serve(page, 120, "rev", "r2");
  const second = await visit(page, b.descriptor);
  expect(second).toMatchObject({ status: "ready", restored: false });
  expect(b.requests()).toBe(1);
  expect(await nodes(page)).toBe(120);
  expect(await entry(page, "rel-rev")).toMatchObject({ state: "ready", revision: "r2" });
});

test("a leftover relate-web/<id>.json is removed when its cache is next opened, and the cache still restores from its entry", async ({ page }) => {
  const { descriptor } = await serve(page, 100, "legacy", "r1");
  await visit(page, descriptor);
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web", { create: true });
    const w = await (await dir.getFileHandle("legacy.json", { create: true })).createWritable();
    await w.write(JSON.stringify({ version: 1, id: "legacy", revision: "r1" }));
    await w.close();
  });
  const second = await visit(page, descriptor);
  expect(second).toMatchObject({ status: "ready", restored: true });
  const names = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web");
    const out: string[] = [];
    for await (const [n] of (dir as unknown as { entries(): AsyncIterable<[string, unknown]> }).entries()) out.push(n);
    return out.sort();
  });
  expect(names).toEqual(["catalog.json"]);
});

test("a store with no entry rebuilds, even when the data is there", async ({ page }) => {
  const { descriptor, requests } = await serve(page, 100, "noentry", "r1");
  await visit(page, descriptor);
  await page.waitForTimeout(600);
  await putEntry(page, "rel-noentry", null);
  const second = await visit(page, descriptor);
  expect(second).toMatchObject({ status: "ready", restored: false });
  expect(requests()).toBe(2);
  expect(await entry(page, "rel-noentry")).toMatchObject({ state: "ready", revision: "r1" });
});

test("a catalog that does not parse does not stop the cache: it rebuilds and the file is left as it was", async ({ page }) => {
  const { descriptor } = await serve(page, 100, "damaged", "r1");
  await visit(page, descriptor);
  await page.waitForTimeout(600);
  await writeCatalogText(page, "{truncated");
  const second = await visit(page, descriptor);
  expect(second).toMatchObject({ status: "ready", restored: false });
  expect(await nodes(page)).toBe(100);
  expect(await catalogText(page)).toBe("{truncated");
});

test("a restore of 5,000 pages stays within the recorded baseline, with no request for the data", async ({ page, browserName }, info) => {
  test.setTimeout(300_000);
  const { descriptor, requests } = await serve(page, 5000, "restore5000", "r1");
  await visit(page, descriptor);
  await page.waitForTimeout(800);
  const hits = requests();
  const second = await visit(page, descriptor);
  expect(second).toMatchObject({ status: "ready", restored: true });
  expect(requests()).toBe(hits);
  const result = checkBaseline(browserName, "restore-5000", second.total);
  info.annotations.push({ type: "restore-5000-ms", description: `${Math.round(second.total)} (baseline ${result.baseline ?? "recorded now"})` });
});
