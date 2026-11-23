// covers: FR-013, FR-014, FR-015, FR-021, SC-008
import { builds, selected } from "./builds.js";
import { expect, test } from "./fixtures.js";

const trap = `RETURN ${"1+".repeat(200000)}1 AS x`;
type Win = { __relClients: Record<string, { generation: number; query(s: string): Promise<{ rows: Array<Record<string, unknown>> }> }> };

for (const build of builds({ cache: false })) {
  const base = `http://127.0.0.1:${build.port}`;
  test.describe(`inline graphs, ${build.name}`, () => {
    test("an inline graph loads from the page and answers a query, with its index only, and a reload replays it", async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (m) => /hydrat|did not match/i.test(m.text()) && problems.push(m.text()));
      const requests: string[] = [];
      page.on("request", (r) => requests.push(new URL(r.url()).pathname));
      await page.goto(`${base}/inline.html`);
      await expect(page.locator('[data-inline-count="notebook"]:visible')).toHaveText("12");
      expect(requests.filter((p) => p.startsWith("/relate/"))).toEqual([]); // no descriptor and no data request
      await page.waitForFunction(() => !!(window as unknown as Partial<Win>).__relClients?.notebook);
      const indexes = await page.evaluate(async () => (await (window as unknown as Win).__relClients.notebook!.query("SHOW INDEXES WHERE type <> 'LOOKUP'")).rows.map((r) => r.properties));
      expect(indexes).toEqual([["id"]]);
      await page.reload();
      await expect(page.locator('[data-inline-count="notebook"]:visible')).toHaveText("12");
      expect(requests.filter((p) => p.startsWith("/relate/"))).toEqual([]);
      expect(problems).toEqual([]);
    });

    test("two inline graphs on one page are independent clients", async ({ page }) => {
      await page.goto(`${base}/two-graphs.html`);
      await expect(page.locator('[data-inline-count="alpha"]:visible')).toHaveText("5");
      await expect(page.locator('[data-inline-count="beta"]:visible')).toHaveText("7");
      await page.evaluate((statement) => (window as unknown as Win).__relClients.alpha!.query(statement).catch(() => undefined), trap);
      await expect(page.locator('[data-inline-generation="alpha"]:visible')).toHaveText("2", { timeout: 60_000 });
      await expect(page.locator('[data-inline-count="alpha"]:visible')).toHaveText("5");
      await expect(page.locator('[data-inline-generation="beta"]:visible')).toHaveText("1");
      await expect(page.locator('[data-inline-count="beta"]:visible')).toHaveText("7");
    });

    test("a page builds its graph from its own content entry, and the next page shows only its own", async ({ page }) => {
      await page.goto(`${base}/recipes/soup`);
      await expect(page.locator('[data-inline-count="steps"]:visible')).toHaveText("3");
      await page.getByRole("link", { name: "Bread" }).click();
      await expect(page.locator("[data-rel-title]:visible")).toHaveText("Bread");
      await expect(page.locator('[data-inline-count="steps"]:visible')).toHaveText("4");
    });
  });
}
