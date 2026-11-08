// covers: FR-020, SC-007
import { expect, expectNoCellErrors, origin, test } from "./fixtures.js";

test("rows from the tagged template feed a chart, a table and a select, with values bound as parameters", async ({ page }) => {
  await page.goto(`${origin}/queries.html`);
  await expect(page.locator("#section-count")).toHaveText("20", { timeout: 60_000 });
  await expect(page.locator("#first-section-pages")).toHaveText("15");
  await expect(page.locator("#chart rect")).toHaveCount(20);

  await expect(page.locator("#row-columns")).toHaveText("title,slug");
  await expect(page.locator("#row-count")).toHaveText("5");
  await expect(page.locator("#table tbody tr")).toHaveCount(5);

  await page.getByLabel("section").selectOption({ label: "s3" });
  await expect(page.locator("#chosen-section")).toHaveText("s3");
  await expect(page.locator("#table tbody tr").first()).toContainText("Page");

  await page.locator("input[type=number]").fill("3");
  await expect(page.locator("#row-count")).toHaveText("3");
  await expect(page.locator("#table tbody tr")).toHaveCount(3);

  await page.getByLabel("title").fill("Page 7");
  await expect(page.locator("#match-count")).toHaveText("1");
  const hostile = "Page 7'}) RETURN 1 AS injected //";
  await page.getByLabel("title").fill(hostile);
  await expect(page.locator("#term")).toHaveText(hostile);
  await expect(page.locator("#match-count")).toHaveText("0");
  await expectNoCellErrors(page);
});
