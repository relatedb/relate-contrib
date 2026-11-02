// covers: FR-030, FR-031, SC-001, SC-002
import { expect, test } from "@playwright/test";
import { checkBaseline, generateGraph, openHarness, serveGraph } from "./helpers.js";

// The page's longest unresponsive interval while a large graph loads is a hard gate; load times are recorded and
// held to twice their baseline (FR-031). Figures from one run in one environment are labeled as such.

async function loadInPage(page: import("@playwright/test").Page, descriptor: unknown): Promise<{ maxGapMs: number; totalMs: number; restored: boolean }> {
  return page.evaluate(async (d) => {
    const gw = (window as any).gw;
    const gaps: number[] = [];
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }, 4);
    const client = gw.core.createClient({ engineUrl: gw.engineUrl, graph: { descriptor: d }, navigation: "client-routing" });
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
  test(`${pages} pages: the page stays responsive and the load time is recorded`, async ({ page }, info) => {
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
