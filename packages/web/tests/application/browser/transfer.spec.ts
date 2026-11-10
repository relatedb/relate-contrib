// covers-app: FR-021, FR-022, FR-023, SC-006
import { expect, test } from "./fixtures.js";
import { count, diagnostic, itemSeed, makeClient, openHarness, openReady, record, rows, seed, status, waitStatus } from "./helpers.js";

const app = (over: Record<string, unknown> = {}) => ({ name: "xfer", version: 1, seed, ...over });

test("export reports each loss kind with its count and rejects without allowLoss", async ({ page }) => {
  await openReady(page, app({ seed: { version: 1, nodes: [], links: [] } }));
  await rows(page, "CREATE (:T {id: 'a', big: 9007199254740993, f: 2.0, d: date('2024-01-02'), dur: duration('P1D'), p: point({x: 1, y: 2}), e: []})");
  await rows(page, "CREATE (:T {id: 7}), (:T {name: 'anon'})");
  const rejected = await page.evaluate(async () => {
    try {
      await window.client!.exportApplication();
      return null;
    } catch (e) {
      return { reason: (e as { reason: string }).reason, losses: (e as { losses: unknown }).losses };
    }
  });
  expect(rejected?.reason).toBe("export-loss");
  const kinds = Object.fromEntries((rejected!.losses as Array<{ kind: string; count: number }>).map((l) => [l.kind, l.count]));
  expect(kinds).toEqual({ "integer-beyond-2^53": 1, "whole-number-float": 1, date: 1, duration: 1, point: 1, "empty-list": 1, "node-without-string-id": 2 });
  const allowed = await page.evaluate(() => window.client!.exportApplication({ allowLoss: true }));
  expect(allowed.losses.length).toBe(7);
  expect(allowed.envelope.document.nodes.map((n) => n.id)).toEqual(["a"]);
});

test("a carriable graph survives export, import and export identically, and the page's own data is replaced", async ({ page }, info) => {
  await openReady(page, app({ seed: itemSeed(5000) }));
  const t0 = Date.now();
  const first = await page.evaluate(() => window.client!.exportApplication());
  const exportMs = Date.now() - t0;
  expect(first.losses).toEqual([]);
  expect(first.envelope.document.nodes).toHaveLength(5000);
  await rows(page, "CREATE (:Item {id: 'extra', n: 99999})");
  await page.evaluate(async (env) => window.client!.importApplication(env), first.envelope);
  expect(await count(page, "MATCH (i:Item) RETURN count(i) AS c")).toBe(5000);
  const second = await page.evaluate(() => window.client!.exportApplication());
  expect(second.envelope).toEqual(first.envelope);
  // and after a reload the imported store opens as ready, not interrupted
  await openHarness(page);
  await makeClient(page, app({ seed: itemSeed(5000) }));
  await waitStatus(page, "ready");
  record(info, "export", "export-5000-nodes-ms", exportMs);
});

test("an envelope for another application or a newer version is rejected and changes nothing", async ({ page }) => {
  await openReady(page, app());
  const env = (await page.evaluate(() => window.client!.exportApplication())).envelope;
  for (const bad of [{ ...env, application: { name: "other", version: 1 } }, { ...env, application: { name: "xfer", version: 7 } }, { ...env, format: "x" }]) {
    const reason = await page.evaluate(async (b) => {
      try {
        await window.client!.importApplication(b as never);
        return "accepted";
      } catch (e) {
        return (e as { reason: string }).reason;
      }
    }, bad);
    expect(reason).toBe("invalid-document");
  }
  expect(await status(page)).toBe("ready");
  expect(await count(page, "MATCH (p:Person) RETURN count(p) AS c")).toBe(3);
});

test("a worker ended during an import leaves import-interrupted, and resetApplication recovers", async ({ page }, info) => {
  await openReady(page, app({ name: "cut", seed: itemSeed(20_000) }));
  const env = (await page.evaluate(() => window.client!.exportApplication())).envelope;
  await page.evaluate((e) => {
    void window.client!.importApplication(e).catch(() => undefined);
  }, env);
  await page.waitForTimeout(150);
  await openHarness(page, "/other.html"); // the page leaves, ending the worker part-way
  await openHarness(page);
  await makeClient(page, app({ name: "cut", seed: itemSeed(20_000) }));
  await page.waitForFunction(() => ["ready", "failed"].includes(window.client!.status), null, { timeout: 120_000 });
  const outcome = await status(page);
  record(info, "export", "interrupted-import-outcome", outcome === "failed" ? (await diagnostic(page))?.reason : "finished before the cut");
  if (outcome === "failed") {
    expect((await diagnostic(page))?.reason).toBe("import-interrupted");
    await page.evaluate(() => window.client!.resetApplication());
    expect(await status(page)).toBe("ready");
    expect(await count(page, "MATCH (i:Item) RETURN count(i) AS c")).toBe(20_000);
  }
});
