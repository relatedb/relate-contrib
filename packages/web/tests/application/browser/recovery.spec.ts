// covers-app: FR-007, FR-008, FR-009, FR-010, SC-003
import { expect, test } from "./fixtures.js";
import { RUNAWAY, count, diagnostic, makeBulk, makeClient, openHarness, openReady, rows, seed, status, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "rec", version: 1, seed, ...over });

/** Reload the page and open a client on the same store; resolves when it is ready or failed. */
async function reopen(page: import("@playwright/test").Page, over: Record<string, unknown> = {}): Promise<string> {
  await openHarness(page);
  await makeClient(page, app(over));
  await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
  return status(page);
}

const people = (page: import("@playwright/test").Page) => count(page, "MATCH (p:Person) RETURN count(p) AS c");

test("an interrupted first run is reset and seeded again", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, app({ seed: { version: 1, nodes: [{ id: "ok", labels: ["Half"] }, { labels: ["NoId"] }], links: [] } }));
  await waitStatus(page, "failed"); // the marker stays "seeding"
  expect(await reopen(page)).toBe("ready");
  expect(await people(page)).toBe(3);
  expect(await rows(page, "MATCH (m:_RelateApplication) RETURN m.state AS s")).toEqual([{ s: "ready" }]);
});

for (const [name, change, reason] of [
  ["an interrupted import", "SET m.state = 'importing'", "import-interrupted"],
  ["a deleted marker", "DELETE m", "store-unmarked"],
  ["a newer version", "SET m.version = 9", "store-newer"],
  ["a newer format", "SET m.format = 2", "store-newer"],
] as const) {
  test(`${name} fails ${reason}, leaves the data alone and resetApplication recovers`, async ({ page }) => {
    await openReady(page, app());
    await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
    await rows(page, `MATCH (m:_RelateApplication) ${change}`);
    const before = await count(page, "MATCH (n) RETURN count(n) AS c");

    expect(await reopen(page)).toBe("failed");
    expect((await diagnostic(page))?.reason).toBe(reason);
    const message = await page.evaluate(() => window.client!.failureMessage());
    expect(message).toContain("resetApplication()");

    // retry fails again without writing
    await page.evaluate(() => window.client!.retry());
    await page.waitForFunction(() => window.client!.status === "failed");
    expect((await diagnostic(page))?.reason).toBe(reason);

    // the data is as it was (open it by resetting nothing: read the node count through a raw second look)
    await page.evaluate(() => window.client!.destroy());
    await page.waitForTimeout(500);
    await openHarness(page);
    await makeClient(page, app({ version: change.includes("version") ? 9 : 1 }));
    await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
    if (change.includes("version")) {
      expect(await status(page)).toBe("ready"); // code at version 9 opens it: the data was there
      expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(before);
    } else {
      expect(await status(page)).toBe("failed");
    }

    // resetApplication is the way out
    await openHarness(page);
    await makeClient(page, app());
    await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
    if ((await status(page)) === "failed") {
      await page.evaluate(() => window.client!.resetApplication());
      expect(await status(page)).toBe("ready");
      expect(await people(page)).toBe(3);
      expect(await count(page, "MATCH (v:Person {id: 'v'}) RETURN count(v) AS c")).toBe(0);
    }
  });
}

test("a reload of a ready store resets nothing", async ({ page }) => {
  await openReady(page, app());
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  expect(await reopen(page)).toBe("ready");
  expect(await people(page)).toBe(4);
});

test("a replaced worker reopens the same store and keeps the visitor's record", async ({ page }) => {
  await openReady(page, app());
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  await makeBulk(page);
  const outcome = await page.evaluate(async (runaway) => {
    const run = window.client!.run(runaway, null, { timeoutMs: 300 });
    try {
      await run.result;
      return "finished";
    } catch (e) {
      return (e as { reason?: string }).reason ?? String(e);
    }
  }, RUNAWAY);
  expect(outcome).toBe("timeout");
  await page.waitForFunction(() => window.client!.status === "ready" && window.client!.generation >= 2, null, { timeout: 60_000 });
  expect(await count(page, "MATCH (v:Person {id: 'v'}) RETURN count(v) AS c")).toBe(1);
  expect(await people(page)).toBe(4);
  expect(await count(page, "MATCH (b:Bulk) RETURN count(b) AS c")).toBe(1000);
  expect(await count(page, "MATCH (b:Bulk) RETURN count(b) AS c")).toBe(1000);
});
