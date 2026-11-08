// covers: FR-008, FR-009, FR-033, FR-034, FR-036, SC-004, SC-010
import { expect, test, type Page } from "./fixtures.js";
import { generateGraph, openHarness, serveGraph } from "./helpers.js";

/** Start a client over a 1,000-page graph (served from a URL) with tracked workers, and wait until it is ready. */
async function start(page: Page, options: { pages?: number; issueUrl?: string } = {}): Promise<void> {
  const graph = generateGraph(options.pages ?? 1000, { id: "faults", dataUrl: "/data/faults.json" });
  await serveGraph(page, graph);
  await page.evaluate(async ([descriptor, issueUrl]) => {
    const rel = (window as any).rel;
    const tracked = rel.faults.trackedWorkers();
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { descriptor }, navigation: "client-routing", workerFactory: tracked.factory, issueUrl });
    const w = window as any;
    w.client = client;
    w.tracked = tracked;
    w.replaced = [];
    w.updates = [];
    w.statuses = [];
    client.on("replaced", (e: unknown) => w.replaced.push(e));
    client.on("status", (e: { status: string }) => w.statuses.push(e.status));
    client.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u: unknown) => w.updates.push(u));
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
    w.timeOrigin = performance.timeOrigin;
  }, [graph.descriptor, options.issueUrl] as const);
}

const waitForGeneration = (page: Page, n: number) =>
  page.waitForFunction((g) => (window as any).client.generation === g && (window as any).client.status === "ready", n);

const readyUpdates = (page: Page) =>
  page.evaluate(() => (window as any).updates.filter((u: { rows: unknown }) => u.rows).map((u: { generation: number; rows: unknown }) => [u.generation, u.rows]));

test("an engine that has trapped answers every later call as a trap without running it", async ({ page }) => {
  await page.goto("/engine.html");
  await page.waitForFunction(() => document.documentElement.dataset.ready === "1");
  const trap = await page.evaluate(() => window.rpc("query", { statement: `RETURN ${"(".repeat(1000)}1${")".repeat(1000)} AS x` }));
  expect(trap).toMatchObject({ ok: false, reason: "trap" });
  const later = await page.evaluate(() => window.rpc("query", { statement: "RETURN 1 AS n" }));
  expect(later).toMatchObject({ ok: false, reason: "trap", message: "the instance is unusable after a trap" });
});

test("a trap replaces the worker, increases the generation and re-runs subscriptions without a page reload", async ({ page }) => {
  await openHarness(page);
  await start(page);
  const outcome = await page.evaluate(async () => {
    const w = window as any;
    const reason = await w.client.query(w.rel.faults.trapStatement()).then(() => "resolved", (e: { reason: string }) => e.reason);
    return { reason };
  });
  expect(outcome.reason).toBe("trap");
  await waitForGeneration(page, 2);
  expect(await readyUpdates(page)).toEqual([
    [1, [{ c: 1000 }]],
    [2, [{ c: 1000 }]],
  ]);
  const state = await page.evaluate(() => ({ workers: (window as any).tracked.workers.length, replaced: (window as any).replaced, sameDocument: (window as any).timeOrigin === performance.timeOrigin, statuses: (window as any).statuses }));
  expect(state.workers).toBe(2);
  expect(state.replaced).toEqual([{ reason: "trap", generation: 2 }]);
  expect(state.sameDocument).toBe(true);
  expect(state.statuses).toEqual(["ready", "recovering", "ready"]);
});

test("a statement that exceeds its timeout rejects with `timeout` and the worker is replaced", async ({ page }) => {
  await openHarness(page);
  await start(page);
  const reason = await page.evaluate(async () => {
    const w = window as any;
    return w.client.query(w.rel.faults.runawayStatement, null, { timeoutMs: 500 }).then(() => "resolved", (e: { reason: string }) => e.reason);
  });
  expect(reason).toBe("timeout");
  await waitForGeneration(page, 2);
  expect(await page.evaluate(() => (window as any).replaced)).toEqual([{ reason: "timeout", generation: 2 }]);
  expect(await readyUpdates(page)).toHaveLength(2);
});

test("a call in flight when the instance is replaced rejects with `lost`, and a worker error replaces the worker", async ({ page }) => {
  await openHarness(page);
  await start(page);
  const reason = await page.evaluate(async () => {
    const w = window as any;
    const inFlight = w.client.query(w.rel.faults.runawayStatement).then(() => "resolved", (e: { reason: string }) => e.reason);
    await new Promise((r) => setTimeout(r, 100));
    w.tracked.failLatest("injected");
    return inFlight;
  });
  expect(reason).toBe("lost");
  await waitForGeneration(page, 2);
  expect(await page.evaluate(() => (window as any).replaced)).toEqual([{ reason: "worker-error", generation: 2 }]);
  expect(await readyUpdates(page)).toEqual([
    [1, [{ c: 1000 }]],
    [2, [{ c: 1000 }]],
  ]);
});

