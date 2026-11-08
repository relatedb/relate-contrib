// The adapter's browser tests' `test`: Playwright's, except that WebKit runs in a persistent context (its ephemeral context has
// no origin-private file system, which the stored copy of a descriptor graph needs), and with helpers for what a cell does.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { SITE } from "../../playwright.config.js";

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";
export const origin = SITE.origin;

/** Remove everything at the origin-private root, retrying while a closing worker still holds its files. */
async function clearOpfs(context: BrowserContext): Promise<void> {
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

/** Workers created minus workers terminated, by the page's own code. */
export const liveWorkers = (page: Page): Promise<number> => page.evaluate(() => (window as any).__workers.created - (window as any).__workers.terminated);

/** Fail on any cell error shown in the page (Framework prints cell errors in the page, not in the build; research V-5). */
export async function expectNoCellErrors(page: Page): Promise<void> {
  const errors = await page.locator(".observablehq--error").allTextContents();
  expect(errors).toEqual([]);
}
