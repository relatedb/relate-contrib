// covers: SC-008, FR-017, FR-024
import { BUILDS } from "../../playwright.config.js";
import { expect, test } from "./fixtures.js";

const only = process.env.GW_ONLY?.split(",");
const PAGES = ["/index.html", "/page-1.html", "/page-2.html", "/notes.html", "/broken.html", "/blank.html", "/inline.html", "/two-graphs.html", "/lifetime-a.html", "/lifetime-b.html", "/lifetime-c.html", "/direct.html", "/recipes/soup", "/figures/inline/20"];

// The server's markup shows the page's own text, its links and its placeholder before any script runs, and the browser
// hydrates it with no warning.
for (const build of BUILDS.filter((b) => (!only || only.includes(b.name)) && !b.dev && !b.base)) {
  test(`every conformance page renders without a hydration warning, ${build.name}`, async ({ page }) => {
    const origin = `http://127.0.0.1:${build.port}`;
    const problems: string[] = [];
    page.on("console", (m) => /hydrat|did not match|\b418\b|\b419\b|\b423\b/i.test(m.text()) && problems.push(`${m.text()}`));
    page.on("pageerror", (e) => problems.push(e.message));
    for (const path of PAGES) {
      const raw = await (await page.request.get(origin + path)).text();
      expect(raw, path).toMatch(/<h1[^>]*data-gw-title/);
      expect(raw, path).toMatch(/<a [^>]*data-gw-link/);
      if (["/index.html", "/page-1.html", "/page-2.html", "/notes.html", "/broken.html"].includes(path)) expect(raw, path).toMatch(/data-gw-status[^>]*>loading</);
      await page.goto(origin + path);
      await page.waitForTimeout(800); // long enough for hydration and the first effects
    }
    expect(problems).toEqual([]);
  });
}
