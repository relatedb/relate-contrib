import { defineConfig, devices } from "@playwright/test";

const MULTI = 5180;
const ROUTED = 5181;

// The conformance site is built once per profile and served from its own output directory.
const serve = (navigation: string, port: number) => ({
  command: `NAVIGATION=${navigation} pnpm exec astro build --root conformance-site && NAVIGATION=${navigation} pnpm exec astro preview --root conformance-site --port ${port} --host 127.0.0.1`,
  url: `http://127.0.0.1:${port}/blank.html`,
  reuseExistingServer: true,
  timeout: 300_000,
});

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: process.env.GW_REPORT ?? "reports/playwright.json" }]],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [serve("multi-page", MULTI), serve("client-routing", ROUTED)],
});
