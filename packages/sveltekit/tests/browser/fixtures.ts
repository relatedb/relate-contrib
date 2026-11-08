// The adapter's browser tests' `test`: Playwright's, except that WebKit runs in a persistent context (its ephemeral context has no
// origin-private file system, which the stored copy of a descriptor needs), with a counter of workers and a hydration check.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { BUILDS } from "../../playwright.config.js";

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";

/** Remove everything at the origin-private root, retrying while a closing worker still holds its files. */
async function clearOpfsAt(context: BrowserContext, origin: string): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(`${origin}/blank.html`);
    for (let attempt = 0; attempt < 25; attempt++) {
      const left = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const names: string[] = [];
        for await (const [name] of (root as any).entries()) names.push(name);
        for (const name of names) await root.removeEntry(name, { recursive: true }).catch(() => undefined);
        let remaining = 0;
        for await (const _ of (root as any).entries()) remaining++;
        return remaining;
      });
      if (left === 0) return;
      await page.waitForTimeout(400);
    }
  } finally {
    await page.close();
  }
}

const ORIGINS = BUILDS.filter((b) => !process.env.REL_ONLY || process.env.REL_ONLY.split(",").includes(b.name)).map((b) => `http://127.0.0.1:${b.port}${b.base ?? ""}`);
const clearOpfs = async (context: BrowserContext): Promise<void> => {
  for (const origin of ORIGINS) await clearOpfsAt(context, origin).catch(() => undefined);
};

export const test = base.extend({
  context: async ({ browser, browserName, playwright, baseURL }, use) => {
    if (browserName !== "webkit") {
      const context = await browser.newContext({ baseURL });
      await use(context);
      await context.close();
      return;
    }
    const profile = mkdtempSync(join(tmpdir(), "relate-webkit-"));
    const context = await playwright.webkit.launchPersistentContext(profile, { baseURL });
    await clearOpfs(context);
    await use(context);
    await Promise.all(context.pages().map((p) => p.close().catch(() => undefined)));
    await clearOpfs(context).catch(() => undefined);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
});

/** Count the workers a page creates and terminates, from the first script on (call before `goto`). */
export async function countWorkers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const state = { created: 0, terminated: 0 };
    (window as any).__workers = state;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.created++;
      }
      terminate(): void {
        state.terminated++;
        super.terminate();
      }
    } as typeof Worker;
  });
}

export const liveWorkers = (page: Page): Promise<number> => page.evaluate(() => (window as any).__workers.created - (window as any).__workers.terminated);

/** Collect console output that signals a hydration problem; assert `[]` at the end of a test. */
export function hydrationProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (m) => /hydrat|mismatch/i.test(m.text()) && problems.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => problems.push(e.message.slice(0, 200)));
  return problems;
}
