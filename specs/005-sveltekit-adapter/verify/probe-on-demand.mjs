import { createRequire } from "node:module";
const require = createRequire("/Users/abk/Developer/akollegger/graph-web/packages/web/package.json");
const { chromium, firefox, webkit } = require("@playwright/test");
for (const [name, type] of Object.entries({ chromium, firefox, webkit })) {
  const b = await type.launch(); const p = await b.newPage(); const logs = [];
  p.on("console", (m) => /warn|error|hydrat|mismatch/i.test(m.type() + m.text()) && logs.push(m.text().slice(0, 140)));
  await p.goto("http://127.0.0.1:5422/live"); await p.waitForFunction(() => document.querySelector("#count")?.textContent === "3", null, { timeout: 30000 }).catch(() => logs.push("count never 3"));
  console.log(JSON.stringify({ name, count: await p.locator("#count").textContent(), first: await p.locator("#first").textContent(), logs }));
  await b.close();
}
