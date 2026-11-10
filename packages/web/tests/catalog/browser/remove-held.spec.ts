// covers-cat: FR-019
// Research R9 (specs/007): does removing a store's directory fail while another tab holds the store, in each browser,
// and with which error? `removeGraph` is designed around "it fails, so a held store is never removed".
import { expect, test } from "./fixtures.js";
import { count, openHarness, openReady, record, seed } from "./helpers.js";

type Outcome = { removed: boolean; error?: string; name?: string };

/** Remove `relate/<store>` recursively from this page, as `removeGraph` will. */
async function removeDirectory(page: import("@playwright/test").Page, store: string): Promise<Outcome> {
  return page.evaluate(async (s) => {
    try {
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle("relate");
      await base.removeEntry(s, { recursive: true });
      return { removed: true };
    } catch (e) {
      const err = e as { name?: string; message?: string };
      return { removed: false, name: err.name, error: String(err.message).slice(0, 120) };
    }
  }, store);
}

const exists = (page: import("@playwright/test").Page, store: string): Promise<boolean> =>
  page.evaluate(async (s) => {
    try {
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle("relate");
      await base.getDirectoryHandle(s);
      return true;
    } catch {
      return false;
    }
  }, store);

test("removing the directory of a store another tab holds fails, and the holder keeps working", async ({ context, page }, info) => {
  await openReady(page, { name: "held", version: 1, seed });
  const other = await context.newPage();
  await openHarness(other, "/other.html");

  const held = await removeDirectory(other, "app-held");
  const holderStillWorks = await count(page, "MATCH (n:Person) RETURN count(n) AS c").then((c) => c === 3, () => false);
  const stillThere = await exists(other, "app-held");

  record(info, "remove", "held", { held, holderStillWorks, directoryStillThere: stillThere, method: "removeEntry(recursive) on relate/app-held from a second tab while the first holds the store" });
  expect(held.removed, `a browser that removes a held store changes the design (ADR-010 2.5): ${JSON.stringify(held)}`).toBe(false);
  expect(holderStillWorks).toBe(true);
  expect(stillThere).toBe(true);
});

test("removing the directory of a store nobody holds succeeds", async ({ context, page }, info) => {
  await openReady(page, { name: "idle", version: 1, seed });
  await page.close(); // the departing page's worker lets the store go
  const other = await context.newPage();
  await openHarness(other, "/other.html");

  let idle: Outcome = { removed: false };
  for (let attempt = 0; attempt < 30 && !idle.removed; attempt++) {
    idle = await removeDirectory(other, "app-idle");
    if (!idle.removed) await other.waitForTimeout(300);
  }
  const gone = !(await exists(other, "app-idle"));
  record(info, "remove", "idle", { idle, gone, method: "the same call after the holding page was closed, retried every 300 ms for up to 9 s" });
  expect(idle.removed, JSON.stringify(idle)).toBe(true);
  expect(gone).toBe(true);
});
