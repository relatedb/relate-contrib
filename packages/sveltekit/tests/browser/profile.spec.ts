// covers: FR-016, FR-024, FR-025, SC-001
import { builds, origin } from "./builds.js";
import { countWorkers, expect, test } from "./fixtures.js";

for (const build of builds({ base: true })) {
  const root = origin(build);
  test.describe(`profile, base path and engine location, ${build.name}`, () => {
    test("the provider's profile decides the core's profile", async ({ page }) => {
      await page.goto(`${root}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await expect(page.locator("[data-rel-profile]")).toHaveText(build.navigation === "client-routing" ? "persistent" : "per-page");
    });

    test("the profile override decides the core's profile and nothing else", async ({ page }) => {
      const other = build.navigation === "client-routing" ? "multi-page" : "client-routing";
      await page.goto(`${root}/page-1.html?navigation=${other}`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await expect(page.locator("[data-rel-profile]")).toHaveText(other === "client-routing" ? "persistent" : "per-page");
    });

    test("the descriptor override requests that location instead and nothing else changes", async ({ page }) => {
      const requested: string[] = [];
      page.on("request", (r) => /descriptor/.test(r.url()) && requested.push(new URL(r.url()).pathname));
      await page.goto(`${root}/page-1.html?variant=b`);
      await expect(page.locator("[data-rel-count]")).toHaveText("400", { timeout: 60_000 });
      expect(requested).toContain("/descriptor-b.json");
      expect(requested.some((p) => p.endsWith("/relate/example/descriptor.json"))).toBe(false);
    });

    test("every descriptor request and the engine's location carry the base path, and the engine location reaches the core unchanged", async ({ page }) => {
      const requested: string[] = [];
      page.on("request", (r) => /descriptor\.json$|\.wasm$/.test(new URL(r.url()).pathname) && requested.push(new URL(r.url()).pathname));
      await page.goto(`${root}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      const base = build.base ?? "";
      expect(requested.filter((p) => p.endsWith("descriptor.json"))).toEqual([`${base}/relate/example/descriptor.json`]);
      const wasm = requested.filter((p) => p.endsWith(".wasm"));
      expect(wasm.length).toBeGreaterThan(0);
      for (const p of wasm) expect(p).toMatch(new RegExp(`^${base}/_app/immutable/assets/relate_bg\\.[\\w-]+\\.wasm$`));
    });

    test("the provider alone creates no client and starts no worker", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${root}/blank.html`);
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => (window as any).__workers.created)).toBe(0);
    });
  });
}
