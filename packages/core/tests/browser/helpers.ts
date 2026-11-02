import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { generateGraph, type GeneratedGraph } from "../fixtures/generate-graph.js";

/** Open a harness page and wait for the core to be exposed on `window.gw`. */
export async function openHarness(page: Page, path = "/index.html"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.dataset.harness === "ready");
}

/** Serve a generated graph's data document at its descriptor's `data.url`. */
export async function serveGraph(page: Page, graph: GeneratedGraph): Promise<void> {
  const body = JSON.stringify(graph.document);
  await page.route(`**${graph.descriptor.data.url}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body }),
  );
}

export { generateGraph };

// ---- load-time baselines (FR-031) -------------------------------------------------------------------------------
const baselineDir = join(import.meta.dirname, "../baselines");

/**
 * Compare a measured time with the baseline recorded for this browser and environment. The first measurement for
 * a key is recorded; later runs fail when a time is more than twice its baseline. GW_UPDATE_BASELINE=1 rewrites.
 */
export function checkBaseline(browser: string, key: string, ms: number): { baseline: number | null; recorded: boolean } {
  mkdirSync(baselineDir, { recursive: true });
  const env = process.env.GW_ENV ?? "local";
  const file = join(baselineDir, `${browser}-${env}.json`);
  const data: Record<string, number> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (data[key] === undefined || process.env.GW_UPDATE_BASELINE === "1") {
    data[key] = Math.round(ms);
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    return { baseline: null, recorded: true };
  }
  expect(ms, `${key} took ${Math.round(ms)} ms, more than twice its baseline of ${data[key]} ms`).toBeLessThanOrEqual(2 * data[key]!);
  return { baseline: data[key]!, recorded: false };
}

/** All files under a directory. */
export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
