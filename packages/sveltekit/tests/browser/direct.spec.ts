// covers: FR-023
import { builds, origin } from "./builds.js";
import { expect, test } from "./fixtures.js";

for (const build of builds({ where: (b) => b.adapter === "static" })) {
  test(`the direct lookup returns a visit client and fails loudly for anything else (${build.name})`, async ({ page }) => {
    await page.goto(`${origin(build)}/direct.html`);
    await expect(page.locator("[data-direct-visit]")).toHaveText("client", { timeout: 60_000 });
    await expect(page.locator("[data-direct-twice]")).toHaveText("true");
    await expect(page.locator("[data-direct-page]")).toContainText('"small" has the "page" lifetime; ask for it from a component with useGraph');
    await expect(page.locator("[data-direct-inline]")).toContainText('"g" is an inline graph of a page; ask for it from a component with useGraph');
    await expect(page.locator("[data-direct-unknown]")).toContainText('no registered graph with the id "nothing" (registered: example, small, other)');
  });
}
