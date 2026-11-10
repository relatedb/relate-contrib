import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { generateGraph, type GeneratedGraph } from "../fixtures/generate-graph.js";

/** Open a harness page and wait for the core to be exposed on `window.rel`. */
export async function openHarness(page: Page, path = "/index.html"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.dataset.harness === "ready");
}

/** The graph `site.html` generates for these parameters (it is deterministic, so a test can serve the same data). */
export function siteGraph(pages: number, id = "site", revision = `rev-${pages}`): GeneratedGraph {
  return generateGraph(pages, { id, revision, dataUrl: `/data/${id}.json` });
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
 * a key is recorded; later runs fail when a time is more than twice its baseline. REL_UPDATE_BASELINE=1 rewrites.
 */
export function checkBaseline(browser: string, key: string, ms: number): { baseline: number | null; recorded: boolean } {
  mkdirSync(baselineDir, { recursive: true });
  const env = process.env.REL_ENV ?? "local";
  const file = join(baselineDir, `${browser}-${env}.json`);
  const data: Record<string, number> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  if (data[key] === undefined || process.env.REL_UPDATE_BASELINE === "1") {
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

// ---- the harness site ---------------------------------------------------------------------------------------
export interface Visit {
  pages?: number;
  id?: string;
  revision?: string;
  navigation?: "client-routing" | "multi-page";
  store?: boolean;
  graph?: "descriptor" | "document";
  /** The data document is requested but never answered (an interrupted load). */
  hang?: boolean;
  page?: number;
}

/** Open `site.html` with a data document served for the descriptor, and wait for the client to settle. */
export async function visitSite(page: Page, v: Visit = {}): Promise<{ dataRequests: string[] }> {
  const pages = v.pages ?? 300;
  const id = v.id ?? "site";
  const revision = v.revision ?? `rev-${pages}`;
  const graph = siteGraph(pages, id, revision);
  const dataRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(`/data/${id}.json`)) dataRequests.push(r.url());
  });
  await page.route(`**/data/${id}.json`, (route) => {
    if (v.hang) return; // never answered
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(graph.document) });
  });
  const q = new URLSearchParams({ pages: String(pages), id, revision, navigation: v.navigation ?? "multi-page", graph: v.graph ?? "descriptor" });
  if (v.store !== undefined) q.set("store", v.store ? "1" : "0");
  if (v.page !== undefined) q.set("page", String(v.page));
  await page.goto(`/site.html?${q}`);
  await page.waitForFunction(() => document.documentElement.dataset.site === "ready");
  if (!v.hang) await page.waitForFunction(() => ["ready", "failed"].includes((window as any).client.status), undefined, { timeout: 60_000 });
  return { dataRequests };
}

export const query = async (page: Page, statement: string): Promise<any[]> =>
  page.evaluate(async (s) => (await (window as any).client.query(s)).rows, statement);

/** Whether the last start-up restored the graph from a store. */
export const restored = (page: Page): Promise<boolean | null> =>
  page.evaluate(() => (window as any).timings.find((t: { phase: string }) => t.phase === "total")?.restored ?? null);

/** A graph's entry in the catalog (`relate-web/catalog.json`), read from the origin-private file system on the page's main thread; null when there is none. */
export const catalogEntry = (page: Page, store: string): Promise<any | null> =>
  page.evaluate(async (name) => {
    try {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle("relate-web");
      const file = JSON.parse(await (await (await dir.getFileHandle("catalog.json")).getFile()).text());
      return file.graphs[name] ?? null;
    } catch {
      return null;
    }
  }, store);

/** Entries at the origin-private root (to see whether a store or a catalog exists at all). */
export const opfsRoot = (page: Page): Promise<string[]> =>
  page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const names: string[] = [];
    for await (const [name] of (root as any).entries()) names.push(name);
    return names.sort();
  });
