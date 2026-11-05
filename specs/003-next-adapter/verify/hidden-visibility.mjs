import { chromium, firefox, webkit } from "/Users/abk/Developer/akollegger/graph-web/design/spikes/SPIKE-006-nextjs-embedding/next-core/node_modules/@playwright/test/index.mjs";
for (const [name, t] of Object.entries({ chromium, firefox, webkit })) {
  const b = await t.launch(); const p = await b.newPage();
  await p.goto(process.argv[2] + "/hide/a"); await p.waitForSelector('[data-holder="a"]');
  await p.click('nav a:has-text("b")'); await p.waitForFunction(() => document.querySelector("h1:not([hidden])")?.textContent === "b");
  await p.click('nav a:has-text("a")'); await p.waitForFunction(() => [...document.querySelectorAll("h1")].some((h) => h.textContent === "a" && h.checkVisibility?.()));
  const out = await p.evaluate(() => [...document.querySelectorAll("script[data-related-graph]")].map((s) => ({ page: s.textContent, parentVisible: s.parentElement.checkVisibility?.(), inHiddenAttr: !!s.closest("[hidden]"), parentDisplay: getComputedStyle(s.parentElement).display, hasCheck: typeof Element.prototype.checkVisibility })));
  console.log(name.padEnd(9), JSON.stringify(out));
  await b.close();
}
