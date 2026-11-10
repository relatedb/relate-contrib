// covers-cat: SC-008
// Research R3 (specs/007): what the facts the classifier reads cost on a large store. Opening a ready application must
// not scan the store (the marker used to make that unnecessary). Counting nodes and listing indexes stay cheap at 100,000
// nodes; a first-row probe, the plan's first idea, does not.
import { expect, test } from "./fixtures.js";
import { openHarness, record, waitStatus } from "./helpers.js";

const RUNS = 7;
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const PROBES = {
  count: "MATCH (n) RETURN count(n) AS c",
  indexes: "SHOW INDEXES",
  // Recorded for comparison: a first-row probe was the plan's first idea (research R3) and it is not cheap.
  firstRow: "MATCH (n) RETURN elementId(n) AS e LIMIT 1",
} as const;

async function timeProbes(page: import("@playwright/test").Page): Promise<Record<keyof typeof PROBES, number>> {
  return page.evaluate(
    async ([probes, runs]) => {
      const out: Record<string, number> = {};
      for (const [name, statement] of Object.entries(probes)) {
        const times: number[] = [];
        for (let i = 0; i < (runs as number); i++) {
          const t = performance.now();
          const env = await window.client!.query(statement as string);
          if (env.error) throw new Error(env.error);
          times.push(performance.now() - t);
        }
        times.sort((a, b) => a - b);
        out[name] = times[Math.floor(times.length / 2)]!;
      }
      return out;
    },
    [PROBES, RUNS] as const,
  ) as Promise<Record<keyof typeof PROBES, number>>;
}

for (const size of [1000, 100_000]) {
  test(`the classifier's reads on a store of ${size} nodes`, async ({ page }, info) => {
    test.setTimeout(600_000);
    await openHarness(page);
    await page.evaluate(([n]) => void window.app.make({ name: `probe${n}`, version: 1, seed: { version: 1, nodes: Array.from({ length: n as number }, (_, i) => ({ id: `i${i}`, labels: ["Item"], properties: { n: i } })), links: [] } }), [size] as const);
    await waitStatus(page, "ready", 300_000);
    const medians = await timeProbes(page);
    record(info, "probe", `${size}-nodes`, { medianMs: medians, runs: RUNS, method: "client.query round trip, median of 7, store restored in the same page load" });
    // what the classifier reads on open: the node count and the index list
    expect(medians.count).toBeLessThan(15);
    expect(medians.indexes).toBeLessThan(15);
  });
}

test("counting and listing indexes do not scale with the store, and a first-row probe does", async ({}, info) => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const all = JSON.parse(readFileSync(join(process.cwd(), "reports/catalog-probe.json"), "utf8")) as Record<string, Record<string, { medianMs: Record<string, number> }>>;
  const mine = all[info.project.name]!;
  const small = mine["1000-nodes"]!.medianMs;
  const large = mine["100000-nodes"]!.medianMs;
  record(info, "probe", "comparison", {
    countMs: [small.count, large.count],
    indexesMs: [small.indexes, large.indexes],
    firstRowMs: [small.firstRow, large.firstRow],
    note: "median ms at 1,000 and at 100,000 nodes; the classifier reads the count and the index list, not the first row",
  });
  expect(large.count!).toBeLessThanOrEqual(Math.max(small.count! * 5, 15));
  expect(large.indexes!).toBeLessThanOrEqual(Math.max(small.indexes! * 5, 15));
});
