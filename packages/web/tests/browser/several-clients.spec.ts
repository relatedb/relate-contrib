// covers: FR-035
import { expect, test } from "./fixtures.js";
import { generateGraph, openHarness, serveGraph } from "./helpers.js";

test("two clients on one page have separate workers, generations and status; one client's crash leaves the other alone", async ({ page }) => {
  await openHarness(page);
  const a = generateGraph(200, { id: "client-a", dataUrl: "/data/client-a.json" });
  const b = generateGraph(300, { id: "client-b", dataUrl: "/data/client-b.json" });
  await serveGraph(page, a);
  await serveGraph(page, b);
  const result = await page.evaluate(async ([da, db]) => {
    const rel = (window as any).rel;
    const ta = rel.faults.trackedWorkers();
    const tb = rel.faults.trackedWorkers();
    const make = (descriptor: unknown, tracked: { factory: () => Worker }) =>
      rel.core.createClient({ engineUrl: rel.engineUrl, graph: { descriptor }, navigation: "client-routing", workerFactory: tracked.factory });
    const ca = make(da, ta);
    const cb = make(db, tb);
    const ready = (c: any) => new Promise<void>((resolve) => c.on("status", (e: { status: string }) => e.status === "ready" && resolve()));
    await Promise.all([ready(ca), ready(cb)]);
    const countsBefore = [(await ca.query("MATCH (n) RETURN count(n) AS c")).rows[0].c, (await cb.query("MATCH (n) RETURN count(n) AS c")).rows[0].c];
    const reason = await ca.query(rel.faults.trapStatement()).then(() => "resolved", (e: { reason: string }) => e.reason);
    await new Promise<void>((resolve) => { const off = ca.on("status", (e: { status: string }) => { if (e.status === "ready") { off(); resolve(); } }); });
    return {
      countsBefore,
      reason,
      a: { generation: ca.generation, workers: ta.workers.length },
      b: { generation: cb.generation, workers: tb.workers.length, status: cb.status, count: (await cb.query("MATCH (n) RETURN count(n) AS c")).rows[0].c },
    };
  }, [a.descriptor, b.descriptor] as const);
  expect(result.countsBefore).toEqual([200, 300]);
  expect(result.reason).toBe("trap");
  expect(result.a).toEqual({ generation: 2, workers: 2 });
  expect(result.b).toEqual({ generation: 1, workers: 1, status: "ready", count: 300 });
});
