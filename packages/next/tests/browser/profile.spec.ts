// covers: FR-002, FR-010, FR-016, FR-023
import { builds } from "./builds.js";
import { expect, test } from "./fixtures.js";

const selected = builds({ cache: false, base: true });

for (const build of selected) {
  const base = `http://127.0.0.1:${build.port}${build.base ?? ""}`;
  test.describe(`profile and location, ${build.name}`, () => {
    test("the core receives the profile the site configured, and an override changes only the profile", async ({ page }) => {
      await page.goto(`${base}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300");
      await expect(page.locator("[data-rel-profile]")).toHaveText(build.navigation === "client-routing" ? "persistent" : "per-page");
      const other = build.navigation === "client-routing" ? "multi-page" : "client-routing";
      await page.goto(`${base}/page-1.html?navigation=${other}`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300");
      await expect(page.locator("[data-rel-profile]")).toHaveText(other === "client-routing" ? "persistent" : "per-page");
    });

    test("the descriptor is requested under the base path, and a descriptor override requests that location instead", async ({ page }) => {
      const requests: string[] = [];
      page.on("request", (r) => requests.push(new URL(r.url()).pathname));
      await page.goto(`${base}/page-1.html`);
      await expect(page.locator("[data-rel-count]")).toHaveText("300");
      const prefix = build.base ?? "";
      expect(requests.filter((p) => p.endsWith("descriptor.json"))).toEqual([`${prefix}/relate-web/example/descriptor.json`]);
      expect(requests.filter((p) => /graph\.[0-9a-f]{12}\.json$/.test(p))).toHaveLength(1);
      expect(requests.find((p) => /graph\.[0-9a-f]{12}\.json$/.test(p))!.startsWith(`${prefix}/relate-web/example/`)).toBe(true);
      if (build.base) return; // the static descriptors of the other variants are served from the site's root
      requests.length = 0;
      await page.goto(`${base}/page-1.html?variant=b`);
      await expect(page.locator("[data-rel-count]")).toHaveText("400");
      expect(requests.filter((p) => /descriptor[^/]*\.json$/.test(p))).toEqual(["/descriptor-b.json"]);
      expect(requests.some((p) => p.startsWith("/relate-web/example/descriptor"))).toBe(false);
    });
  });
}
