// covers-cat: FR-001, FR-004, FR-007, FR-011, SC-001
import { entry, catalogFile } from "./catalog-file.js";
import { expect, test } from "./fixtures.js";
import { count, makeClient, openHarness, openReady, rows, seed, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "orders", version: 1, seed, ...over });

test("a first run writes the catalog entry and the graph holds no bookkeeping node", async ({ page }) => {
  await openReady(page, app());
  expect(await entry(page, "app-orders")).toMatchObject({ kind: "application", name: "orders", state: "ready", version: 1, seeded: true });
  expect((await catalogFile(page))!.format).toBe(1);
  expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(3);
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(4);
});

test("a reload keeps the visitor's record and does not rewrite the entry", async ({ page }) => {
  await openReady(page, app());
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  const before = await entry(page, "app-orders");
  await openHarness(page);
  await makeClient(page, app({ seed: { version: 1, nodes: [{ id: "z", labels: ["Zed"] }], links: [] } }));
  await waitStatus(page, "ready");
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(4);
  expect(await count(page, "MATCH (z:Zed) RETURN count(z) AS c")).toBe(0);
  expect(await entry(page, "app-orders")).toEqual(before);
});

test("an application with an empty seed records seeded false and its empty store opens", async ({ page }) => {
  await openReady(page, app({ name: "blank", seed: { version: 1, nodes: [], links: [] } }));
  expect(await entry(page, "app-blank")).toMatchObject({ state: "ready", seeded: false });
  await openReady(page, app({ name: "blank", seed: { version: 1, nodes: [], links: [] } }));
  expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(0);
});

test("a statement that deletes every node ends the next open as store-lost, untouched, and resetApplication recovers", async ({ page }) => {
  await openReady(page, app({ name: "wiped" }));
  await rows(page, "MATCH (n) DETACH DELETE n");
  await rows(page, "DROP INDEX Person_name IF EXISTS");
  const before = await entry(page, "app-wiped");
  await openHarness(page);
  await makeClient(page, app({ name: "wiped" }));
  await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.client!.status)).toBe("failed");
  expect((await page.evaluate(() => window.client!.diagnostic))?.reason).toBe("store-lost");
  expect(await entry(page, "app-wiped")).toEqual(before);
  await page.evaluate(() => window.client!.resetApplication());
  expect(await count(page, "MATCH (n) RETURN count(n) AS c")).toBe(3);
});
