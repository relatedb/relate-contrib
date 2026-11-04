// covers: FR-004, FR-023, FR-026
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./fixtures.js";
import { spawnDev } from "../helpers/build-site.js";

const site = join(dirname(fileURLToPath(import.meta.url)), "../../conformance-site");
const sites = { "multi-page": "http://127.0.0.1:5180", "client-routing": "http://127.0.0.1:5181" } as const;

/** Load a page of a development server and return the console warnings of this adapter. */
async function warningsFor(page: import("@playwright/test").Page, env: Record<string, string>): Promise<string[]> {
  const dev = await spawnDev(site, env);
  try {
    const warnings: string[] = [];
    page.on("console", (m) => m.type() === "warning" && m.text().includes("related-web-astro") && warnings.push(m.text()));
    await page.goto(`${dev.url}/page-1.html`);
    // ready: the page keeps using the server until its graph has loaded
    await page.waitForFunction(() => document.documentElement.dataset.gwState === "ready", undefined, { timeout: 120_000 });
    return warnings;
  } finally {
    await dev.stop();
  }
}

test.describe("the development check of the navigation setting", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "the check is a console message; one browser shows it");
  test.setTimeout(240_000);

  test('client-routing without the router warns', async ({ page }) => {
    const warnings = await warningsFor(page, { NAVIGATION: "client-routing", ROUTER: "off" });
    expect(new Set(warnings).size).toBe(1); // the development server may reload the page once after optimizing dependencies
    expect(warnings[0]).toMatch(/"client-routing" but this page has no ClientRouter/);
  });

  test("multi-page with the router warns, and the site still works", async ({ page }) => {
    const warnings = await warningsFor(page, { NAVIGATION: "multi-page", ROUTER: "on" });
    expect(new Set(warnings).size).toBe(1);
    expect(warnings[0]).toMatch(/"multi-page" but this page has ClientRouter/);
    await expect(page.locator("[data-gw-count]")).toHaveText("300", { timeout: 60_000 });
  });

  test("a setting that agrees with the router is silent", async ({ page }) => {
    expect(await warningsFor(page, { NAVIGATION: "client-routing" })).toEqual([]);
  });
});

test("a production build carries no warning code", () => {
  for (const profile of Object.keys(sites)) {
    const dir = join(site, `dist-${profile}/_astro`);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(join(dir, file), "utf8"), `${profile}/${file}`).not.toContain("but this page has");
    }
  }
});

test("the profile override changes the core's profile and leaves the router alone", async ({ page }) => {
  await page.goto(`${sites["client-routing"]}/page-1.html?navigation=multi-page`);
  await page.waitForFunction(() => document.documentElement.dataset.gwState === "ready");
  await expect(page.locator("[data-gw-profile]")).toHaveText("per-page");
  expect(await page.locator('meta[name="astro-view-transitions-enabled"]').count()).toBe(1); // the router is still there
});
