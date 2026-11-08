// covers: FR-010, FR-011
import { expect, test, type Page } from "./fixtures.js";
import { generateGraph, openHarness, serveGraph } from "./helpers.js";

async function start(page: Page, visitorTimeoutMs = 500): Promise<void> {
  const graph = generateGraph(1000, { id: "visitor", dataUrl: "/data/visitor.json" });
  await serveGraph(page, graph);
  await page.evaluate(async ([descriptor, timeout]) => {
    const w = window as any;
    const tracked = w.rel.faults.trackedWorkers();
    const client = w.rel.core.createClient({ engineUrl: w.rel.engineUrl, graph: { descriptor }, navigation: "client-routing", workerFactory: tracked.factory, visitorTimeoutMs: timeout });
    w.client = client;
    w.tracked = tracked;
    w.replaced = [];
    w.updates = [];
    client.on("replaced", (e: unknown) => w.replaced.push(e));
    client.subscribe("MATCH (n:Page) RETURN count(n) AS c", null, (u: unknown) => w.updates.push(u));
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
  }, [graph.descriptor, visitorTimeoutMs] as const);
}

const generation = (page: Page, n: number) =>
  page.waitForFunction((g) => (window as any).client.generation === g && (window as any).client.status === "ready", n);

test("a visitor statement gets the default timeout, fails with `timeout`, and the graph returns", async ({ page }) => {
  await openHarness(page);
  await start(page, 500);
  const reason = await page.evaluate(() => {
    const w = window as any;
    return w.client.run(w.rel.faults.runawayStatement).result.then(() => "resolved", (e: { reason: string }) => e.reason);
  });
  expect(reason).toBe("timeout");
  await generation(page, 2);
  expect(await page.evaluate(() => (window as any).replaced)).toEqual([{ reason: "timeout", generation: 2 }]);
  expect(await page.evaluate(() => (window as any).client.query("MATCH (n:Page) RETURN count(n) AS c").then((r: { rows: unknown }) => r.rows))).toEqual([{ c: 1000 }]);
});

test("stop() fails the call with `stopped`, replaces the instance and re-runs the page's subscriptions", async ({ page }) => {
  await openHarness(page);
  await start(page, 60_000);
  const reason = await page.evaluate(async () => {
    const w = window as any;
    const run = w.client.run(w.rel.faults.runawayStatement);
    await new Promise((r) => setTimeout(r, 200));
    run.stop();
    return run.result.then(() => "resolved", (e: { reason: string }) => e.reason);
  });
  expect(reason).toBe("stopped");
  await generation(page, 2);
  expect(await page.evaluate(() => (window as any).replaced)).toEqual([{ reason: "stopped", generation: 2 }]);
  const readyUpdates = await page.evaluate(() => (window as any).updates.filter((u: { rows: unknown }) => u.rows).map((u: { generation: number }) => u.generation));
  expect(readyUpdates).toEqual([1, 2]);
});

test("a statement that finishes resolves, and stopping it afterwards changes nothing", async ({ page }) => {
  await openHarness(page);
  await start(page);
  const result = await page.evaluate(async () => {
    const w = window as any;
    const run = w.client.run("RETURN 1 AS n");
    const envelope = await run.result;
    run.stop();
    await new Promise((r) => setTimeout(r, 300));
    return { rows: envelope.rows, generation: w.client.generation, replaced: w.replaced.length };
  });
  expect(result).toEqual({ rows: [{ n: 1 }], generation: 1, replaced: 0 });
});

test("a statement the page ships through query() is not given the visitor timeout", async ({ page }) => {
  await openHarness(page);
  await start(page, 300);
  const outcome = await page.evaluate(async () => {
    const w = window as any;
    let settled = false;
    void w.client.query(w.rel.faults.runawayStatement).then(() => (settled = true), () => (settled = true));
    await new Promise((r) => setTimeout(r, 1500));
    return { settled, generation: w.client.generation };
  });
  expect(outcome).toEqual({ settled: false, generation: 1 });
});

test("no statement runs on the main thread: the main thread never instantiates the engine", async ({ page }) => {
  await openHarness(page);
  await page.evaluate(() => {
    const w = window as any;
    w.instantiations = 0;
    for (const name of ["instantiate", "instantiateStreaming", "compile", "compileStreaming"] as const) {
      const original = (WebAssembly as any)[name]?.bind(WebAssembly);
      if (original) (WebAssembly as any)[name] = (...args: unknown[]) => (w.instantiations++, original(...args));
    }
  });
  await start(page);
  const out = await page.evaluate(async () => {
    const w = window as any;
    const rows = (await w.client.run("RETURN 1 AS n").result).rows;
    return { rows, instantiations: w.instantiations };
  });
  expect(out.rows).toEqual([{ n: 1 }]);
  expect(out.instantiations).toBe(0);
});
