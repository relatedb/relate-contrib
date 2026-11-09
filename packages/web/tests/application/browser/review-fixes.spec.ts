// covers-app: FR-007, FR-009, FR-011, FR-013, FR-019
import { expect, test } from "./fixtures.js";
import { count, diagnostic, makeClient, openHarness, rows, seed, status, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "rfx", version: 1, seed, ...over });

test("a seed given as a URL is fetched only when the store needs it, not on a restore", async ({ page }) => {
  let hits = 0;
  await page.route("**/seed/doc.json", (r) => {
    hits++;
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(seed) });
  });
  await openHarness(page);
  await makeClient(page, app({ seed: "/seed/doc.json" }));
  await waitStatus(page, "ready");
  expect(hits).toBe(1);
  for (let i = 0; i < 2; i++) {
    await openHarness(page);
    await makeClient(page, app({ seed: "/seed/doc.json" }));
    await waitStatus(page, "ready");
  }
  expect(hits).toBe(1);
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
});

test("a reset that fails to start stays a reset: the retry resets, and does not pass for success as an open", async ({ page }) => {
  let healthy = true;
  await page.route("**/seed/doc.json", (r) =>
    healthy ? r.fulfill({ contentType: "application/json", body: JSON.stringify(seed) }) : r.fulfill({ status: 500, body: "down" }),
  );
  await openHarness(page);
  await makeClient(page, app({ seed: "/seed/doc.json" }));
  await waitStatus(page, "ready");
  await rows(page, "CREATE (:Person {id: 'v', name: 'Visitor'})");
  healthy = false;
  const outcome = await page.evaluate(() => window.client!.resetApplication().then(() => "resolved", () => "rejected"));
  expect(outcome).toBe("rejected");
  expect(await status(page)).toBe("failed");
  healthy = true;
  await page.evaluate(() => window.client!.retry());
  await waitStatus(page, "ready");
  expect(await count(page, "MATCH (v:Person {id: 'v'}) RETURN count(v) AS c")).toBe(0); // it reset
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
  // and from then on a replaced worker opens, it does not reset again
  await rows(page, "CREATE (:Person {id: 'after', name: 'After'})");
  await page.evaluate(() => window.client!.destroy());
  await page.waitForTimeout(600);
  await openHarness(page);
  await makeClient(page, app({ seed: "/seed/doc.json" }));
  await waitStatus(page, "ready");
  expect(await count(page, "MATCH (a:Person {id: 'after'}) RETURN count(a) AS c")).toBe(1);
});

test("a page hidden while the client is starting does not start a worker, and a restore does", async ({ page }) => {
  await openHarness(page);
  await page.evaluate((a) => {
    window.app.make(a as never, { workerFactory: window.app.trackedWorker() });
    window.dispatchEvent(new Event("pagehide")); // before the start has got as far as creating its worker
  }, app());
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as unknown as { workers: unknown[] }).workers.length)).toBe(0);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })));
  await waitStatus(page, "ready");
  expect(await page.evaluate(() => (window as unknown as { workers: unknown[] }).workers.length)).toBe(1);
});

test("a store at an older version fails migration-failed, not ready, when the application has no migration for it", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, app({ name: "nomig" }));
  await waitStatus(page, "ready");
  await openHarness(page);
  await makeClient(page, app({ name: "nomig", version: 3, migrations: { 2: ["RETURN 1"] } }));
  await waitStatus(page, "failed");
  expect((await diagnostic(page))?.reason).toBe("migration-failed");
  expect((await diagnostic(page))?.engineError).toContain("version 3");
});

test("a migration step that touches the marker fails and the marker is put back", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, app({ name: "mk" }));
  await waitStatus(page, "ready");
  await openHarness(page);
  await makeClient(page, app({ name: "mk", version: 2, migrations: { 2: ["MATCH (n) SET n.touched = 1"] } }));
  await waitStatus(page, "failed");
  expect((await diagnostic(page))?.reason).toBe("migration-failed");
  await openHarness(page);
  await makeClient(page, app({ name: "mk" }));
  await waitStatus(page, "ready");
  expect(await rows(page, "MATCH (m:_RelateApplication) RETURN properties(m) AS p")).toEqual([{ p: { format: 1, version: 1, state: "ready" } }]);
});
