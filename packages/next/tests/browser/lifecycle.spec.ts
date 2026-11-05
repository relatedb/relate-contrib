// covers: FR-019, FR-020, FR-021, FR-024, SC-003, SC-004
import type { Page } from "@playwright/test";
import { BUILDS } from "../../playwright.config.js";
import { expect, test } from "./fixtures.js";

const only = process.env.GW_ONLY?.split(",");
const log = (page: Page) => page.evaluate(() => [...((window as unknown as { __gwLog?: string[] }).__gwLog ?? [])]);
const follow = async (page: Page, label: string, title: string) => {
  await page.getByRole("link", { name: label, exact: true }).click();
  await expect(page.locator("[data-gw-title]:visible")).toHaveText(title);
};
const countWorkers = (page: Page) =>
  page.addInitScript(() => {
    const Original = window.Worker;
    (window as unknown as { __workers: number }).__workers = 0;
    window.Worker = class extends Original {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        (window as unknown as { __workers: number }).__workers++;
      }
    } as typeof Worker;
  });

// Under client-routing the router keeps the document; with `cacheComponents` it also keeps the departed page hidden.
for (const build of BUILDS.filter((b) => (!only || only.includes(b.name)) && b.navigation === "client-routing" && !b.dev && !b.base)) {
  const base = `http://127.0.0.1:${build.port}`;
  test.describe(`lifetimes, ${build.name}`, () => {
    test("a page client is shared by consecutive pages that use it, and destroyed within one task of the last holder leaving", async ({ page }) => {
      await page.goto(`${base}/lifetime-a.html`);
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      await follow(page, "Lifetime B", "Lifetime B");
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      // the next page asks in the same commit that releases the first, so the client survives and is shared
      expect(await log(page)).toEqual(["client:1:Lifetime A", "hold:1:Lifetime A", "release:1:Lifetime A", "hold:1:Lifetime B"]);
      await follow(page, "Home", "Example site: home");
      await expect.poll(() => log(page)).toContain("destroy:1:Lifetime A");
      expect((await log(page)).filter((l) => l.startsWith("destroy:"))).toHaveLength(1);
      // a client is never reused after its destruction: the next page that asks makes another
      await follow(page, "Lifetime A", "Lifetime A");
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      expect(await log(page)).toContain("client:2:Lifetime A");
    });

    test("a visit-lifetime graph keeps one worker, instance and generation across link, history and script navigation", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${base}/page-1.html`);
      await expect(page.locator("[data-gw-count]:visible")).toHaveText("300");
      const instance = await page.locator("[data-gw-instance]:visible").textContent();
      const steady = async (label: string, title: string) => {
        await expect(page.locator("[data-gw-title]:visible")).toHaveText(title);
        await expect(page.locator("[data-gw-count]:visible")).toHaveText("300");
        expect(await page.locator("[data-gw-instance]:visible").textContent(), label).toBe(instance);
        expect(await page.locator("[data-gw-generation]:visible").textContent(), label).toBe("1");
        expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers), label).toBe(1);
      };
      await follow(page, "Page 2", "Example site: page 2");
      await steady("link", "Example site: page 2");
      await page.goBack();
      await steady("back", "Example site: page 1");
      await page.goForward();
      await steady("forward", "Example site: page 2");
      await page.evaluate(() => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push("/page-1.html"));
      await steady("script", "Example site: page 1");
    });

    test("a page that uses no hook starts no worker and no client", async ({ page }) => {
      await countWorkers(page);
      await page.goto(`${base}/blank.html`);
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers)).toBe(0);
    });

    test("a page-lifetime client does not outlive a document that ends (reload)", async ({ page }) => {
      await page.goto(`${base}/lifetime-a.html`);
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      await page.evaluate(() => sessionStorage.removeItem("gw-destroyed"));
      await page.reload();
      await expect(page.locator("[data-life-count]:visible")).toHaveText("20");
      expect(await page.evaluate(() => sessionStorage.getItem("gw-destroyed"))).toBe("Lifetime A");
    });
  });
}

// React runs effects twice in development. The page client must still be made once and not destroyed while mounted.
test.describe("lifetimes, strict mode (development server)", () => {
  test.skip(!!only && !only.includes("dev"), "the development server is not selected");
  test("exactly one client is made and none is destroyed while the component stays mounted", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto(`http://127.0.0.1:${BUILDS.find((b) => b.dev)!.port}/lifetime-a.html`, { timeout: 180_000 });
    await expect(page.locator("[data-life-count]:visible")).toHaveText("20", { timeout: 120_000 });
    await page.waitForTimeout(1000);
    const entries = await log(page);
    expect(entries.filter((l) => l.startsWith("client:"))).toHaveLength(1);
    expect(entries.filter((l) => l.startsWith("destroy:"))).toEqual([]);
    expect(entries.filter((l) => l.startsWith("hold:")).length).toBeGreaterThanOrEqual(1);
    await expect(page.locator("[data-life-status]:visible")).toHaveText("ready");
  });
});
