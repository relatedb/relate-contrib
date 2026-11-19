import { defineConfig, devices } from "@playwright/test";

// The conformance site is built once (a clean build, so no stale loader output, research V-4) and served as static files.
export const SITE = { port: 5380, origin: "http://127.0.0.1:5380" };

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: process.env.CI ? 3 : 1, // the tests keep no state between them; a runner has cores to use
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: process.env.REL_REPORT ?? "reports/playwright.json" }]],
  use: { trace: process.env.CI ? "retain-on-failure" : "off", screenshot: process.env.CI ? "only-on-failure" : "off" }, // a failure on a runner leaves its trace to read
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: `cd conformance-site && pnpm run build && node serve.mjs dist ${SITE.port}`,
    url: `${SITE.origin}/blank.html`,
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
