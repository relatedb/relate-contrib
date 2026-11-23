// covers: FR-013, FR-015, FR-018, FR-021, SC-003, SC-006
import { builds, origin } from "./builds.js";
import { expect, hydrationProblems, test } from "./fixtures.js";

const NOTE = "</script><b>x</b> & <!-- y";

for (const build of builds()) {
  const root = origin(build);
  test.describe(`inline graphs, ${build.name}`, () => {
    test("an inline graph loads and answers a query with no descriptor or data request, and its element stays after hydration", async ({ page }) => {
      const problems = hydrationProblems(page);
      const graphRequests: string[] = [];
      page.on("request", (r) => /\/relate\//.test(r.url()) && graphRequests.push(r.url()));
      await page.goto(`${root}/inline-a.html`);
      await expect(page.locator("[data-inline-count]")).toHaveText("20", { timeout: 60_000 });
      await expect(page.locator("script[data-relate-graph]")).toHaveCount(1);
      expect(graphRequests).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("an index named in `config` is created and none otherwise", async ({ page }) => {
      const indexes = (id: string) =>
        page.evaluate(async (graph) => (await (window as any).__relClients[graph].query("SHOW INDEXES WHERE type <> 'LOOKUP'")).rows.map((r: any) => `${r.labelsOrTypes}.${r.properties}`), id);
      await page.goto(`${root}/inline-a.html`);
      await expect(page.locator("[data-inline-count]")).toHaveText("20", { timeout: 60_000 });
      expect(await indexes("g")).toEqual(["Item.id"]);
      await page.goto(`${root}/inline-b.html`);
      await expect(page.locator("[data-inline-count]")).toHaveText("3", { timeout: 60_000 });
      expect(await indexes("g")).toEqual([]);
    });

    test("text with </script>, <!-- and & reads back as written", async ({ page }) => {
      await page.goto(`${root}/inline-b.html`);
      await expect(page.locator("[data-inline-note]")).toHaveText(NOTE, { timeout: 60_000 });
    });

    test("navigating from one inline page to the other and back leaves one element and each page queries its own content", async ({ page }) => {
      await page.goto(`${root}/inline-a.html`);
      await expect(page.locator("[data-inline-count]")).toHaveText("20", { timeout: 60_000 });
      await page.locator("a[data-rel-link]", { hasText: "Inline B" }).first().click();
      await expect(page.locator("[data-inline-count]")).toHaveText("3", { timeout: 60_000 });
      await expect(page.locator("[data-inline-note]")).toHaveText(NOTE);
      await expect(page.locator("script[data-relate-graph]")).toHaveCount(1);
      await page.goBack();
      await expect(page.locator("[data-inline-count]")).toHaveText("20", { timeout: 60_000 });
      await expect(page.locator("script[data-relate-graph]")).toHaveCount(1);
    });

    test("a reload replays the graph from the page", async ({ page }) => {
      await page.goto(`${root}/inline-b.html`);
      await expect(page.locator("[data-inline-count]")).toHaveText("3", { timeout: 60_000 });
      await page.reload();
      await expect(page.locator("[data-inline-count]")).toHaveText("3", { timeout: 60_000 });
    });

    test("two inline graphs on one page are independent clients: a crash in one leaves the other's generation alone", async ({ page }) => {
      await page.goto(`${root}/two-graphs.html`);
      const first = page.locator("[data-inline-name]", { hasText: "first" }).locator("..");
      const second = page.locator("[data-inline-name]", { hasText: "second" }).locator("..");
      await expect(first.locator("[data-inline-count]")).toHaveText("20", { timeout: 60_000 });
      await expect(second.locator("[data-inline-count]")).toHaveText("5", { timeout: 60_000 });
      await page.locator("[data-trap-first]").click();
      await expect(first.locator("[data-inline-generation]")).toHaveText("2", { timeout: 60_000 });
      await expect(first.locator("[data-inline-count]")).toHaveText("20");
      await expect(second.locator("[data-inline-generation]")).toHaveText("1");
    });
  });
}
