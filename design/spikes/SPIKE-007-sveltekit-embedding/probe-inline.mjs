// Inline graphs across client-side navigation, and the published graph files: node probe-inline.mjs <baseUrl> <base>
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../packages/web/package.json", import.meta.url));
const { chromium, firefox, webkit } = require("@playwright/test");
const [, , origin, base = ""] = process.argv;
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await type.launch();
  const page = await browser.newPage();
  const out = { browser: name };
  try {
    await page.goto(`${origin}${base}/inline-a`);
    await page.waitForFunction(() => document.querySelector("#found")?.textContent !== "…");
    out.first = await page.locator("#found").textContent();
    out.scriptsFirst = await page.locator("script[data-relate-graph]").count();
    await page.locator("nav a", { hasText: "InlineB" }).click();
    await page.waitForFunction(() => document.querySelector("#found")?.textContent?.includes(":b:"));
    out.afterNav = await page.locator("#found").textContent();
    out.scriptsAfter = await page.locator("script[data-relate-graph]").count();
    await page.goBack();
    await page.waitForFunction(() => document.querySelector("#found")?.textContent?.includes(":a:"));
    out.afterBack = await page.locator("script[data-relate-graph]").count();
    const d = await (await page.request.get(`${origin}${base}/relate/example/descriptor.json`)).json();
    out.descriptor = d.data;
    out.dataStatus = (await page.request.get(origin + (base && !d.data.url.startsWith(base) ? base : "") + d.data.url)).status();
    out.missing = (await page.request.get(`${origin}${base}/relate/example/graph.000000000000.json`)).status();
  } catch (e) { out.error = String(e).slice(0, 200); }
  console.log(JSON.stringify(out));
  await browser.close();
}
