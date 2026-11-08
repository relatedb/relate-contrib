// covers: FR-017, FR-026, SC-008
import { builds, origin } from "./builds.js";
import { expect, hydrationProblems, test } from "./fixtures.js";

const PAGES = ["page-1.html", "notes.html", "inline-a.html", "inline-b.html", "two-graphs.html", "lifetime-a.html", "switch.html", "direct.html"];

for (const build of builds({ dev: false })) {
  const root = origin(build);
  test.describe(`rendering and hydration, ${build.name}`, () => {
    for (const path of PAGES) {
      test(`${path}: the server markup holds the placeholder and hydration reports no warning`, async ({ page }) => {
        const raw = await (await page.request.get(`${root}/${path}`)).text();
        expect(raw).toMatch(/data-rel-link/);
        expect(raw).not.toMatch(/data-rel-status[^>]*>ready</);
        const problems = hydrationProblems(page);
        await page.goto(`${root}/${path}`);
        await page.waitForTimeout(1500);
        expect(problems).toEqual([]);
      });
    }

    test("the page's text and links work while the graph is failed, and while the engine is replaced", async ({ page }) => {
      await page.goto(`${root}/broken.html`);
      await expect(page.locator("[data-rel-status]")).toHaveText("failed", { timeout: 90_000 });
      await expect(page.locator("[data-rel-failure]")).toContainText("3 attempts");
      expect(await page.locator("a[data-rel-link]").count()).toBeGreaterThanOrEqual(4);
      await page.locator("a[data-rel-link]", { hasText: "Page 1" }).first().click();
      await expect(page.locator("[data-rel-title]")).toHaveText("Example site: page 1");
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await page.locator('[data-rel-action="trap"]').click();
      await expect(page.locator("[data-rel-generation]")).toHaveText("2", { timeout: 60_000 });
      expect(await page.locator("a[data-rel-link]").count()).toBeGreaterThanOrEqual(4);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
    });
  });
}

for (const build of builds({ dev: true })) {
  test(`in the development server hydration reports no warning (${build.name})`, async ({ page }) => {
    const problems = hydrationProblems(page);
    await page.goto(`${origin(build)}/page-1.html`);
    await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 120_000 });
    expect(problems).toEqual([]);
  });
}
