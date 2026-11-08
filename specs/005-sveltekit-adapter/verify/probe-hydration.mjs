import { createRequire } from "node:module";
const require = createRequire("/Users/abk/Developer/akollegger/graph-web/packages/web/package.json");
const { chromium } = require("@playwright/test");
const b = await chromium.launch();
for (const v of ["iy", "ix"]) {
  const p = await b.newPage(); const logs = [];
  p.on("console", (m) => logs.push(m.type() + ": " + m.text().slice(0, 140)));
  await p.goto("http://127.0.0.1:5421/" + v); await p.waitForFunction(() => document.querySelector("#found")?.textContent !== "…");
  const found = await p.locator("#found").textContent();
  const sizes = (await p.evaluate(() => performance.getEntriesByType("resource").filter((r) => /\.js$/.test(r.name)).reduce((n, r) => n + r.transferSize, 0)));
  console.log(JSON.stringify({ v, elementsAfterHydration: found, logs, jsBytes: sizes }));
  await p.close();
}
await b.close();
