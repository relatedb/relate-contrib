// covers: FR-020, SC-003
import { BUILDS } from "../../playwright.config.js";
import { expect, test } from "./fixtures.js";

const only = process.env.GW_ONLY?.split(",");
for (const build of BUILDS.filter((b) => (!only || only.includes(b.name)) && b.navigation === "client-routing" && !b.dev && !b.base)) {
  const base = `http://127.0.0.1:${build.port}`;
  test.describe(`stored copy, ${build.name}`, () => {
    test("a registered page-lifetime graph restores from its stored copy on the next page, and another graph opens its own store", async ({ page }) => {
      await page.goto(`${base}/lifetime-a.html`);
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      await expect(page.locator("[data-life-restored]:visible")).toHaveText("false");
      // a different page-lifetime graph on the next page: the first client ends and the second opens its own store
      await page.getByRole("link", { name: "Lifetime C", exact: true }).click();
      await expect(page.locator("[data-gw-title]:visible")).toHaveText("Lifetime C");
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      await expect(page.locator("[data-life-restored]:visible")).toHaveText("false");
      await expect.poll(() => page.evaluate(() => (window as unknown as { __gwLog: string[] }).__gwLog.filter((l) => l.startsWith("destroy:")).length)).toBe(1);
      // back on the first graph's page: a new client restores from the stored copy
      await page.getByRole("link", { name: "Lifetime A", exact: true }).click();
      await expect(page.locator("[data-gw-title]:visible")).toHaveText("Lifetime A");
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      await expect(page.locator("[data-life-restored]:visible")).toHaveText("true");
    });
  });
}
