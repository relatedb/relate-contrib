// covers-ra: FR-024, FR-028, SC-005
// What the demo says about where the records are kept: durable, in memory only, or waiting on another tab; and that it asks
// the browser to keep them only when the visitor presses the button.
import { expect, test } from "./fixtures.js";
import { createPerson, expectTotal, names, openList, plain } from "./helpers.js";

/** Remove the origin-private file system from the page and from the worker, as a browser with no storage would be. */
async function noStorage(page: import("@playwright/test").Page): Promise<void> {
  const patch = "Object.defineProperty(navigator.storage, 'getDirectory', { value: undefined });\n";
  await page.addInitScript(patch);
  await page.context().route(/\/assets\/worker-[^/]*\.js$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: patch + (await response.text()) });
  });
}

test("the notice says the records are stored durably", async ({ page }) => {
  await openList(page, plain("people"));
  const notice = page.getByTestId("storage-notice");
  await expect(notice).toHaveAttribute("data-kind", "durable");
  await expect(notice).toContainText("stored in this browser");
});

test("with no browser storage the notice says memory only, with the reason, and the app still works", async ({ page }) => {
  await noStorage(page);
  await openList(page, plain("people"));
  const notice = page.getByTestId("storage-notice");
  await expect(notice).toHaveAttribute("data-kind", "memory");
  await expect(notice).toHaveAttribute("data-reason", "unavailable");
  await expect(notice).toContainText("memory only");
  await expectTotal(page, 50);
});

test("a second tab says it is waiting while the first holds the data, and continues when the first closes", async ({ context, page }) => {
  await openList(page, plain("people"));
  await createPerson(page, { name: "Held Tab Person" });
  await openList(page, plain("people"));
  await expectTotal(page, 51);

  const second = await context.newPage();
  await second.goto(plain("people"));
  const notice = second.getByTestId("storage-notice");
  await expect(notice).toHaveAttribute("data-reason", "locked", { timeout: 30_000 });
  await expect(notice).toContainText("Another tab");
  // no record is shown while it waits (the loading state is rows with nothing in them)
  expect((await names(second)).filter(Boolean)).toEqual([]);
  // the first tab is untouched
  await expectTotal(page, 51);

  await page.close();
  await expect(second.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
  await expect(notice).toHaveAttribute("data-kind", "durable");
  await expectTotal(second, 51); // the records the first tab wrote are there, not corrupted or reseeded
});

test("the browser is asked to keep the data only when the visitor presses the button", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__persistCalls = 0;
    // on the prototype: WebKit does not take a property defined on navigator.storage itself
    Object.defineProperty(StorageManager.prototype, "persist", {
      configurable: true,
      value: () => {
        (window as any).__persistCalls++;
        return Promise.resolve(false);
      },
    });
  });
  await openList(page, plain("people"));
  await expect(page.getByTestId("storage-notice")).toHaveAttribute("data-kind", "durable");
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as any).__persistCalls)).toBe(0); // never on its own

  await page.getByRole("button", { name: "Ask the browser to keep my data" }).click();
  await expect(page.getByTestId("persistence")).toContainText("did not agree");
  expect(await page.evaluate(() => (window as any).__persistCalls)).toBe(1);
});

test("the notice says so when the browser agrees to keep the data", async ({ page }) => {
  await page.addInitScript(() => {
    let persisted = false;
    Object.defineProperty(StorageManager.prototype, "persisted", { configurable: true, value: () => Promise.resolve(persisted) });
    Object.defineProperty(StorageManager.prototype, "persist", {
      configurable: true,
      value: () => {
        persisted = true;
        return Promise.resolve(true);
      },
    });
  });
  await openList(page, plain("people"));
  await page.getByRole("button", { name: "Ask the browser to keep my data" }).click();
  await expect(page.getByTestId("persistence")).toContainText("agreed");
});
