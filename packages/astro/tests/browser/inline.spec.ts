// covers: FR-013, FR-015
import { expect, test } from "./fixtures.js";

const sites = { "multi-page": "http://127.0.0.1:5180", "client-routing": "http://127.0.0.1:5181" } as const;
const trap = `RETURN ${"(".repeat(1000)}1${")".repeat(1000)} AS x`;

type Win = { __relClients: Record<string, { generation: number; query(s: string): Promise<{ rows: Array<Record<string, unknown>> }> }> };

for (const [profile, base] of Object.entries(sites)) {
  test(`an inline graph loads from the page and answers a query, with its index only, under ${profile}`, async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(new URL(r.url()).pathname));
    await page.goto(`${base}/inline.html?navigation=${profile}`);
    await expect(page.locator('[data-inline-count="notebook"]')).toHaveText("12");
    expect(requests.filter((p) => p.startsWith("/_relate/"))).toEqual([]); // no descriptor and no data request
    const indexes = await page.evaluate(async () => (await (window as unknown as Win).__relClients.notebook!.query("SHOW INDEXES")).rows.map((r) => r.properties));
    expect(indexes).toEqual([["id"]]);

    // an inline graph has no stored copy: loading the page again replays it from the page
    await page.reload();
    await expect(page.locator('[data-inline-count="notebook"]')).toHaveText("12");
    expect(requests.filter((p) => p.startsWith("/_relate/"))).toEqual([]);
  });

  test(`two inline graphs on one page are independent clients, under ${profile}`, async ({ page }) => {
    await page.goto(`${base}/two-graphs.html?navigation=${profile}`);
    await expect(page.locator('[data-inline-count="alpha"]')).toHaveText("5");
    await expect(page.locator('[data-inline-count="beta"]')).toHaveText("7");
    // crash alpha's instance
    await page.evaluate((statement) => (window as unknown as Win).__relClients.alpha!.query(statement).catch(() => undefined), trap);
    await expect(page.locator('[data-inline-generation="alpha"]')).toHaveText("2", { timeout: 60_000 });
    await expect(page.locator('[data-inline-count="alpha"]')).toHaveText("5");
    await expect(page.locator('[data-inline-generation="beta"]')).toHaveText("1");
    await expect(page.locator('[data-inline-count="beta"]')).toHaveText("7");
  });

  test(`a page builds its graph from its own content entry, under ${profile}`, async ({ page }) => {
    await page.goto(`${base}/recipes/soup.html?navigation=${profile}`);
    await expect(page.locator('[data-inline-count="steps"]')).toHaveText("3");
    await page.goto(`${base}/recipes/bread.html?navigation=${profile}`);
    await expect(page.locator('[data-inline-count="steps"]')).toHaveText("4");
  });
}
