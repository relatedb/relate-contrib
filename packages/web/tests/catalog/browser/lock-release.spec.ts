// covers-cat: FR-005, SC-002
import { expect, test } from "./fixtures.js";
import { openHarness } from "./helpers.js";

const LOCK = "relate-web:catalog";

/** Start waiting for the exclusive lock in `page`; it resolves with the time of acquiring and the catalog file read then. */
function waitForLock(page: import("@playwright/test").Page) {
  return page.evaluate(
    (name) =>
      new Promise<{ at: number; text: string | null }>((resolve) => {
        void navigator.locks.request(name, { mode: "exclusive" }, async () => {
          const at = Date.now();
          let text: string | null = null;
          try {
            const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web");
            text = await (await (await dir.getFileHandle("catalog.json")).getFile()).text();
          } catch {
            /* no file */
          }
          resolve({ at, text });
        });
      }),
    LOCK,
  );
}

async function seedCatalog(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(async () => {
    const catalog = new window.app.Catalog(new window.app.OpfsCatalogStorage());
    await catalog.set("app-a", { kind: "application", name: "a", state: "ready", version: 1, seeded: true });
  });
}

test("a worker holding the lock is terminated: a waiting tab gets it and reads a whole catalog within 100 ms", async ({ context, page }) => {
  const waiter = await context.newPage();
  await openHarness(page);
  await openHarness(waiter);
  await seedCatalog(page);
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve) => {
        const code = `navigator.locks.request(${JSON.stringify(name)}, { mode: "exclusive" }, () => { postMessage("held"); return new Promise(() => {}); });`;
        const worker = new Worker(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
        (window as unknown as { holder: Worker }).holder = worker;
        worker.onmessage = () => resolve();
      }),
    LOCK,
  );
  const waiting = waitForLock(waiter);
  await page.waitForTimeout(200);
  const terminatedAt = await page.evaluate(() => {
    const at = Date.now();
    (window as unknown as { holder: Worker }).holder.terminate();
    return at;
  });
  const got = await waiting;
  expect(got.at - terminatedAt).toBeLessThan(100);
  expect(JSON.parse(got.text!).graphs["app-a"].state).toBe("ready");
});

test("a tab holding the lock is closed: a waiting tab gets it and reads a whole catalog within 300 ms", async ({ context, page }) => {
  const waiter = await context.newPage();
  await openHarness(page);
  await openHarness(waiter);
  await seedCatalog(page);
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve) => {
        void navigator.locks.request(name, { mode: "exclusive" }, () => {
          resolve();
          return new Promise(() => {});
        });
      }),
    LOCK,
  );
  const waiting = waitForLock(waiter);
  await waiter.waitForTimeout(200);
  const closedAt = Date.now();
  await page.close();
  const got = await waiting;
  expect(got.at - closedAt).toBeLessThan(300);
  expect(JSON.parse(got.text!).graphs["app-a"].state).toBe("ready");
});
