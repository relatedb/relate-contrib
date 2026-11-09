// covers-app: FR-025, SC-002
import { expect, test } from "./fixtures.js";
import { makeClient, openHarness, record, rows, waitStatus } from "./helpers.js";

type Page = import("@playwright/test").Page;

const empty = { version: 1, nodes: [], links: [] };
const app = (name: string) => ({ name, version: 1, seed: empty });

/** Start writing one record at a time; `window.acked` counts the writes the page was told succeeded. */
async function startWriting(page: Page, name: string): Promise<void> {
  await openHarness(page);
  await page.evaluate((a) => {
    const w = window as unknown as { acked: number };
    w.acked = 0;
    const client = window.app.make(a as never, { workerFactory: window.app.trackedWorker() });
    void (async () => {
      for (let k = 0; ; k++) {
        await client.query("CREATE (:Item {id: 'i' + toString($k), k: $k})", { k });
        w.acked = k + 1;
      }
    })().catch(() => undefined);
  }, app(name));
  await page.waitForFunction(() => (window as unknown as { acked: number }).acked > 0, null, { timeout: 30_000 });
}

/** The stored items: how many, the highest k, and whether the ks are 0..n-1. */
async function stored(page: Page) {
  const r = await rows(page, "MATCH (i:Item) RETURN count(i) AS n, max(i.k) AS mx");
  const n = r[0]!.n as number;
  return { n, gapFree: n === 0 || (r[0]!.mx as number) === n - 1 };
}

const DELAYS = [300, 500, 800, 1100, 1500];
const results: unknown[] = [];

for (const [i, delay] of DELAYS.entries()) {
  test(`worker ended mid-write, run ${i + 1}: every acknowledged write is present with no gap`, async ({ page }, info) => {
    const name = `durw${i}`;
    await startWriting(page, name);
    await page.waitForTimeout(delay);
    const acked = await page.evaluate(() => {
      const n = (window as unknown as { acked: number }).acked;
      (window as unknown as { workers: Worker[] }).workers.at(-1)!.terminate();
      return n;
    });
    await openHarness(page);
    await makeClient(page, app(name));
    await waitStatus(page, "ready", 60_000);
    const s = await stored(page);
    results.push({ mode: "worker-terminated", delayMs: delay, acknowledged: acked, stored: s.n, extra: s.n - acked, gapFree: s.gapFree });
    expect(s.n).toBeGreaterThanOrEqual(acked);
    expect(s.gapFree).toBe(true);
    record(info, "durability", `worker-terminated-${i + 1}`, { delayMs: delay, acknowledged: acked, stored: s.n, gapFree: s.gapFree });
  });
}

for (const [i, delay] of DELAYS.slice(0, 3).entries()) {
  test(`tab closed mid-write, run ${i + 1}: every acknowledged write is present with no gap`, async ({ context, page }, info) => {
    const name = `durt${i}`;
    await startWriting(page, name);
    await page.waitForTimeout(delay);
    const acked = await page.evaluate(() => (window as unknown as { acked: number }).acked);
    await page.close();
    const next = await context.newPage();
    await openHarness(next);
    await makeClient(next, app(name));
    await waitStatus(next, "ready", 60_000);
    const s = await stored(next);
    expect(s.n).toBeGreaterThanOrEqual(acked);
    expect(s.gapFree).toBe(true);
    record(info, "durability", `tab-closed-${i + 1}`, { delayMs: delay, acknowledged: acked, stored: s.n, gapFree: s.gapFree });
  });
}
void expect;
