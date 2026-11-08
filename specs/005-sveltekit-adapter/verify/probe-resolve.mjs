import { createRequire } from "node:module";
const require = createRequire("/Users/abk/Developer/akollegger/graph-web/packages/web/package.json");
const { chromium } = require("@playwright/test");
const b = await chromium.launch(); const p = await b.newPage();
const logs = []; p.on("console", (m) => logs.push(m.type() + ": " + m.text().slice(0, 160)));
await p.goto("http://127.0.0.1:5420/docs/pkg"); await p.waitForTimeout(800);
const html = await (await p.request.get("http://127.0.0.1:5420/docs/pkg")).text();
console.log(JSON.stringify({ server: (html.match(/id="loc">([^<]*)/) ?? [])[1], client: await p.locator("#loc").textContent(), logs }));
await b.close();
