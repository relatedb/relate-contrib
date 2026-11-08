// covers: FR-022
import { builds, selected } from "./builds.js";
import { expect, test } from "./fixtures.js";

for (const build of builds()) {
  test(`the direct lookup returns one client for a visit-lifetime graph, starts one worker, and refuses the rest, ${build.name}`, async ({ page }) => {
    await page.addInitScript(() => {
      const Original = window.Worker;
      (window as unknown as { __workers: number }).__workers = 0;
      window.Worker = class extends Original {
        constructor(...args: ConstructorParameters<typeof Worker>) {
          super(...args);
          (window as unknown as { __workers: number }).__workers++;
        }
      } as typeof Worker;
    });
    await page.goto(`http://127.0.0.1:${build.port}/direct.html`);
    await expect(page.locator("[data-direct-count]")).toHaveText("300");
    expect(await page.evaluate(() => (window as unknown as { __relDirect: { same: boolean } }).__relDirect.same)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers)).toBe(1);
    const errors = JSON.parse((await page.locator("[data-direct-errors]").textContent()) ?? "[]") as string[];
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/"small" has the "page" lifetime; ask for it from a component/);
    expect(errors[1]).toMatch(/"notebook" is an inline graph of a page; ask for it from a component/);
    expect(errors[2]).toMatch(/no registered graph named "nope" \(registered: example, small, fig20, fig300, fig2000\)/);
  });
}
