// The adapter's browser tests' `test`: identical to Playwright's, except that WebKit runs in a persistent context. In
// WebKit's default (ephemeral) context the origin-private file system is unavailable, and the engine's store and
// the stored copy of a descriptor both need it. A persistent context is a normal browser profile on disk.
//
// Playwright's WebKit keeps origin-private data outside the profile directory it is given, so data would leak
// from one test (and one run) to the next. The origin-private root is therefore emptied before and after each
// WebKit test.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base, type BrowserContext } from "@playwright/test";
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
        for (const name of names) {
          try {
            await root.removeEntry(name, { recursive: true });
          } catch {
            /* still held; try again */
          }
        }
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

/** The conformance site is served on one origin per build; each has its own origin-private file system. */
const ORIGINS = BUILDS.filter((b) => !process.env.GW_ONLY || process.env.GW_ONLY.split(",").includes(b.name)).map((b) => `http://127.0.0.1:${b.port}${b.base ?? ""}`);

const clearOpfs = async (context: BrowserContext, _baseURL: string | undefined): Promise<void> => {
  for (const origin of ORIGINS) await clearOpfsAt(context, origin);
};

export const test = base.extend({
  context: async ({ browser, browserName, playwright, baseURL }, use) => {
    if (browserName !== "webkit") {
      const context = await browser.newContext({ baseURL });
      await use(context);
      await context.close();
      return;
    }
    const profile = mkdtempSync(join(tmpdir(), "related-web-webkit-"));
    const context = await playwright.webkit.launchPersistentContext(profile, { baseURL });
    await clearOpfs(context, baseURL);
    await use(context);
    await Promise.all(context.pages().map((p) => p.close().catch(() => undefined)));
    await clearOpfs(context, baseURL).catch(() => undefined);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
});
