// covers: FR-019, FR-020, FR-021, FR-022, SC-003, SC-004
import { builds, origin } from "./builds.js";
import { countWorkers, expect, liveWorkers, test } from "./fixtures.js";

const log = (page: import("@playwright/test").Page): Promise<string[]> => page.evaluate(() => (window as any).__relLog ?? []);
const startsWith = (entries: string[], prefix: string) => entries.filter((e) => e.startsWith(prefix));

for (const build of builds({ where: (b) => b.navigation === "client-routing" })) {
  const root = origin(build);
  test.describe(`lifetimes under client-routing, ${build.name}`, () => {
    test("two holders on one page share one client", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${root}/lifetime-a.html`);
      await expect(page.locator("[data-life-count]").first()).toHaveText("20", { timeout: 60_000 });
      const entries = await log(page);
      expect(startsWith(entries, "client:")).toHaveLength(1);
      expect(startsWith(entries, "hold:")).toHaveLength(2);
      expect(await liveWorkers(page)).toBe(1);
    });

    test("leaving the page for one that does not use the graph destroys the client within a task", async ({ page }) => {
      await page.goto(`${root}/lifetime-a.html`);
      await expect(page.locator("[data-life-count]").first()).toHaveText("20", { timeout: 60_000 });
      await page.locator("a[data-rel-link]", { hasText: "Page 2" }).first().click();
      await expect(page.locator("[data-rel-title]")).toHaveText("Example site: page 2");
      await expect.poll(async () => startsWith(await log(page), "destroy:").length, { timeout: 5000 }).toBe(1);
    });

    test("consecutive pages that use the same registered page graph keep one client", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${root}/lifetime-a.html`);
      await expect(page.locator("[data-life-count]").first()).toHaveText("20", { timeout: 60_000 });
      await page.locator("a[data-rel-link]", { hasText: "Lifetime B" }).first().click();
      await expect(page.locator("[data-rel-title]")).toHaveText("Example site: lifetime B");
      await expect(page.locator("[data-life-count]")).toHaveText("20");
      await page.waitForTimeout(300);
      const entries = await log(page);
      expect(startsWith(entries, "client:")).toHaveLength(1);
      expect(startsWith(entries, "destroy:")).toHaveLength(0);
      expect(startsWith(entries, "hold:").map((e) => e.split(":")[2])).toEqual(expect.arrayContaining(["lifetime A", "lifetime B"]));
      expect(await liveWorkers(page)).toBe(1);
    });

    test("moving to a page that uses a different page graph destroys the first client and opens the second", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${root}/lifetime-b.html`);
      await expect(page.locator("[data-life-count]")).toHaveText("20", { timeout: 60_000 });
      await page.locator("a[data-rel-link]", { hasText: "Lifetime C" }).first().click();
      await expect(page.locator("[data-rel-title]")).toHaveText("Example site: lifetime C");
      await expect(page.locator("[data-life-count]")).toHaveText("10", { timeout: 60_000 });
      await expect.poll(async () => startsWith(await log(page), "destroy:").length, { timeout: 5000 }).toBe(1);
      expect(startsWith(await log(page), "client:")).toHaveLength(2);
      expect(await liveWorkers(page)).toBe(1);
    });

    test("a visit graph keeps one client, one worker and one generation across link clicks, goto and history", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${root}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      const instance = await page.locator("[data-rel-instance]").textContent();
      const here = async () => ({ instance: await page.locator("[data-rel-instance]").textContent(), generation: await page.locator("[data-rel-generation]").textContent(), workers: await liveWorkers(page) });
      for (const label of ["Page 2", "Notes", "Home"]) {
        await page.locator("a[data-rel-link]", { hasText: new RegExp(`^${label}$`) }).first().click();
        await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
        expect(await here()).toEqual({ instance, generation: "1", workers: 1 });
      }
      await page.goBack();
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await page.goForward();
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await page.evaluate(() => (window as any).__goto("/page-2.html"));
      await expect(page.locator("[data-rel-title]")).toHaveText("Example site: page 2");
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      expect(await here()).toEqual({ instance, generation: "1", workers: 1 });
    });

    test("a holder whose id changes releases the old graph and acquires the new one", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${root}/switch.html`);
      await expect(page.locator("[data-switch-count]")).toHaveText("20", { timeout: 60_000 });
      await page.locator("[data-switch-toggle]").click();
      await expect(page.locator("[data-switch-id]")).toHaveText("other");
      await expect(page.locator("[data-switch-count]")).toHaveText("10", { timeout: 60_000 });
      await expect.poll(() => liveWorkers(page), { timeout: 5000 }).toBe(1);
    });
  });
}

for (const build of builds()) {
  test(`a document that ends takes its page clients with it (${build.name})`, async ({ page }) => {
    await countWorkers(page);
    await page.addInitScript(() => {
      const save = (): void => sessionStorage.setItem("__w", JSON.stringify((window as any).__workers));
      const Counted = window.Worker;
      window.Worker = class extends Counted {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          save();
        }
        terminate(): void {
          super.terminate();
          save();
        }
      } as typeof Worker;
    });
    await page.goto(`${origin(build)}/lifetime-a.html`);
    await expect(page.locator("[data-life-count]").first()).toHaveText("20", { timeout: 60_000 });
    await page.goto(`${origin(build)}/blank.html`);
    const left = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__w") ?? "{}"));
    expect(left.created - left.terminated).toBe(0);
  });

  test(`the server markup of a page that uses a graph holds the placeholder only (${build.name})`, async ({ page }) => {
    const raw = await (await page.request.get(`${origin(build)}/lifetime-a.html`)).text();
    expect(raw).toMatch(/data-life-status[^>]*>idle</);
    expect(raw).toMatch(/data-life-count[^>]*>…</);
  });
}
