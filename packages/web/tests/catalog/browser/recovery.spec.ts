// covers-cat: FR-007, FR-010, FR-014, SC-004, SC-005
import { endWhenState, entry, putEntry } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { count, diagnostic, itemSeed, makeClient, openHarness, openReady, rows, status, waitStatus } from "./helpers.js";

const items = (page: import("@playwright/test").Page) => count(page, "MATCH (i:Item) RETURN count(i) AS c");

async function reopen(page: import("@playwright/test").Page, application: Record<string, unknown>): Promise<string> {
  await openHarness(page);
  await makeClient(page, application);
  await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 120_000 });
  return status(page);
}

test("an application stopped while seeding is reset and seeded again", async ({ page }) => {
  test.setTimeout(240_000);
  const application = { name: "ms", version: 1, seed: itemSeed(60_000) };
  await openHarness(page);
  await makeClient(page, application);
  expect(await endWhenState(page, "app-ms", ["seeding"])).toBe("seeding");
  expect(await entry(page, "app-ms")).toMatchObject({ state: "seeding" });

  expect(await reopen(page, application)).toBe("ready");
  expect(await items(page)).toBe(60_000);
  expect(await entry(page, "app-ms")).toMatchObject({ state: "ready", seeded: true });
});

/** The application at `version`, with a ranged step for each of versions 2 and 3, built inside the page. */
async function openAt(page: import("@playwright/test").Page, name: string, version: number, size: number): Promise<void> {
  await page.evaluate(
    ([n, v, seed]) => {
      const { inRanges } = window.app.core;
      const step = (field: string) => inRanges({ label: "Item", property: "n", step: 50, statement: `MATCH (i:Item) WHERE i.n >= $from AND i.n < $to AND i.${field} IS NULL SET i.${field} = i.n * 2` });
      const all: Record<number, unknown[]> = { 2: [step("v2")], 3: [step("v3")] };
      const migrations = Object.fromEntries(Object.entries(all).filter(([k]) => Number(k) <= (v as number)));
      window.app.make({ name: n, version: v, seed, migrations } as never);
    },
    [name, version, itemSeed(size)] as const,
  );
}
const snapshot = (page: import("@playwright/test").Page) => rows(page, "MATCH (i:Item) RETURN i.n AS n, i.v2 AS v2, i.v3 AS v3 ORDER BY i.n").then((r) => JSON.stringify(r));

test("an application stopped while migrating resumes from the recorded version and ends identical to an uninterrupted run", async ({ page }) => {
  test.setTimeout(300_000);
  const SIZE = 30_000;
  // the uninterrupted run, on its own store
  await openHarness(page);
  await openAt(page, "mmclean", 1, SIZE);
  await waitStatus(page, "ready", 120_000);
  await page.evaluate(() => window.client!.destroy());
  await openHarness(page);
  await openAt(page, "mmclean", 3, SIZE);
  await waitStatus(page, "ready", 120_000);
  const expected = await snapshot(page);
  await page.evaluate(() => window.client!.destroy());

  // the interrupted run
  await openHarness(page);
  await openAt(page, "mm", 1, SIZE);
  await waitStatus(page, "ready", 120_000);
  await page.evaluate(() => window.client!.destroy());
  await openHarness(page);
  await openAt(page, "mm", 3, SIZE);
  expect(await endWhenState(page, "app-mm", ["migrating"])).toBe("migrating");
  expect(await entry(page, "app-mm")).toMatchObject({ state: "migrating", target: expect.any(Number) });

  await openHarness(page);
  await openAt(page, "mm", 3, SIZE);
  await waitStatus(page, "ready", 120_000);
  expect(await snapshot(page)).toBe(expected);
  expect(await entry(page, "app-mm")).toMatchObject({ state: "ready", version: 3 });
});

test("an application stopped during an import fails import-interrupted, never seeds over the store, and resetApplication recovers", async ({ page }) => {
  test.setTimeout(240_000);
  const application = { name: "mi", version: 1, seed: itemSeed(20_000) };
  await openReady(page, application);
  const first = await page.evaluate(() => window.client!.exportApplication());
  await page.evaluate((env) => void window.client!.importApplication(env).catch(() => undefined), first.envelope);
  expect(await endWhenState(page, "app-mi", ["importing"])).toBe("importing");

  expect(await reopen(page, application)).toBe("failed");
  expect((await diagnostic(page))?.reason).toBe("import-interrupted");
  expect(await entry(page, "app-mi")).toMatchObject({ state: "importing" });

  await page.evaluate(() => window.client!.resetApplication());
  expect(await status(page)).toBe("ready");
  expect(await items(page)).toBe(20_000);
  expect(await entry(page, "app-mi")).toMatchObject({ state: "ready" });
});

test("an application stopped during resetApplication continues the reset on the next open", async ({ page }) => {
  test.setTimeout(240_000);
  const application = { name: "mr", version: 1, seed: itemSeed(60_000) };
  await openReady(page, application);
  await rows(page, "CREATE (:Visitor {id: 'v'})");
  await page.evaluate(() => void window.client!.resetApplication().catch(() => undefined));
  expect(await endWhenState(page, "app-mr", ["resetting"])).toBe("resetting");

  expect(await reopen(page, application)).toBe("ready");
  expect(await count(page, "MATCH (v:Visitor) RETURN count(v) AS c")).toBe(0);
  expect(await items(page)).toBe(60_000);
  expect(await entry(page, "app-mr")).toMatchObject({ state: "ready" });
});

test("a removal that was started is finished on the next open and ends as a first run", async ({ page }) => {
  const application = { name: "mrm", version: 1, seed: itemSeed(100) };
  await openReady(page, application);
  await rows(page, "CREATE (:Visitor {id: 'v'})");
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  await putEntry(page, "app-mrm", { state: "removing" });

  expect(await reopen(page, application)).toBe("ready");
  expect(await count(page, "MATCH (v:Visitor) RETURN count(v) AS c")).toBe(0);
  expect(await items(page)).toBe(100);
  expect(await entry(page, "app-mrm")).toMatchObject({ state: "ready", seeded: true });
});
