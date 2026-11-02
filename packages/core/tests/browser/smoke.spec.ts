// covers: FR-001
import { expect, test } from "@playwright/test";

test("the engine initialises in a worker and answers a statement", async ({ page }) => {
  await page.goto("/smoke.html");
  await page.waitForFunction(() => (window as unknown as { __smoke?: unknown }).__smoke !== undefined);
  const result = await page.evaluate(() => (window as unknown as { __smoke: unknown }).__smoke);
  expect(result).toEqual({ rows: [{ n: 1 }], error: null });
});
