// Records load figures for an inline graph and a registered graph of the same document (research R-10). The figures are
// not a gate: they are the evidence a later decision can use for the size above which a graph should be registered
// instead. Each cell is three cold loads (a fresh browser context, so no stored copy), reported as the median, in the
// core's own `total` timing. One environment; not measured in WebKit.
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";

const base = "http://127.0.0.1:5180";
const sizes = [20, 300, 2000];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

test("@figures load figures for inline and registered graphs", async ({ browser, browserName }) => {
  test.skip(browserName === "webkit", "WebKit needs a persistent profile for the store; not measured");
  test.setTimeout(300_000);
  const figures: Record<string, Record<string, number>> = {};
  for (const kind of ["inline", "registered"]) {
    for (const size of sizes) {
      const runs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${base}/figures/${kind}-${size}.html`);
        await page.waitForFunction(() => document.querySelector("[data-figure-total]")?.textContent !== "…", undefined, { timeout: 120_000 });
        runs.push(Number(await page.locator("[data-figure-total]").textContent()));
        await context.close();
      }
      (figures[`${kind}`] ??= {})[String(size)] = median(runs);
    }
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync(`reports/figures-${browserName}.json`, JSON.stringify({ browserName, unit: "ms, median of 3 cold loads", figures }, null, 2));
  console.log(browserName, JSON.stringify(figures));
});
