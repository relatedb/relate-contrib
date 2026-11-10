// covers-ra: FR-025, FR-034, SC-006
// What the demo shows when the stored data cannot be opened: the reason in plain words and a confirmed reset, and no export
// (the core cannot export from a failed client); and that the shell is on screen while the client is still loading.
// Each failure is forced from the blank page by writing the state the core's own tests use, then the demo is opened.
import { failureInfo } from "../../src/failures.js";
import { expect, test, type Page } from "./fixtures.js";
import { expectTotal, names, openList, plain } from "./helpers.js";
import { entry, openBlank, putEntry, removeStoreDirectory, writeCatalogText } from "./state.js";

/** Run the demo once so there is a store and a catalog entry, then leave it (its worker ends with the page). */
async function firstRun(page: Page): Promise<void> {
  await openList(page, plain("people"));
  await expectTotal(page, 50);
  await openBlank(page);
}

const cases: Array<{ reason: string; force: (page: Page) => Promise<void> }> = [
  { reason: "store-newer", force: (page) => putEntry(page, { version: 99 }) },
  { reason: "store-lost", force: (page) => removeStoreDirectory(page) },
  { reason: "store-unmarked", force: (page) => putEntry(page, null) },
  { reason: "store-unreadable", force: (page) => writeCatalogText(page, "{ this is not a catalog") },
  { reason: "import-interrupted", force: (page) => putEntry(page, { state: "importing" }) },
];

for (const { reason, force } of cases) {
  test(`${reason}: shows the reason and a confirmed reset, no export, and the reset recovers`, async ({ page }) => {
    await firstRun(page);
    await force(page);
    await page.goto("/");

    const screen = page.getByTestId("failure");
    await expect(screen).toHaveAttribute("data-reason", reason, { timeout: 60_000 });
    const info = failureInfo(reason);
    await expect(page.getByRole("heading", { name: info.title })).toBeVisible(); // a page, not a blank one
    await expect(screen).toContainText(info.explanation);
    await expect(screen).toContainText("discards the stored data");
    // the only choice is a reset, and it asks first: no export or download is offered
    await expect(page.getByRole("button")).toHaveText(["Reset demo data"]);
    await page.getByRole("button", { name: "Reset demo data" }).click();
    await expect(page.getByRole("button")).toHaveText(["Confirm reset", "Cancel"]);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(screen).toBeVisible();

    await page.getByRole("button", { name: "Reset demo data" }).click();
    await page.getByRole("button", { name: "Confirm reset" }).click();
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
    await expectTotal(page, 50); // the demo data again
    await expect(page.getByTestId("storage-notice")).toHaveAttribute("data-kind", "durable");
    await expect(page.getByTestId("failure")).toHaveCount(0);

    // and the catalog is sound again, so the next visit opens without a failure
    await openBlank(page);
    expect((await entry(page))?.state).toBe("ready");
    await openList(page, plain("people"));
    await expectTotal(page, 50);
  });
}

test("the shell and the storage notice are on screen while the client is loading, and the lists fill when it is ready", async ({ context, page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await context.route("**/*.wasm", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/#/people");
  await expect(page.getByRole("menuitem", { name: "Companies" })).toBeVisible();
  await expect(page.getByTestId("storage-notice")).toBeVisible();
  await expect(page.getByTestId("storage-notice")).not.toHaveAttribute("data-kind", "durable");
  expect((await names(page)).filter(Boolean)).toEqual([]); // a loading state, not records and not a blank page

  release();
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("storage-notice")).toHaveAttribute("data-kind", "durable");
});
