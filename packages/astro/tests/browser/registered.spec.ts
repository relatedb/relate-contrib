// covers: FR-012, FR-017, FR-024, SC-008
import { expect, test } from "./fixtures.js";

const sites = { "multi-page": "http://127.0.0.1:5180", "client-routing": "http://127.0.0.1:5181" } as const;

for (const [profile, base] of Object.entries(sites)) {
  test(`a page shows its placeholder, then the registered graph's result, under ${profile}`, async ({ page }) => {
    // the page as served has its links and status placeholder, before any script runs
    const raw = await (await page.request.get(`${base}/page-1.html`)).text();
    expect(raw).toContain("data-gw-link");
    expect(raw).toMatch(/<span data-gw-status[^>]*>loading</);

    await page.goto(`${base}/page-1.html?navigation=${profile}`);
    await page.waitForFunction(() => document.documentElement.dataset.gwState === "ready", undefined, { timeout: 60_000 });
    await expect(page.locator("[data-gw-count]")).toHaveText("300");

    // the index named in the configuration exists, and no other
    const indexes = await page.evaluate(async () => {
      const gw = (window as unknown as { __gw: { client: { query(s: string): Promise<{ rows: Array<{ properties: string[] }> }> } } }).__gw;
      return (await gw.client.query("SHOW INDEXES")).rows.map((r) => r.properties);
    });
    expect(indexes).toEqual([["id"]]);
  });
}

test("the descriptor and the data file are published beside the pages", async ({ page }) => {
  const d = await (await page.request.get("http://127.0.0.1:5180/_related/example/descriptor.json")).json();
  expect(d).toMatchObject({ version: 1, id: "example", data: { nodes: 300, links: 1500 } });
  const data = await page.request.get(`http://127.0.0.1:5180${d.data.url}`);
  expect(data.status()).toBe(200);
  expect(data.headers()["content-type"]).toContain("application/json");
});
