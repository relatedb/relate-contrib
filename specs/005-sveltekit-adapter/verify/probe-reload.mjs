import { createRequire } from "node:module";
const require = createRequire("/Users/abk/Developer/akollegger/graph-web/packages/web/package.json");
const { chromium, firefox, webkit } = require("@playwright/test");
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const b = await type.launch(); const p = await b.newPage();
  await p.goto("http://127.0.0.1:5421/inline-a"); await p.waitForFunction(() => document.querySelector("#found")?.textContent !== "…");
  await p.evaluate(() => (window.__marker = 1));
  await p.locator("nav a", { hasText: "InlineB" }).click(); await p.waitForFunction(() => document.querySelector("#found")?.textContent?.includes(":b:"));
  console.log(JSON.stringify({ name, newDocument: await p.evaluate(() => window.__marker === undefined), inlineElements: await p.locator("script[data-relate-graph]").count(), found: (await p.locator("#found").textContent()).slice(0, 12) }));
  await b.close();
}
