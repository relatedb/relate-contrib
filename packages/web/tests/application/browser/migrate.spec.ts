// covers-app: FR-011, FR-012, FR-013, SC-004
import { expect, test } from "./fixtures.js";
import { entry } from "../../catalog/browser/catalog-file.js";
import { count, diagnostic, itemSeed, makeClient, openHarness, rows, waitStatus } from "./helpers.js";

const NODES = 20_000;

/** The application at `version`, with a ranged step for each of versions 2 and 3, built inside the page. */
async function openAt(page: import("@playwright/test").Page, name: string, version: number, seedSize = NODES) {
  await page.evaluate(
    ([n, v, size, seed]) => {
      const { inRanges } = window.app.core;
      const step = (field: string) =>
        inRanges({ label: "Item", property: "n", step: 50, statement: `MATCH (i:Item) WHERE i.n >= $from AND i.n < $to AND i.${field} IS NULL SET i.${field} = i.n * 2` });
      void size;
      const all: Record<number, unknown[]> = { 2: [step("v2")], 3: [step("v3")] };
      const migrations = Object.fromEntries(Object.entries(all).filter(([k]) => Number(k) <= v));
      window.app.make({ name: n, version: v, seed, migrations } as never);
    },
    [name, version, seedSize, itemSeed(seedSize)] as const,
  );
}

const snapshot = (page: import("@playwright/test").Page) =>
  rows(page, "MATCH (i:Item) RETURN i.n AS n, i.v2 AS v2, i.v3 AS v3 ORDER BY i.n").then((r) => JSON.stringify(r));

test("a store at version 1 is migrated to 3 in order, keeping the visitor's data", async ({ page }) => {
  await openHarness(page);
  await openAt(page, "mig", 1, 2000);
  await waitStatus(page, "ready");
  await rows(page, "CREATE (:Item {id: 'mine', n: 5000})");
  await openHarness(page);
  await openAt(page, "mig", 3, 2000);
  await waitStatus(page, "ready");
  expect(await entry(page, "app-mig")).toMatchObject({ state: "ready", version: 3 });
  expect(await count(page, "MATCH (i:Item) WHERE i.v2 = i.n * 2 AND i.v3 = i.n * 2 RETURN count(i) AS c")).toBe(2001);
});

// The cut position depends on timing; the deterministic interruption is tested in unit/ranges.test.ts. This test
// checks the same end state through a real page departure.
test("an interrupted migration resumes and ends identical to an uninterrupted one", async ({ page }) => {
  // the uninterrupted run, on its own store
  await openHarness(page);
  await openAt(page, "clean", 1);
  await waitStatus(page, "ready");
  await page.evaluate(() => window.client!.destroy());
  await openHarness(page);
  const t0 = Date.now();
  await openAt(page, "clean", 3);
  await waitStatus(page, "ready");
  const uninterruptedMs = Date.now() - t0;
  const expected = await snapshot(page);
  await page.evaluate(() => window.client!.destroy());

  // the interrupted run: leave the page while the migration is running
  await openHarness(page);
  await openAt(page, "cut", 1);
  await waitStatus(page, "ready");
  await page.evaluate(() => window.client!.destroy());
  await openHarness(page);
  await openAt(page, "cut", 3);
  await page.waitForTimeout(Math.min(600, Math.round(uninterruptedMs / 3)));
  await openHarness(page, "/other.html"); // the worker is ended part-way
  await openHarness(page);
  await openAt(page, "cut", 3);
  await waitStatus(page, "ready", 120_000);
  expect(await snapshot(page)).toBe(expected);
  expect(await entry(page, "app-cut")).toMatchObject({ state: "ready", version: 3 });
  test.info().annotations.push({ type: "uninterrupted-ms", description: String(uninterruptedMs) });
});

test("a failing statement fails the client naming the version and statement, and the store stays at the last version", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, { name: "bad", version: 1, seed: itemSeed(10) });
  await waitStatus(page, "ready");
  await openHarness(page);
  await makeClient(page, { name: "bad", version: 3, seed: itemSeed(10), migrations: { 2: ["MATCH (i:Item) SET i.ok = 1"], 3: ["THIS IS NOT CYPHER"] } });
  await waitStatus(page, "failed");
  const d = await diagnostic(page);
  expect(d?.reason).toBe("migration-failed");
  expect(d?.engineError).toContain("version 3");
  expect(d?.engineError).toContain("THIS IS NOT CYPHER");
  expect(await page.evaluate(() => window.client!.failureMessage())).toContain("THIS IS NOT CYPHER");
  // fixed in the next release, the store resumes at 3 and version 2 is not run again
  await openHarness(page);
  await makeClient(page, { name: "bad", version: 3, seed: itemSeed(10), migrations: { 2: ["MATCH (i:Item) SET i.never = 1"], 3: ["MATCH (i:Item) SET i.three = 1"] } });
  await waitStatus(page, "ready");
  expect(await count(page, "MATCH (i:Item) WHERE i.never IS NOT NULL RETURN count(i) AS c")).toBe(0);
  expect(await count(page, "MATCH (i:Item) WHERE i.three = 1 RETURN count(i) AS c")).toBe(10);
});
