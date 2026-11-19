// covers: FR-030, FR-031, SC-001, SC-002, SC-003
import { expect, test } from "./fixtures.js";
import { checkBaseline, generateGraph, openHarness, restored, serveGraph, visitSite } from "./helpers.js";

// The page's longest unresponsive interval while a large graph loads is a hard gate; load times are recorded and
// held to twice their baseline (FR-031). These tests are tagged @perf: the performance workflow runs them, and neither the full
// suite nor a release waits for them (ADR-013 2.6, amended). Figures from one run in one environment are labeled as such.

async function loadInPage(page: import("@playwright/test").Page, descriptor: unknown): Promise<{ maxGapMs: number; totalMs: number; restored: boolean }> {
  return page.evaluate(async (d) => {
    const rel = (window as any).rel;
    const gaps: number[] = [];
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }, 4);
    const client = rel.core.createClient({ engineUrl: rel.engineUrl, graph: { descriptor: d }, navigation: "client-routing" });
    const timing = new Promise<{ ms: number; restored: boolean }>((resolve) =>
      client.on("timing", (t: { phase: string; ms: number; restored: boolean }) => t.phase === "total" && resolve({ ms: t.ms, restored: t.restored })),
    );
    await new Promise<void>((resolve) => client.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
    const t = await timing;
    clearInterval(timer);
    return { maxGapMs: Math.max(0, ...gaps), totalMs: t.ms, restored: t.restored };
  }, descriptor);
}

for (const pages of [5000, 20000]) {
  test(`@perf ${pages} pages: the page stays responsive and the load time is recorded`, async ({ page }, info) => {
    const graph = generateGraph(pages, { id: `timing-${pages}`, dataUrl: `/data/timing-${pages}.json` });
    await openHarness(page);
    await serveGraph(page, graph);
    const r = await loadInPage(page, graph.descriptor);
    expect(r.restored).toBe(false);
    const { baseline, recorded } = checkBaseline(info.project.name, `load-${pages}`, r.totalMs);
    info.annotations.push({ type: "single run", description: `${pages} pages: ready in ${Math.round(r.totalMs)} ms, longest page gap ${r.maxGapMs.toFixed(1)} ms (baseline ${baseline ?? "recorded now"}${recorded ? "" : ""})` });
    if (pages === 20000) expect(r.maxGapMs, "the page was unresponsive for too long during the load").toBeLessThan(50);
  });
}

test("@perf 5000 pages: a restore from the store is ready quickly, with no request for the data", async ({ page, context }, info) => {
  const first = await visitSite(page, { id: "restore-time", pages: 5000, revision: "r1" });
  expect(first.dataRequests).toHaveLength(1);
  await page.close();
  const next = await context.newPage();
  const second = await visitSite(next, { id: "restore-time", pages: 5000, revision: "r1" });
  expect(second.dataRequests).toHaveLength(0);
  expect(await restored(next)).toBe(true);
  const ms = await next.evaluate(() => (window as any).timings.find((t: { phase: string }) => t.phase === "total").ms as number);
  const { baseline } = checkBaseline(info.project.name, "restore-5000", ms);
  info.annotations.push({ type: "single run", description: `5000 pages restored in ${Math.round(ms)} ms (baseline ${baseline ?? "recorded now"}; target 550 ms)` });
});
