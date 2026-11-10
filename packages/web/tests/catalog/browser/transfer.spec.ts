// covers-cat: FR-007, SC-005
import { entry } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { itemSeed, openHarness, waitStatus } from "./helpers.js";

type Page = import("@playwright/test").Page;

/** The application at `version`, with a ranged step for version 2, built inside the page. */
async function openAt(page: Page, name: string, version: number, size: number): Promise<void> {
  await page.evaluate(
    ([n, v, seed]) => {
      const { inRanges } = window.app.core;
      const step = inRanges({ label: "Item", property: "n", step: 50, statement: "MATCH (i:Item) WHERE i.n >= $from AND i.n < $to AND i.v2 IS NULL SET i.v2 = i.n * 2" });
      window.app.make({ name: n, version: v, seed, migrations: (v as number) >= 2 ? { 2: [step] } : {} } as never);
    },
    [name, version, itemSeed(size)] as const,
  );
}

test("an export asked for during an import waits for it, so it never shows a half-imported or unmigrated store", async ({ page }) => {
  test.setTimeout(240_000);
  const SIZE = 20_000;
  // an envelope at version 1, from a store at version 1
  await openHarness(page);
  await openAt(page, "serial", 1, SIZE);
  await waitStatus(page, "ready", 120_000);
  const first = await page.evaluate(() => window.client!.exportApplication());
  expect(first.envelope.application.version).toBe(1);
  await page.evaluate(() => window.client!.destroy());

  // the same application at version 2: importing the version 1 envelope migrates it, and an export is asked for meanwhile
  await openHarness(page);
  await openAt(page, "serial", 2, SIZE);
  await waitStatus(page, "ready", 120_000);
  // start the import, and ask for the export only once the import is under way (its entry says so)
  await page.evaluate((envelope) => {
    (window as unknown as { importing: Promise<unknown> }).importing = window.client!.importApplication(envelope as never);
  }, first.envelope);
  await expect.poll(() => entry(page, "app-serial").then((e) => e?.state), { timeout: 60_000, intervals: [2] }).toMatch(/importing|migrating/);
  const exported = await page.evaluate(async () => {
    const result = await window.client!.exportApplication();
    await (window as unknown as { importing: Promise<unknown> }).importing;
    return result;
  });
  expect(exported.envelope.application.version).toBe(2);
  expect(exported.envelope.document.nodes).toHaveLength(SIZE);
  // every node carries the version 2 property: the export ran after the import's migration, not inside it
  const unmigrated = exported.envelope.document.nodes.filter((n) => (n.properties as { v2?: number }).v2 === undefined).length;
  expect(unmigrated).toBe(0);
  expect(await entry(page, "app-serial")).toMatchObject({ state: "ready", version: 2 });
});

test("two imports asked for together run one after the other and leave one consistent store", async ({ page }) => {
  test.setTimeout(240_000);
  await openHarness(page);
  await openAt(page, "twice", 1, 2000);
  await waitStatus(page, "ready", 120_000);
  const envelope = await page.evaluate(() => window.client!.exportApplication());
  const done = await page.evaluate((e) => Promise.all([window.client!.importApplication(e as never), window.client!.importApplication(e as never)]).then(() => "both"), envelope.envelope);
  expect(done).toBe("both");
  const count = await page.evaluate(async () => (await window.client!.query("MATCH (i:Item) RETURN count(i) AS c")).rows[0]!.c);
  expect(count).toBe(2000);
  expect(await entry(page, "app-twice")).toMatchObject({ state: "ready", version: 1 });
});
