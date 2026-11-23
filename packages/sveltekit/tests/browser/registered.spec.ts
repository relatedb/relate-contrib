// covers: FR-005, FR-006, FR-016, FR-017, FR-026, SC-001, SC-008
import { builds, origin } from "./builds.js";
import { expect, hydrationProblems, test } from "./fixtures.js";

for (const build of builds({ base: true })) {
  const root = origin(build);
  test.describe(`registered graph, ${build.name}`, () => {
    test("a page shows its placeholder in the server markup, then the registered graph's result, with no hydration warning", async ({ page }) => {
      const problems = hydrationProblems(page);
      const raw = await (await page.request.get(`${root}/page-1.html`)).text();
      expect(raw).toContain("data-rel-status");
      expect(raw).toMatch(/<a [^>]*data-rel-link[^>]*href="[^"]*page-2\.html"/);
      expect(raw).toMatch(/data-rel-count[^>]*>…</);
      await page.goto(`${root}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      await expect(page.locator("[data-rel-status]")).toHaveText("ready");
      expect(problems).toEqual([]);
    });

    test("the descriptor and the data file are published, anything undeclared is not found, and only the declared index exists", async ({ page }) => {
      const descriptor = await (await page.request.get(`${root}/relate/example/descriptor.json`)).json();
      expect(descriptor).toMatchObject({ version: 1, id: "example", indexes: [{ label: "Page", property: "id" }] });
      expect(descriptor.revision).toMatch(/^[0-9a-f]{12}$/);
      expect(descriptor.data).toMatchObject({ nodes: 300, links: 1500 });
      expect(descriptor.data.url).toBe(`${build.base ?? ""}/relate/example/graph.${descriptor.revision}.json`);
      const data = await page.request.get(origin(build).replace(build.base ?? "", "") + descriptor.data.url);
      expect(data.status()).toBe(200);
      expect((await data.json()).nodes).toHaveLength(300);
      expect((await page.request.get(`${root}/relate/nothing/descriptor.json`)).status()).toBe(404);
      expect((await page.request.get(`${root}/relate/example/graph.000000000000.json`)).status()).toBe(404);
      await page.goto(`${root}/page-1.html`);
      await expect(page.locator("[data-rel-status]")).toHaveText("ready", { timeout: 60_000 });
      const indexes = await page.evaluate(async () => {
        const r = await (window as any).__rel.client.query("SHOW INDEXES WHERE type <> 'LOOKUP'");
        return r.rows.map((x: any) => ({ labels: x.labelsOrTypes, properties: x.properties }));
      });
      expect(indexes).toEqual([{ labels: ["Page"], properties: ["id"] }]);
    });

    test("the engine's binary and the core's worker load from the site's own files, with no configuration", async ({ page }) => {
      const requested: string[] = [];
      page.on("request", (r) => /\.wasm$|worker-[\w-]+\.js$/.test(new URL(r.url()).pathname) && requested.push(new URL(r.url()).pathname));
      await page.goto(`${root}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 60_000 });
      expect(requested.some((p) => /_app\/immutable\/assets\/relate_bg\.[\w-]+\.wasm$/.test(p))).toBe(true);
      expect(requested.some((p) => /_app\/immutable\/workers\/worker-[\w-]+\.js$/.test(p))).toBe(true);
    });
  });
}

for (const build of builds({ dev: true })) {
  test(`in the development server a registered graph loads and answers a query (${build.name})`, async ({ page }) => {
    await page.goto(`${origin(build)}/page-1.html`);
    await expect(page.locator("[data-rel-count]")).toHaveText("300", { timeout: 120_000 });
    await expect(page.locator("[data-rel-status]")).toHaveText("ready");
  });
}
