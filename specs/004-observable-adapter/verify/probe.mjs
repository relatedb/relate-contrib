import {createRequire} from "node:module";
const require = createRequire(new URL("../../../packages/web/package.json", import.meta.url));
const {chromium, firefox, webkit} = require("@playwright/test");
for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  const browser = await type.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  page.on("pageerror", (e) => logs.push("pageerror " + e.message));
  const reqs = [];
  page.on("request", (r) => /relate|g\.graph/.test(r.url()) && reqs.push(r.url().split("/").slice(-2).join("/")));
  await page.goto("http://127.0.0.1:5392/index.html");
  const out = await page.locator("#out").textContent({timeout: 20000}).catch((e) => "NO #out: " + (logs.join(" | ") || e.message));
  console.log(name, JSON.stringify(out), reqs.join(" "));
  await browser.close();
}
