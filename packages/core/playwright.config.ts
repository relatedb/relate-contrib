import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
const EXAMPLE_PORT = 5175;

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: process.env.GW_REPORT ?? "reports/playwright.json" }]],
  use: { baseURL: `http://localhost:${PORT}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      command: `pnpm run build && pnpm exec vite --config tests/browser/harness/vite.config.ts --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/index.html`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // The example site, for the conformance check (it imports the built package, which the first server builds).
      command: `pnpm exec vite --config conformance/example-site/vite.config.ts --port ${EXAMPLE_PORT} --strictPort`,
      url: `http://localhost:${EXAMPLE_PORT}/index.html`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
