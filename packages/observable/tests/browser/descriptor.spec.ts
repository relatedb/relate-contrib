// covers: FR-012, FR-013, SC-001
import { expect, expectNoCellErrors, origin, test } from "./fixtures.js";

test("a descriptor and its data open as a pair, with only the declared index", async ({ page }) => {
  await page.goto(`${origin}/page-1.html`);
  await expect(page.locator("[data-rel-status]")).toHaveText("ready", { timeout: 60_000 });
  await expect(page.locator("[data-rel-count]")).toHaveText("300");
  const indexes = await page.evaluate(async () => {
    const result = await (window as any).__rel.client.query("SHOW INDEXES");
    return result.rows.map((r: any) => ({ labels: r.labelsOrTypes, properties: r.properties }));
  });
  expect(indexes).toEqual([{ labels: ["Page"], properties: ["id"] }]);
  await expectNoCellErrors(page);
});

test("the next page restores the graph from the stored copy without fetching the data file", async ({ page }) => {
  await page.goto(`${origin}/page-1.html`);
  await expect(page.locator("[data-rel-status]")).toHaveText("ready", { timeout: 60_000 });
  await expect(page.locator("[data-rel-restored]")).not.toHaveText("unknown", { timeout: 30_000 });
  const dataRequests: string[] = [];
  page.on("request", (r) => /\/_file\/data\/example\.graph\./.test(r.url()) && dataRequests.push(r.url()));
  await page.goto(`${origin}/page-2.html`);
  await expect(page.locator("[data-rel-status]")).toHaveText("ready", { timeout: 60_000 });
  await expect(page.locator("[data-rel-count]")).toHaveText("300");
  await expect(page.locator("[data-rel-restored]")).toHaveText("true");
  expect(dataRequests).toEqual([]);
});
