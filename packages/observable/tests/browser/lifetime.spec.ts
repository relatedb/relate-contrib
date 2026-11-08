// covers: FR-015, FR-016, SC-003, SC-008
import { countWorkers, expect, expectNoCellErrors, liveWorkers, origin, test } from "./fixtures.js";

// Count in sessionStorage too, so what a page left behind can be read after it navigates away.
const persistCounts = async (page: import("@playwright/test").Page): Promise<void> => {
  await page.addInitScript(() => {
    const state = (window as any).__workers;
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
    void state;
  });
};

test("moving an input that a cell reads 20 times leaves one worker for that graph, and the cell that reads nothing keeps its own", async ({ page }) => {
  await countWorkers(page);
  await persistCounts(page);
  await page.goto(`${origin}/rerun.html`);
  await expect(page.locator("#dependent-generation")).toHaveText("1", { timeout: 60_000 });
  await expect(page.locator("#stable-status")).toHaveText("ready", { timeout: 60_000 });
  const baseline = await liveWorkers(page); // the stable graph's worker and the dependent graph's
  expect(baseline).toBe(2);
  for (let level = 1; level <= 20; level++) {
    await page.evaluate((n) => {
      const input = document.querySelector("input[type=range]") as HTMLInputElement;
      input.value = String(n);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, level);
    await expect(page.locator("#level")).toHaveText(String(level), { timeout: 60_000 });
  }
  await expect(page.locator("#dependent-generation")).toHaveText("1");
  expect(await liveWorkers(page)).toBe(2);
  // the cell that reads no input kept its client, its worker and its generation
  await expect(page.locator("#stable-generation")).toHaveText("1");
  expect(await page.evaluate(() => (window as any).__stable.client.status)).toBe("ready");
  await expectNoCellErrors(page);
});

test("following a link to a page that opens nothing leaves no worker behind", async ({ page }) => {
  await countWorkers(page);
  await persistCounts(page);
  await page.goto(`${origin}/two-graphs.html`);
  await expect(page.locator("#one-status")).toHaveText("ready", { timeout: 60_000 });
  await expect(page.locator("#two-status")).toHaveText("ready", { timeout: 60_000 });
  expect(await liveWorkers(page)).toBe(2);
  await page.goto(`${origin}/blank.html`);
  const left = await page.evaluate(() => JSON.parse(sessionStorage.getItem("__w") ?? "{}"));
  expect(left.created - left.terminated).toBe(0);
  expect(await page.evaluate(() => (window as any).__workers.created)).toBe(0); // blank creates none
});

test("two graphs on one page are independent: a crash in one's engine replaces it and leaves the other's generation alone", async ({ page }) => {
  await page.goto(`${origin}/two-graphs.html`);
  await expect(page.locator("#one-count")).toHaveText("20", { timeout: 60_000 });
  await expect(page.locator("#two-count")).toHaveText("300", { timeout: 60_000 });
  await page.locator("#trap-one").click();
  await expect(page.locator("#one-generation")).toHaveText("2", { timeout: 60_000 });
  await expect(page.locator("#one-status")).toHaveText("ready", { timeout: 60_000 });
  await expect(page.locator("#one-count")).toHaveText("20");
  await expect(page.locator("#two-generation")).toHaveText("1");
  await expect(page.locator("#two-status")).toHaveText("ready");
});
