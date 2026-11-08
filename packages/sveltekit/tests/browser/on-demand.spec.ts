// covers: FR-017, FR-021, FR-032
import { builds, origin } from "./builds.js";
import { expect, hydrationProblems, test } from "./fixtures.js";

for (const build of builds({ where: (b) => b.adapter === "node" })) {
  const root = origin(build);
  test.describe(`a page rendered on demand and the reload attribute, ${build.name}`, () => {
    test("the page is rendered on demand with the placeholder, and its holder hydrates and queries with no warning", async ({ page }) => {
      const raw = await (await page.request.get(`${root}/live.html`)).text();
      expect(raw).toMatch(/data-rel-count[^>]*>…</);
      expect(raw).not.toMatch(/data-rel-status[^>]*>ready</);
      const problems = hydrationProblems(page);
      await page.goto(`${root}/live.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      expect(problems).toEqual([]);
    });

    test("data-sveltekit-reload is on the body of a multi-page build only, and then every link loads a document", async ({ page }) => {
      const raw = await (await page.request.get(`${root}/live.html`)).text();
      expect(/<body[^>]*data-sveltekit-reload/.test(raw)).toBe(build.navigation === "multi-page");
      await page.goto(`${root}/inline-a.html`);
      await expect(page.locator("[data-inline-count]")).toHaveText("20", { timeout: 60_000 });
      await page.evaluate(() => ((window as any).__marker = 1));
      await page.locator("a[data-rel-link]", { hasText: "Inline B" }).first().click();
      await expect(page.locator("[data-inline-count]")).toHaveText("3", { timeout: 60_000 });
      expect(await page.evaluate(() => (window as any).__marker === undefined)).toBe(build.navigation === "multi-page");
      await expect(page.locator("script[data-relate-graph]")).toHaveCount(1);
    });
  });
}

for (const build of builds({ where: (b) => b.adapter === "static" })) {
  test(`the inline element is found after a document load under ${build.name}'s navigation`, async ({ page }) => {
    await page.goto(`${origin(build)}/inline-b.html`);
    await expect(page.locator("[data-inline-count]")).toHaveText("3", { timeout: 60_000 });
    await expect(page.locator("script[data-relate-graph]")).toHaveCount(1);
  });
}
