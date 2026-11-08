// Shared helpers: start the server, launch a browser (WebKit in a persistent profile, as the core's tests do), page helpers.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "./serve.mjs";

const require = createRequire("/Users/abk/Developer/akollegger/graph-web/packages/web/package.json");
export const pw = require("@playwright/test");
export const PORT = Number(process.env.SPIKE_PORT ?? 5590);
export const BASE = `http://127.0.0.1:${PORT}/`;

export async function launch(name) {
  const type = pw[name];
  if (name === "webkit") {
    const dir = mkdtempSync(join(tmpdir(), "spike008-"));
    const context = await type.launchPersistentContext(dir, {});
    return { context, close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }); } };
  }
  const browser = await type.launch();
  const context = await browser.newContext();
  return { context, close: async () => { await context.close(); await browser.close(); } };
}

export async function openPage(context) {
  const page = await context.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => window.ready === true);
  return page;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { serve };