test("recovery completes within the load time plus one second", async ({ page }) => {
  await openHarness(page);
  await start(page);
  const timing = await page.evaluate(async () => {
    const w = window as any;
    const t0 = performance.now();
    w.tracked.failLatest("injected");
    await new Promise<void>((resolve) => w.client.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
    await new Promise((r) => setTimeout(r, 0));
    return performance.now() - t0;
  });
  // The first load of a 1,000-page graph takes a few hundred milliseconds; allow that plus the one second.
  expect(timing).toBeLessThan(1000 + 1500);
});

test("a graph that can never load ends in `failed` after exactly three attempts, with links usable and wording shown", async ({ page }) => {
  await openHarness(page);
  await page.route("**/data/unreachable-missing.json", (route) => route.fulfill({ status: 404, body: "no" }));
  const result = await page.evaluate(async () => {
    const rel = (window as any).rel;
    const tracked = rel.faults.trackedWorkers();
    const client = rel.core.createClient({
      engineUrl: rel.engineUrl,
      graph: { descriptor: rel.faults.unreachableDescriptor() },
      navigation: "client-routing",
      workerFactory: tracked.factory,
      issueUrl: "https://example.org/issues",
    });
    (window as any).client = client;
    (window as any).tracked = tracked;
    const seen: string[] = [];
    client.on("status", (e: { status: string }) => seen.push(e.status));
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "failed" && resolve()));
    const rejected = await client.query("RETURN 1").then(() => "resolved", (e: { reason: string }) => e.reason);
    return { seen, workers: tracked.workers.length, diagnostic: client.diagnostic, message: client.failureMessage(), rejected };
  });
  expect(result.workers).toBe(3);
  expect(result.seen).toEqual(["recovering", "failed"]);
  expect(result.diagnostic).toMatchObject({ reason: "worker-error", failures: 3 });
  expect(result.message).toContain("3 attempts");
  expect(result.message).toContain("https://example.org/issues");
  expect(result.rejected).toBe("failed");
  await expect(page.locator("#to-other")).toBeVisible();
  await page.click("#to-other");
  await expect(page).toHaveURL(/other\.html$/);
});

test("`retry` starts a fresh attempt with the failure count back at zero", async ({ page }) => {
  await openHarness(page);
  await page.route("**/data/unreachable-missing.json", (route) => route.fulfill({ status: 404, body: "no" }));
  const result = await page.evaluate(async () => {
    const rel = (window as any).rel;
    const tracked = rel.faults.trackedWorkers();
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { descriptor: rel.faults.unreachableDescriptor() }, navigation: "client-routing", workerFactory: tracked.factory });
    const failed = () => new Promise<void>((resolve) => { const off = client.on("status", (e: { status: string }) => { if (e.status === "failed") { off(); resolve(); } }); });
    await failed();
    const before = tracked.workers.length;
    const again = failed();
    client.retry();
    const statusAfterRetry = client.status;
    await again;
    return { before, after: tracked.workers.length, statusAfterRetry, failures: client.diagnostic.failures };
  });
  expect(result.before).toBe(3);
  expect(result.statusAfterRetry).toBe("loading");
  expect(result.after).toBe(6);
  expect(result.failures).toBe(3);
});

test("a fault from ready is not itself a failed attempt: three failing replacements follow it", async ({ page }) => {
  await openHarness(page);
  await start(page);
  // After the first load succeeded, the data stops being available: every replacement fails.
  await page.unroute("**/data/faults.json");
  await page.route("**/data/faults.json", (route) => route.fulfill({ status: 500, body: "down" }));
  await page.evaluate(() => (window as any).tracked.failLatest("injected"));
  await page.waitForFunction(() => (window as any).client.status === "failed");
  const state = await page.evaluate(() => ({ workers: (window as any).tracked.workers.length, diagnostic: (window as any).client.diagnostic }));
  expect(state.workers).toBe(1 + 3);
  expect(state.diagnostic.failures).toBe(3);
});

test("the failure wording suggests reporting an issue and sends nothing", async ({ page }) => {
  await openHarness(page);
  await page.route("**/data/unreachable-missing.json", (route) => route.fulfill({ status: 404, body: "no" }));
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.evaluate(async () => {
    const rel = (window as any).rel;
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { descriptor: rel.faults.unreachableDescriptor() }, navigation: "client-routing", issueUrl: "https://example.org/issues" });
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "failed" && resolve()));
    (window as any).message = client.failureMessage();
  });
  expect(await page.evaluate(() => (window as any).message)).toMatch(/report this as an issue at https:\/\/example\.org\/issues/);
  expect(requests.filter((u) => u.includes("example.org"))).toEqual([]);
});
