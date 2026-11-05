// covers: FR-005, FR-006, FR-016, FR-017, FR-024, SC-008
import { BUILDS } from "../../playwright.config.js";
import { expect, test } from "./fixtures.js";

const only = process.env.REL_ONLY?.split(",");
for (const build of BUILDS.filter((b) => (!only || only.includes(b.name)) && !b.dev && !b.base)) {
  const origin = `http://127.0.0.1:${build.port}`;
  test.describe(`registered graph, ${build.name}`, () => {
    test("a page shows its placeholder, then the registered graph's result, with no hydration warning", async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (m) => {
        if (/hydrat|did not match|418|419|423/i.test(m.text())) problems.push(m.text());
      });
      page.on("pageerror", (e) => problems.push(e.message));
      // the server's markup, before any script
      const raw = await (await page.request.get(`${origin}/page-1.html`)).text();
      expect(raw).toContain("data-rel-status");
      expect(raw).toMatch(/<a [^>]*data-rel-link[^>]*href="\/page-2\.html"/);
      expect(raw).toMatch(/data-rel-count[^>]*>…</);
      await page.goto(`${origin}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await expect(page.locator("[data-rel-status]")).toHaveText("ready");
      expect(problems).toEqual([]);
    });

    test("the descriptor and the data file are published, and anything undeclared is not found", async ({ page }) => {
      const descriptor = await (await page.request.get(`${origin}/relate-web/example/descriptor.json`)).json();
      expect(descriptor).toMatchObject({ version: 1, id: "example", indexes: [{ label: "Page", property: "id" }] });
      expect(descriptor.revision).toMatch(/^[0-9a-f]{12}$/);
      expect(descriptor.data).toMatchObject({ nodes: 300, links: 1500 });
      expect(descriptor.data.url).toBe(`/relate-web/example/graph.${descriptor.revision}.json`);
      const data = await page.request.get(origin + descriptor.data.url);
      expect(data.status()).toBe(200);
      expect((await data.json()).nodes).toHaveLength(300);
      expect((await page.request.get(`${origin}/relate-web/nothing/descriptor.json`)).status()).toBe(404);
      expect((await page.request.get(`${origin}/relate-web/example/graph.000000000000.json`)).status()).toBe(404);
    });
  });
}
