// covers-app: FR-025, SC-007
import { generateGraph } from "../../fixtures/generate-graph.js";
import { expect, test } from "./fixtures.js";
import { openHarness, record } from "./helpers.js";

const SIZES = [1000, 5000, 20_000];
const RUNS = 5;
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

type Kind = "application" | "content";

/** Open the graph on a fresh page load and return the core's `total` timing and whether it restored. */
async function visit(page: import("@playwright/test").Page, kind: Kind, descriptor: unknown): Promise<{ total: number; restored: boolean }> {
  await openHarness(page);
  return page.evaluate(
    ([k, d]) =>
      new Promise<{ total: number; restored: boolean }>((resolve) => {
        const base = { engineUrl: window.app.engineUrl };
        const client =
          k === "application"
            ? window.app.core.createClient({ ...base, navigation: "client-routing", application: { name: "restore", version: 1, seed: d as never } })
            : window.app.core.createClient({ ...base, navigation: "multi-page", graph: { descriptor: d as never } });
        client.on("timing", (t) => {
          if (t.phase === "total") resolve({ total: t.ms, restored: t.restored });
        });
      }),
    [kind, descriptor] as const,
  );
}

for (const size of SIZES) {
  test(`restoring an application store takes no longer than a content store of the same size (${size} nodes)`, async ({ page }, info) => {
    test.setTimeout(300_000);
    const g = generateGraph(size, { id: `rest${size}`, revision: "r1", dataUrl: `/data/rest${size}.json` });
    await page.route(`**/data/rest${size}.json`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(g.document) }));
    const medians: Record<string, number> = {};
    const runs: Record<string, number[]> = {};
    for (const kind of ["application", "content"] as Kind[]) {
      const descriptor = kind === "application" ? { ...g.descriptor, id: `app${size}` } : g.descriptor;
      const first = await visit(page, kind, descriptor);
      expect(first.restored).toBe(false);
      const times: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        await page.waitForTimeout(600); // the previous page's worker releases the store
        const v = await visit(page, kind, descriptor);
        expect(v.restored).toBe(true);
        times.push(v.total);
      }
      runs[kind] = times;
      medians[kind] = median(times);
      runs[`${kind}-first-load`] = [first.total];
    }
    record(info, "restore", `${size}-nodes`, { medianMs: medians, runsMs: runs, method: "5 reloads each after the first load; 'total' timing of the core; same generated graph via a descriptor" });
    // a tolerance for run-to-run noise: 25 % of the content store's median, and never less than 100 ms
    const allowed = medians.content! + Math.max(100, medians.content! * 0.25);
    expect(medians.application!).toBeLessThanOrEqual(allowed);
  });
}
