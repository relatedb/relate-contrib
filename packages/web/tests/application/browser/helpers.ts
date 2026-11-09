import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";

export const seed = {
  version: 1,
  nodes: [
    { id: "a", labels: ["Person"], properties: { name: "Ada", n: 1 } },
    { id: "b", labels: ["Person"], properties: { name: "Bo", n: 2 } },
    { id: "c", labels: ["Person"], properties: { name: "Cy", n: 3 } },
  ],
  links: [{ source: "a", target: "b", type: "KNOWS" }],
};

/** Open a harness page and wait for the core to be exposed on `window.app`. */
export async function openHarness(page: Page, path = "/index.html"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.dataset.harness === "ready");
}

/** Create an application client on the page (kept as `window.client`). */
export async function makeClient(page: Page, application: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(([a, x]) => void window.app.make(a as never, x as never), [application, extra] as const);
}

export const status = (page: Page): Promise<string> => page.evaluate(() => window.client!.status);
export const storage = (page: Page) => page.evaluate(() => window.client!.storage);
export const diagnostic = (page: Page) => page.evaluate(() => window.client!.diagnostic);

export async function waitStatus(page: Page, wanted: string, timeout = 30_000): Promise<void> {
  await page.waitForFunction((w) => window.client!.status === w, wanted, { timeout });
}

/** Run a statement through the client and return the rows (an engine error throws). */
export async function rows(page: Page, statement: string, params: object | null = null): Promise<Array<Record<string, any>>> {
  return page.evaluate(
    async ([s, p]) => {
      const env = await window.client!.query(s as string, p as never);
      if (env.error) throw new Error(env.error);
      return env.rows;
    },
    [statement, params] as const,
  );
}

export async function count(page: Page, statement: string): Promise<number> {
  const r = await rows(page, statement);
  return Object.values(r[0] ?? {})[0] as number;
}

/** A fresh application client on a fresh page load, ready. */
export async function openReady(page: Page, application: Record<string, unknown>, path = "/index.html", extra: Record<string, unknown> = {}): Promise<void> {
  await openHarness(page, path);
  await makeClient(page, application, extra);
  await waitStatus(page, "ready");
}

/** A three-way cartesian count over 1,000 nodes runs far longer than any timeout the tests use (as the core's faults harness does). */
export const RUNAWAY = "MATCH (a:Bulk), (b:Bulk), (c:Bulk) RETURN count(*) AS c";
export const makeBulk = (page: Page): Promise<unknown> =>
  rows(page, "UNWIND range(1, 1000) AS i CREATE (:Bulk {id: 'b' + toString(i)})");

export { expect };

/** A seed document of `n` Item nodes numbered 0..n-1, built in the page. */
export const itemSeed = (n: number) => ({
  version: 1,
  nodes: Array.from({ length: n }, (_, i) => ({ id: `i${i}`, labels: ["Item"], properties: { n: i } })),
  links: [],
});

/** Merge `data` into `reports/application-<name>.json` under this browser's name (single worker, so no race). */
export function record(info: TestInfo, name: string, key: string, data: unknown): void {
  const dir = join(process.cwd(), "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `application-${name}.json`);
  const all = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, unknown>>) : {};
  const browser = info.project.name;
  all[browser] = { ...(all[browser] ?? {}), [key]: data, environment: `${browser}, single run, one machine, ${new Date().toISOString().slice(0, 10)}` };
  writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
}
