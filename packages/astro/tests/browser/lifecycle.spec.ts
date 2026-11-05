// covers: FR-029, FR-016, FR-018, FR-019, FR-020, FR-021, FR-022, FR-024, SC-003, SC-004
import { expect, test } from "./fixtures.js";
import type { Page } from "./fixtures.js";

const sites = { "multi-page": "http://127.0.0.1:5180", "client-routing": "http://127.0.0.1:5181" } as const;
const log = (page: Page) => page.evaluate(() => [...((window as unknown as { __relLog?: string[] }).__relLog ?? [])]);
const follow = async (page: Page, label: string, title: string) => {
  await page.locator("a[data-rel-link]", { hasText: label }).first().click();
  await page.waitForFunction((t) => document.querySelector("[data-rel-title]")?.textContent?.trim() === t, title);
};

for (const [profile, base] of Object.entries(sites)) {
  test.describe(`under ${profile}`, () => {
    test("setup runs once on the first page, with a registered page-lifetime graph, and asking twice gives one client", async ({ page }) => {
      await page.goto(`${base}/lifetime-a.html?navigation=${profile}`);
      await expect(page.locator("[data-life-count]")).toHaveText("20");
      expect(await log(page)).toEqual(["setup:Lifetime A", "same:true", "marked:Lifetime A"]);
    });

    test("a selector keeps a setup off the pages where it does not match", async ({ page }) => {
      await page.goto(`${base}/lifetime-b.html?navigation=${profile}`);
      await expect(page.locator("[data-life-count]")).toHaveText("20");
      const entries = await log(page);
      expect(entries).toContain("setup:Lifetime B");
      expect(entries.some((e) => e.startsWith("marked:"))).toBe(false);
    });

    test("a page with no graph markup starts no client", async ({ page }) => {
      await page.goto(`${base}/plain.html?navigation=${profile}`);
      await page.waitForTimeout(500);
      expect(await log(page)).toEqual([]);
    });
  });
}

test.describe("under client-routing, across router navigations", () => {
  const base = sites["client-routing"];

  test("each page's setup follows the previous page's cleanup and the page client is destroyed before it", async ({ page }) => {
    await page.goto(`${base}/lifetime-a.html?navigation=client-routing`);
    await expect(page.locator("[data-life-count]")).toHaveText("20");
    await follow(page, "Lifetime B", "Lifetime B");
    await expect(page.locator("[data-life-count]")).toHaveText("20");
    expect(await log(page)).toEqual(["setup:Lifetime A", "same:true", "marked:Lifetime A", "cleanup:Lifetime A", "destroy:Lifetime A", "setup:Lifetime B", "same:true"]);
  });

  test("a registered page-lifetime graph is restored from the store on the next page", async ({ page }) => {
    await page.goto(`${base}/lifetime-a.html?navigation=client-routing`);
    await expect(page.locator("[data-life-count]")).toHaveText("20");
    await expect(page.locator("[data-life-restored]")).toHaveText("false");
    await follow(page, "Lifetime B", "Lifetime B");
    await expect(page.locator("[data-life-count]")).toHaveText("20");
    await expect(page.locator("[data-life-restored]")).toHaveText("true");
  });

  test("a visit-lifetime graph keeps one worker and generation across link, history and script navigation", async ({ page }) => {
    await page.goto(`${base}/page-1.html?navigation=client-routing`);
    await page.waitForFunction(() => document.documentElement.dataset.relState === "ready");
    const instance = await page.locator("[data-rel-instance]").textContent();
    const steady = async (label: string) => {
      await page.waitForFunction(() => document.documentElement.dataset.relState === "ready");
      expect(await page.locator("[data-rel-instance]").textContent(), label).toBe(instance);
      expect(await page.locator("[data-rel-generation]").textContent(), label).toBe("1");
      await expect(page.locator("[data-rel-count]")).toHaveText("300");
    };
    await follow(page, "Page 2", "Example site: page 2");
    await steady("link");
    await page.goBack();
    await page.waitForFunction(() => document.querySelector("[data-rel-title]")?.textContent?.trim() === "Example site: page 1");
    await steady("back");
    await page.goForward();
    await page.waitForFunction(() => document.querySelector("[data-rel-title]")?.textContent?.trim() === "Example site: page 2");
    await steady("forward");
    // a programmatic navigation through the router
    await page.evaluate(() => (window as unknown as { __relNavigate(href: string): Promise<void> }).__relNavigate("/page-1.html?navigation=client-routing"));
    await page.waitForFunction(() => document.querySelector("[data-rel-title]")?.textContent?.trim() === "Example site: page 1");
    await steady("script");
  });
});

test("under multi-page, the page client is destroyed when the visitor follows a link to another document", async ({ page }) => {
  const base = sites["multi-page"];
  await page.goto(`${base}/lifetime-a.html?navigation=multi-page`);
  await expect(page.locator("[data-life-count]")).toHaveText("20");
  await follow(page, "Lifetime B", "Lifetime B");
  await expect(page.locator("[data-life-count]")).toHaveText("20");
  // the new document starts its own log; the stored copy was free for it
  await expect(page.locator("[data-life-restored]")).toHaveText("true");
  expect(await log(page)).toEqual(["setup:Lifetime B", "same:true"]);
});

test("a page-lifetime client is destroyed on reload and when the page is hidden", async ({ page }) => {
  for (const [profile, base] of Object.entries(sites)) {
    await page.goto(`${base}/lifetime-a.html?navigation=${profile}`);
    await expect(page.locator("[data-life-count]")).toHaveText("20");
    await page.evaluate(() => sessionStorage.removeItem("rel-destroyed"));
    await page.reload();
    await expect(page.locator("[data-life-count]")).toHaveText("20");
    expect(await page.evaluate(() => sessionStorage.getItem("rel-destroyed")), profile).toBe("Lifetime A");
  }
});

for (const [profile, base] of Object.entries(sites)) {
  test(`the direct lookup returns one client for a visit-lifetime graph and starts one worker, under ${profile}`, async ({ page }) => {
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
    await page.goto(`${base}/direct.html?navigation=${profile}`);
    await expect(page.locator("[data-direct-count]")).toHaveText("300");
    expect(await page.evaluate(() => (window as unknown as { __relDirect: { same: boolean } }).__relDirect.same)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __workers: number }).__workers)).toBe(1);
  });
}
