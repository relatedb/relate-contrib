// covers: FR-011, FR-014, FR-005, SC-001, SC-008
import { expect, expectNoCellErrors, origin, test } from "./fixtures.js";

test("a page opens graphs from an object a cell holds and from a data file, and queries them", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(new URL(r.url()).pathname));
  await page.goto(`${origin}/document.html`);
  await expect(page.locator("#from-object")).toHaveText("20");
  await expect(page.locator("#from-file")).toHaveText("20");
  await expect(page.locator("#next-of-3")).toHaveText("4");
  await expect(page.locator("#status-object")).toHaveText("ready");
  await expectNoCellErrors(page);
  // the binary and the worker come from files the site published, under hashed names, and from nowhere else
  // (two graphs, so two workers fetch the one binary)
  expect([...new Set(requested.filter((p) => /\.wasm$/.test(p)))]).toEqual([expect.stringMatching(/^\/_file\/data\/relate\.[0-9a-f]{8}\.wasm$/)]);
  expect([...new Set(requested.filter((p) => /relate-worker/.test(p)))]).toEqual([expect.stringMatching(/^\/_file\/data\/relate-worker\.[0-9a-f]{8}\.js$/)]);
});

test("the page's text and links are there before any graph is ready, and its other cells render while a graph is loading", async ({ page }) => {
  await page.goto(`${origin}/document.html`, { waitUntil: "domcontentloaded" });
  expect(await page.locator("a[data-rel-link]").count()).toBeGreaterThan(0);
  await expect(page.locator("#other-cell, p:has-text('plain markup')").first()).toBeVisible();
});

test("an invalid document ends in failed with the core's diagnostic, and an unreachable worker after three attempts, with the other cells unaffected", async ({ page }) => {
  await page.goto(`${origin}/failures.html`);
  await expect(page.locator("#other-cell")).toBeVisible();
  await expect(page.locator("#invalid-status")).toHaveText("failed", { timeout: 60_000 });
  await expect(page.locator("#invalid-reason")).toHaveText("invalid-document");
  await expect(page.locator("#invalid-message")).not.toHaveText("ready");
  await expect(page.locator("#unreachable-status")).toHaveText("failed", { timeout: 60_000 });
  await expect(page.locator("#unreachable-failures")).toHaveText("3");
  await expectNoCellErrors(page);
});
