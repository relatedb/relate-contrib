// Programmatic navigation, a navigation while a query is in flight, and a navigation while the worker is loading.
import { chromium, firefox, webkit } from "@playwright/test";
const [base = "http://localhost:3100", which = "chromium"] = process.argv.slice(2);
const browser = await { chromium, firefox, webkit }[which].launch();
const page = await browser.newPage();
const read = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-k]")].map((e) => [e.dataset.k, e.textContent])));
const until = (where, ready = true) => page.waitForFunction(([w, r]) => document.querySelector('[data-k="where"]')?.textContent === w && (!r || (document.querySelector('[data-k="status"]')?.textContent === "ready" && document.querySelector('[data-k="count"]')?.textContent !== "…")), [where, ready], { timeout: 30000 });
const show = async (label) => console.log(label.padEnd(26), JSON.stringify(await read()));

await page.goto(base + "/c"); await until("c"); await show("load /c");
await page.click('[data-act="push"]'); await until("a"); await show("router.push /a");
await page.goto(base + "/c"); await until("c"); await show("load /c again");
await page.click('[data-act="replace"]'); await until("b"); await show("router.replace /b");

// In flight: the runaway statement on 300 pages is 27M rows; navigation must not end the worker.
await page.goto(base + "/c"); await until("c");
await show("load /c (before query)");
await page.click('[data-act="inflight"]'); await until("a", false); await show("pushed during query");
await page.waitForFunction(() => document.body.innerText.length > 0);
console.log("  (inflight result is on page /c, which unmounted; checking worker alive)");
await until("a"); await show("a ready after query");

// While loading: delay the data file, click a link before the status is ready.
const page2 = await browser.newPage();
await page2.route("**/graph.json", async (r) => { await new Promise((s) => setTimeout(s, 2500)); r.continue(); });
await page2.goto(base + "/");
await page2.waitForFunction(() => document.querySelector('[data-k="module"]')?.textContent !== "…");
const early = await page2.evaluate(() => document.querySelector('[data-k="status"]')?.textContent);
await page2.click('nav a:has-text("a")');
await page2.waitForFunction(() => document.querySelector('[data-k="where"]')?.textContent === "a");
await page2.waitForFunction(() => document.querySelector('[data-k="status"]')?.textContent === "ready", null, { timeout: 30000 });
console.log("navigate while loading".padEnd(26), "status at click:", early, JSON.stringify(await page2.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-k]")].map((e) => [e.dataset.k, e.textContent])))));
await browser.close();
