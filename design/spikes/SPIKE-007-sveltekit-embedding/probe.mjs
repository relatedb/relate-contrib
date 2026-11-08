// Probe a running SvelteKit spike app in the three browsers: node probe.mjs <baseUrl> [browsers]
//   placement: the visit client answers a query, and where the binary and worker were requested from
//   navigation: the same client and worker across link clicks, goto, history; a reload and a link outside the app end it
//   rendering: the server's markup for /early, the client's, and any warnings
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../packages/web/package.json", import.meta.url));
const { chromium, firefox, webkit } = require("@playwright/test");
const [, , base, only] = process.argv;
const types = { chromium, firefox, webkit };
const names = (only ?? "chromium,firefox,webkit").split(",");

for (const name of names) {
  const browser = await types[name].launch();
  const context = name === "webkit" ? await browser.newContext() : await browser.newContext();
  const page = await context.newPage();
  const notes = [];
  const requests = [];
  page.on("console", (m) => /hydrat|mismatch|warn|error/i.test(m.type() + m.text()) && notes.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => notes.push("pageerror: " + e.message.slice(0, 200)));
  page.on("request", (r) => /wasm|worker/i.test(r.url()) && requests.push(new URL(r.url()).pathname));
  page.on("response", (r) => r.status() >= 400 && notes.push(`status ${r.status()} ${new URL(r.url()).pathname}`));
  await page.addInitScript(() => {
    const Native = window.Worker;
    const state = (window.__workers = { created: 0, terminated: 0 });
    window.Worker = class extends Native {
      constructor(u, o) { super(u, o); state.created++; }
      terminate() { state.terminated++; super.terminate(); }
    };
  });
  const out = { browser: name };
  const text = (sel) => page.locator(sel).first().textContent({ timeout: 20000 });
  const ready = async () => { await page.waitForFunction(() => document.querySelector("#count")?.textContent === "3", null, { timeout: 30000 }); };
  const here = () => page.evaluate(() => ({ created: window.__rel?.created.count, gen: window.__rel?.client.generation, workers: window.__workers.created - window.__workers.terminated }));
  try {
    await page.goto(base + "/");
    await ready();
    out.placement = { count: await text("#count"), requests: [...new Set(requests)] };
    const first = await here();
    const steps = [];
    for (const label of ["A", "B", "Home"]) {
      await page.locator("nav a", { hasText: new RegExp(`^${label}$`) }).click();
      await ready();
      steps.push([label, await here()]);
    }
    await page.goBack(); await ready(); steps.push(["back", await here()]);
    await page.goForward(); await ready(); steps.push(["forward", await here()]);
    await page.evaluate(() => window.__goto("a")); await ready(); steps.push(["goto", await here()]);
    out.navigation = { first, steps, sameClient: steps.every(([, s]) => s.created === first.created && s.workers === first.workers) };
    await page.locator("nav a", { hasText: "Early" }).click();
    out.afterEarly = await text("#mounted");
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#mounted")?.textContent === "yes", null, { timeout: 20000 });
    out.reload = await here().catch(() => "no client on /early after reload (expected: the page does not open one)");
    await page.goto(base + "/");
    await ready();
    out.beforeOutside = await here();
    await page.locator("nav a", { hasText: "Outside" }).click();
    await page.waitForURL("**/outside.html");
    out.outside = await page.evaluate(() => ({ url: location.pathname, hasClient: !!window.__rel, workers: window.__workers.created }));
    const raw = await (await context.request.get(base + "/early")).text();
    out.rendering = { serverMarkup: (raw.match(/id="early">([^<]*)</) ?? [])[1], serverMounted: (raw.match(/id="mounted">([^<]*)</) ?? [])[1] };
    await page.goto(base + "/early");
    await page.waitForFunction(() => document.querySelector("#mounted")?.textContent === "yes", null, { timeout: 20000 });
    out.rendering.clientEarly = await text("#early");
    out.rendering.effectRan = await page.evaluate(() => !!window.__effectRan);
  } catch (e) {
    out.error = String(e).slice(0, 300);
  }
  out.notes = [...new Set(notes)].slice(0, 8);
  console.log(JSON.stringify(out));
  await browser.close();
}
