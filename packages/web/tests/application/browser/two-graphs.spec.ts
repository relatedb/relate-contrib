// covers-app: FR-024, FR-017, FR-010
import { expect, test } from "./fixtures.js";
import { count, makeClient, openHarness, rows, seed, storage, waitStatus } from "./helpers.js";

test("a content client and an application client each have their own worker and store, and no statement spans them", async ({ page }) => {
  const g = (await import("../../fixtures/generate-graph.js")).generateGraph(200, { id: "both", revision: "r1", dataUrl: "/data/both.json" });
  await page.route("**/data/both.json", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(g.document) }));
  await openHarness(page);
  const info = await page.evaluate(
    async ([descriptor, a]) => {
      const w = window as unknown as { content: ReturnType<typeof window.app.core.createClient> };
      const content = window.app.core.createClient({ engineUrl: window.app.engineUrl, graph: { descriptor: descriptor as never }, navigation: "multi-page", workerFactory: window.app.trackedWorker() });
      w.content = content;
      const application = window.app.make(a as never, { workerFactory: window.app.trackedWorker() });
      await Promise.all([content.query("RETURN 1"), application.query("RETURN 1")]);
      const pages = await content.query("MATCH (p:Page) RETURN count(p) AS c");
      const people = await application.query("MATCH (p:Person) RETURN count(p) AS c");
      const crossA = await application.query("MATCH (p:Page) RETURN count(p) AS c");
      const crossC = await content.query("MATCH (p:Person) RETURN count(p) AS c");
      return { pages: pages.rows[0]!.c, people: people.rows[0]!.c, crossA: crossA.rows[0]!.c, crossC: crossC.rows[0]!.c, workers: (window as unknown as { workers: unknown[] }).workers.length };
    },
    [g.descriptor, { name: "app2", version: 1, seed }] as const,
  );
  expect(info).toEqual({ pages: 200, people: 3, crossA: 0, crossC: 0, workers: 2 });
});

test("a client in memory writes nothing to the store", async ({ page }) => {
  await openHarness(page);
  await page.evaluate((a) => void window.app.make(a as never, { workerFactory: window.app.noStoreWorker() }), { name: "mem2", version: 1, seed });
  await waitStatus(page, "ready");
  await rows(page, "CREATE (:Person {id: 'm'})");
  const dirs = await page.evaluate(async () => {
    try {
      const names: string[] = [];
      for await (const [n] of (await (await navigator.storage.getDirectory()).getDirectoryHandle("relate") as any).entries()) names.push(n);
      return names;
    } catch {
      return [] as string[];
    }
  });
  expect(dirs).not.toContain("app-mem2");
  expect((await page.evaluate(() => window.client!.storage)).kind).toBe("memory");
});

test("two application clients with one name in one page: the second waits on the first", async ({ page }) => {
  await openHarness(page);
  await makeClient(page, { name: "same", version: 1, seed });
  await waitStatus(page, "ready");
  const second = await page.evaluate((a) => {
    const c = window.app.core.createClient({ engineUrl: window.app.engineUrl, navigation: "client-routing", application: a as never });
    (window as unknown as { second: typeof c }).second = c;
    return true;
  }, { name: "same", version: 1, seed });
  expect(second).toBe(true);
  await page.waitForFunction(() => (window as unknown as { second: { storage: { reason?: string } } }).second.storage.reason === "locked", null, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { second: { status: string } }).second.status)).toBe("loading");
  expect((await storage(page)).kind).toBe("durable");
  void count;
  void expect;
});
