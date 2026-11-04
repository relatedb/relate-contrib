// covers: FR-022, FR-029
// The adapter's own checks that the core's scenarios do not make: the direct lookup refuses a page-lifetime graph and an
// unknown name in a real page. (Destruction on departure and the store being free for the next page are in
// lifecycle.spec.ts; the build failures are in tests/build.)
import { expect, test } from "./fixtures.js";

for (const [profile, base] of Object.entries({ "multi-page": "http://127.0.0.1:5180", "client-routing": "http://127.0.0.1:5181" })) {
  test(`the direct lookup refuses a page-lifetime graph and an unknown name, naming them, under ${profile}`, async ({ page }) => {
    await page.goto(`${base}/direct.html?navigation=${profile}`);
    await expect(page.locator("[data-direct-errors]")).not.toBeEmpty();
    const errors = JSON.parse((await page.locator("[data-direct-errors]").textContent())!) as string[];
    expect(errors[0]).toMatch(/"small" has the "page" lifetime; ask for it from the page's setup/);
    expect(errors[1]).toMatch(/no registered graph named "nope" \(registered: example, small\)/);
  });
}
